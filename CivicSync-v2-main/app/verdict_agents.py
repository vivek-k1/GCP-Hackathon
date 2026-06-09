"""
Multi-perspective policy verdict agents.
Each agent reads only the pre-computed Sonnet summary (~400 tokens input).
Runs sequentially to stay within the 10K token org limit.
"""
import json
from typing import Dict, List, Generator
import anthropic
from app.cost_tracker import tracker

# Shared client (reuse from llm_handler pattern)
_client = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
    return _client


# ── Agent definitions ──────────────────────────────────────────────────────
AGENTS = [
    {
        "id": "economist",
        "label": "💰 Economist",
        "description": "Economic & fiscal impact",
        "prompt": """You are an economist specialising in Indian public policy and development economics.
You will receive a plain-language summary of an Indian law section.
Analyse it from a purely economic lens: fiscal cost, market distortions, incentive effects, impact on GDP, employment, investment, and consumer welfare.

Be neutral — neither pro-market nor pro-state. Flag both positive economic effects and potential harms.

OUTPUT ONLY THIS JSON (no preamble):
{
  "verdict": "positive|mixed|concern",
  "headline": "<one sentence, under 15 words, economic bottom line>",
  "positives": ["<economic benefit 1>", "<economic benefit 2>"],
  "concerns": ["<economic risk 1>", "<economic risk 2>"],
  "most_affected_sector": "<which industry or sector feels this most>",
  "fiscal_note": "<any cost to government or taxpayer, or 'No direct fiscal impact'>",
  "confidence": <0.0-1.0, how confident given available information>
}"""
    },
    {
        "id": "social_worker",
        "label": "👷 Social Worker",
        "description": "Impact on vulnerable groups",
        "prompt": """You are a senior social worker with 20 years of experience working with marginalised communities in India — daily wage workers, women, tribal populations, people with disabilities, the elderly, and migrants.
You will receive a plain-language summary of an Indian law section.
Analyse it for its impact on the most vulnerable people: who is protected, who is excluded, what gaps exist, and whether implementation will actually reach those who need it.

OUTPUT ONLY THIS JSON (no preamble):
{
  "verdict": "protective|mixed|exclusionary",
  "headline": "<one sentence, under 15 words, social impact bottom line>",
  "who_is_protected": ["<group 1>", "<group 2>"],
  "who_is_excluded": ["<group at risk of falling through the gaps>"],
  "implementation_gap": "<biggest risk that this law won't reach people on the ground>",
  "grassroots_note": "<what a village-level worker or NGO would flag>",
  "confidence": <0.0-1.0>
}"""
    },
    {
        "id": "legal_expert",
        "label": "⚖️ Legal Expert",
        "description": "Enforceability & legal gaps",
        "prompt": """You are a senior advocate practising constitutional and administrative law in India, with experience in the Supreme Court and High Courts.
You will receive a plain-language summary of an Indian law section.
Analyse it for legal robustness: is it constitutionally sound? Are key terms defined? Are enforcement mechanisms clear? What litigation is likely?

Do not give legal advice. Flag structural issues, vagueness, and likely court challenges.

OUTPUT ONLY THIS JSON (no preamble):
{
  "verdict": "robust|needs_clarification|legally_risky",
  "headline": "<one sentence, under 15 words, legal bottom line>",
  "strengths": ["<legally sound aspect 1>", "<legally sound aspect 2>"],
  "gaps": ["<undefined term or missing mechanism>", "<another gap>"],
  "likely_litigation": "<what kind of challenge is most likely in court>",
  "constitutional_note": "<any fundamental rights angle — Article 14, 19, 21, etc.>",
  "confidence": <0.0-1.0>
}"""
    },
    {
        "id": "rural_specialist",
        "label": "🌾 Rural / MSME lens",
        "description": "Rural households and small business compliance",
        "prompt": """You are a policy analyst focused on rural India, agriculture-linked livelihoods, informal workers, and MSME compliance burdens.
You will receive a plain-language summary of an Indian law section.
Analyse implementation realities away from metros: digital access, compliance costs for small operators, and whether provisions assume urban infrastructure.

OUTPUT ONLY THIS JSON (no preamble):
{
  "verdict": "business_friendly|neutral|burdensome",
  "headline": "<one sentence, under 15 words, rural/MSME bottom line>",
  "compliance_cost": "<estimated burden: low/medium/high and why for small actors>",
  "who_benefits": ["<who gains in tier-3 towns or villages>"],
  "who_struggles": ["<who is left out or overburdened>"],
  "ease_of_doing_business": "<effect on very small business and informal sector>",
  "msme_note": "<specific impact on micro and informal enterprises>",
  "confidence": <0.0-1.0>
}"""
    },
    {
        "id": "citizen",
        "label": "👤 Common Citizen",
        "description": "Plain-language daily life impact",
        "prompt": """You are a 35-year-old Indian citizen — educated but not a specialist, living in a Tier-2 city, working a regular job, with a family to support.
You will receive a plain-language summary of an Indian law section.
React to it from the perspective of an ordinary person: what does this actually mean for daily life? Is this good news or bad news? What would most people misunderstand about this?

Speak in plain, conversational English. No jargon. Think like a WhatsApp message to a friend.

OUTPUT ONLY THIS JSON (no preamble):
{
  "verdict": "good_news|neutral|bad_news",
  "headline": "<one sentence reaction, under 15 words, conversational tone>",
  "what_changes_for_me": ["<concrete daily life change 1>", "<concrete daily life change 2>"],
  "what_stays_same": "<what people think will change but won't>",
  "biggest_question": "<the thing an ordinary person would immediately ask about this>",
  "trust_level": "<would a typical Indian trust this law to be enforced? Why or why not?>",
  "confidence": <0.0-1.0>
}"""
    },
]


