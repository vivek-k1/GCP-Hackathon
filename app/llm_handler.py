import json
import re
import textstat
from typing import Dict, Optional

import anthropic
from app.prompts import SONNET_SYSTEM_PROMPT, HAIKU_JUDGE_PROMPT
from app.cost_tracker import tracker

_client: Optional[anthropic.Anthropic] = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


def _extract_json(text: str) -> dict:
    """Extract JSON from LLM output, stripping any markdown fences."""
    text = text.strip()
    if not text:
        raise ValueError("LLM returned an empty response")
    # Strip ```json ... ``` fences if present
    fence_match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text)
    if fence_match:
        text = fence_match.group(1).strip()
    # Find the outermost { ... } block in case there's any preamble
    brace_match = re.search(r"\{[\s\S]+\}", text)
    if brace_match:
        text = brace_match.group(0)
    return json.loads(text)


def summarize_with_citations(
    bill_text: str,
    section_name: str,
    bill_name: str,
    custom_persona: str = "",
    user_question: str = "",
) -> Dict:
    """
    Call Claude Sonnet 4.6 to summarize a bill section.
    Returns {summary: dict, usage: dict}.
    user_question: echoed into system instructions so tl_dr / persona_impacts match the user's ask.
    """
    # Truncate very long sections to stay within token budget
    max_chars = 12_000
    if len(bill_text) > max_chars:
        bill_text = bill_text[:max_chars] + "\n[... text truncated for length ...]"

    # Compute grade level of source to include in context
    source_grade = textstat.flesch_kincaid_grade(bill_text[:2000])

    persona_instruction = ""
    uq = user_question.strip()
    if uq:
        persona_instruction = (
            f"\nThe user asked this specific question about the section — answer it in tl_dr, purpose, key_provisions, and persona_impacts. "
            f"USER QUESTION: {uq!r}"
        )
    if custom_persona.strip():
        persona_instruction += (
            f"\nSPECIAL INSTRUCTION: The user has described themselves as: \"{custom_persona}\". "
            "In persona_impacts[], include at least one entry specifically for this user. "
            "Use their exact description as the persona name. "
            "Make the impact as specific to their situation as possible."
        )

    response = _get_client().messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2500,
        temperature=0,
        system=SONNET_SYSTEM_PROMPT + (persona_instruction or ""),
        messages=[
            {
                "role": "user",
                "content": (
                    f"BILL: {bill_name}\n"
                    f"SECTION: {section_name}\n"
                    f"SOURCE GRADE LEVEL: {source_grade:.1f}\n\n"
                    f"TEXT:\n{bill_text}\n\n"
                    "Return ONLY valid JSON, no preamble."
                ),
            }
        ],
    )

    raw_text = response.content[0].text
    summary_json = _extract_json(raw_text)

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    tracker.log_call("claude-sonnet-4-6", usage["input_tokens"], usage["output_tokens"])

    return {"summary": summary_json, "usage": usage}


def verify_with_haiku(original_text: str, summary_json: dict) -> Dict:
    """
    Call Claude Haiku 4.5 to judge the faithfulness of a Sonnet summary.
    Returns {claims_scored, overall_faithfulness_score, red_flags, approval, requires_human_review}.
    """
    # Truncate original text to control input size
    max_chars = 4_000
    if len(original_text) > max_chars:
        original_text = original_text[:max_chars] + "\n[... truncated ...]"

    # Send only tl_dr + key_provisions to Haiku — not the full summary
    # This keeps output short and prevents mid-JSON truncation
    slim_summary = {
        "tl_dr": summary_json.get("tl_dr", ""),
        "purpose": summary_json.get("purpose", ""),
        "key_provisions": summary_json.get("key_provisions", [])[:4],  # max 4 provisions
    }

    response = _get_client().messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2000,
        temperature=0,
        system=HAIKU_JUDGE_PROMPT,
        messages=[
            {
                "role": "user",
                "content": (
                    f"ORIGINAL BILL TEXT:\n{original_text}\n\n"
                    f"SUMMARY TO VERIFY:\n{json.dumps(slim_summary, indent=2)}\n\n"
                    "Verify faithfulness. Output only JSON."
                ),
            }
        ],
    )

    raw_text = response.content[0].text
    judge = _extract_json(raw_text)

    usage = {
        "input_tokens": response.usage.input_tokens,
        "output_tokens": response.usage.output_tokens,
    }
    tracker.log_call("claude-haiku-4-5-20251001", usage["input_tokens"], usage["output_tokens"])

    judge["requires_human_review"] = judge.get("overall_faithfulness_score", 5.0) < 3.5
    judge["usage"] = usage
    return judge


if __name__ == "__main__":
    print("[OK] llm_handler loaded; Sonnet + Haiku ready.")