# ── Main runner ────────────────────────────────────────────────────────────
def run_verdict_agents(
    summary_json: dict,
    bill_name: str,
    user_query: str = "",
    reader_persona: str = "",
) -> Generator[Dict, None, None]:
    """
    Run verdict agents one by one (sequential).
    Yields each agent result as it completes — enables streaming UI updates.

    Each agent receives only the pre-verified Sonnet summary (~400 tokens),
    NOT the raw bill text, keeping each call well under 10K input tokens.

    user_query / reader_persona steer agents to address the user's question and selected persona.
    """
    slim = {
        "bill": bill_name,
        "tl_dr": summary_json.get("tl_dr", ""),
        "purpose": summary_json.get("purpose", ""),
        "key_provisions": [
            p.get("provision", "") for p in summary_json.get("key_provisions", [])
        ],
        "persona_impacts": [
            {"persona": i.get("persona"), "impact": i.get("concrete_impact")}
            for i in summary_json.get("persona_impacts", [])
        ],
        "ambiguities": [
            a.get("ambiguous_text", "") for a in summary_json.get("ambiguities", [])
        ],
    }
    payload = json.dumps(slim, indent=2)

    focus_lines: List[str] = []
    uq = (user_query or "").strip()
    rp = (reader_persona or "").strip()
    if uq:
        focus_lines.append(
            f"READER QUESTION (you MUST tie your JSON to this—headline, bullets, and examples): {uq}"
        )
    if rp and rp.lower() not in ("general user", "general", "other (custom)"):
        focus_lines.append(
            f"READER PERSONA (the user identified as: {rp}). Reflect this perspective in your analysis when relevant."
        )
    focus_block = ""
    if focus_lines:
        focus_block = "\n\n" + "\n".join(focus_lines)

    for agent in AGENTS:
        try:
            response = _get_client().messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=600,
                temperature=0,
                system=agent["prompt"],
                messages=[
                    {
                        "role": "user",
                        "content": (
                            "Analyse this law summary and return ONLY the JSON."
                            f"{focus_block}\n\n{payload}"
                        ),
                    }
                ],
            )
            raw = response.content[0].text.strip()

            # Strip markdown fences if present
            import re
            fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", raw)
            if fence:
                raw = fence.group(1)
            brace = re.search(r"\{[\s\S]+\}", raw)
            if brace:
                raw = brace.group(0)

            result = json.loads(raw)
            result["agent_id"] = agent["id"]
            result["agent_label"] = agent["label"]
            result["agent_description"] = agent["description"]

            usage = {
                "input_tokens": response.usage.input_tokens,
                "output_tokens": response.usage.output_tokens,
            }
            tracker.log_call("claude-haiku-4-5-20251001", usage["input_tokens"], usage["output_tokens"])
            result["_usage"] = usage

        except Exception as e:
            result = {
                "agent_id": agent["id"],
                "agent_label": agent["label"],
                "agent_description": agent["description"],
                "verdict": "error",
                "headline": f"Analysis unavailable: {str(e)[:60]}",
                "error": str(e),
            }

        yield result


def _extract_json_object_from_text(text: str) -> dict | None:
    """Parse a single JSON object from model output; tolerate markdown fences."""
    if not text or not text.strip():
        return None
    import re

    s = text.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", s)
    if fence:
        s = fence.group(1).strip()
    brace = re.search(r"\{[\s\S]+\}", s)
    if brace:
        s = brace.group(0)
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        return None


def _validate_structured_overall(d: dict) -> bool:
    if not isinstance(d, dict):
        return False
    if not isinstance(d.get("title"), str) or not str(d["title"]).strip():
        return False
    if not isinstance(d.get("takeaway"), str) or not str(d["takeaway"]).strip():
        return False
    secs = d.get("sections")
    if not isinstance(secs, list) or len(secs) < 1:
        return False
    for s in secs:
        if not isinstance(s, dict):
            return False
        if not str(s.get("title") or "").strip():
            return False
        body = s.get("body")
        bullets = s.get("bullets")
        if body is not None and not isinstance(body, str):
            return False
        if bullets is not None:
            if not isinstance(bullets, list):
                return False
            bullets = [b for b in bullets if str(b).strip()]
        if not (body and str(body).strip()) and not bullets:
            return False
    return True


def _compact_agent_for_synthesis(agent: Dict) -> Dict:
    """Drop token-heavy / internal fields; keep angles the synthesizer needs."""
    skip = {"_usage", "agent_description"}
    out: Dict = {}
    for k, v in agent.items():
        if k in skip:
            continue
        if isinstance(v, list) and len(v) > 4:
            out[k] = v[:4]
        else:
            out[k] = v
    return out


def synthesize_reader_overall(
    bill_name: str,
    user_query: str,
    reader_persona: str,
    summary_json: dict,
    agent_results: List[Dict],
) -> dict:
    """
    Structured answer to the user's question (JSON), using the law summary and
    all five expert angles. Tailored to reader_persona when non-empty.

    Returns {"structured": {...}} on success, or {"text": "..."} on failure / legacy.
    """
    slim_summary = {
        "tl_dr": summary_json.get("tl_dr", ""),
        "purpose": (summary_json.get("purpose") or "")[:1200],
        "key_provisions": [
            (p.get("provision", "") or "")[:400]
            for p in (summary_json.get("key_provisions") or [])[:5]
        ],
    }
    compact_agents = [
        _compact_agent_for_synthesis(a) for a in agent_results
    ]
    uq = (user_query or "").strip() or "(no specific question)"
    rp = (reader_persona or "").strip()
    persona_line = (
        f"The reader identified as: {rp}."
        if rp
        else "No specific persona was selected — write for a general reader."
    )

    user_block = f"""BILL: {bill_name}

USER QUESTION: {uq}

{persona_line}

LAW SNAPSHOT (from verified summary):
{json.dumps(slim_summary, indent=2, ensure_ascii=False)}

FIVE EXPERT PERSPECTIVES (JSON — use to see agreement, tension, and trade-offs):
{json.dumps(compact_agents, indent=2, ensure_ascii=False)}

Return ONE JSON object only (no markdown fences, no commentary) that matches the schema the system message describes."""

    try:
        response = _get_client().messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=2000,
            temperature=0.2,
            system="""You are a neutral civic education assistant for India. Output ONE JSON object only (valid UTF-8 JSON, no trailing commentary).

Schema (all string values in plain text, no markdown # headings inside strings — use sentence case titles only):
{
  "title": "Short question-style title, max 90 characters",
  "takeaway": "2-4 sentences that answer the user directly; if a persona is set, speak to that reader (e.g. student) in second person or clearly scoped terms.",
  "sections": [
    {
      "title": "Section heading e.g. What the law says",
      "body": "Optional paragraph. Omit or use empty string if using bullets only.",
      "bullets": ["optional list", "each a short factual point"]
    }
  ],
  "outlook": "Optional one short paragraph: uncertainty, what depends on rules/courts, or what to monitor. May be empty string if nothing to add."
}

Content rules:
- Use EXACTLY 2–4 items in "sections". Each must have a non-empty "title".
- For each section, provide meaningful content: either a non-empty "body" and/or a non-empty "bullets" array (at least one of them).
- Weave expert agreement and tension across sections; do not invent section numbers or citations not implied by the materials.
- No JSON inside string values. Escape quotes in strings as needed.

Respond with the JSON object only.""",
            messages=[{"role": "user", "content": user_block}],
        )
        text = (response.content[0].text or "").strip()
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        }
        tracker.log_call(
            "claude-haiku-4-5-20251001", usage["input_tokens"], usage["output_tokens"]
        )
        parsed = _extract_json_object_from_text(text)
        if parsed and _validate_structured_overall(parsed):
            # normalise optional outlook
            out = {k: v for k, v in parsed.items() if k in ("title", "takeaway", "sections", "outlook")}
            if "outlook" not in out:
                out["outlook"] = ""
            return {"structured": out}
        return {
            "text": text
            or "We could not parse a structured answer; see raw model output or use the expert cards above."
        }
    except Exception as e:
        return {
            "text": (
                f"We could not generate a tailored overall answer ({str(e)[:200]}). "
                "You can still use the expert cards and summary above."
            )
        }


# ── Verdict colour helpers ─────────────────────────────────────────────────
VERDICT_COLOURS = {
    # Economist
    "positive": ("#e8f5e9", "#2e7d32", "✅"),
    "mixed": ("#fff8e1", "#f57f17", "⚠️"),
    "concern": ("#ffebee", "#c62828", "🔴"),
    # Social worker
    "protective": ("#e8f5e9", "#2e7d32", "✅"),
    "exclusionary": ("#ffebee", "#c62828", "🔴"),
    # Legal
    "robust": ("#e8f5e9", "#2e7d32", "✅"),
    "needs_clarification": ("#fff8e1", "#f57f17", "⚠️"),
    "legally_risky": ("#ffebee", "#c62828", "🔴"),
    # Industry
    "business_friendly": ("#e8f5e9", "#2e7d32", "✅"),
    "neutral": ("#f3f4f6", "#374151", "➖"),
    "burdensome": ("#ffebee", "#c62828", "🔴"),
    # Citizen
    "good_news": ("#e8f5e9", "#2e7d32", "✅"),
    "bad_news": ("#ffebee", "#c62828", "🔴"),
    # Fallback
    "error": ("#f3f4f6", "#374151", "⚙️"),
}


def verdict_style(verdict: str):
    """Return (bg_color, text_color, icon) for a verdict string."""
    return VERDICT_COLOURS.get(verdict, ("#f3f4f6", "#374151", "➖"))
