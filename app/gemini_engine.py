"""
Gemini 3 engine for the live courtroom (google-genai SDK).

Provides the three agentic capabilities the courtroom needs:
  1. analyze_and_plan  — Senior Lawyer Agent: classify domain, extract legal entities,
                         and compile a raw Elasticsearch Query DSL + ES|QL statement.
  2. argue_stream      — Accuser / Defense agents: stream a precedent-grounded argument.
  3. score_jury        — Jury Agent: produce P_statute / P_precedent / P_factual (0-1).

Live only. Raises GeminiError on failure; courtroom_live falls back to Claude when configured.
"""
from __future__ import annotations

import json
import os
import re
from typing import Any, Dict, Generator, List, Optional

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.1-pro-preview")
GEMINI_FAST_MODEL = os.getenv("GEMINI_FAST_MODEL", "gemini-2.0-flash")


def _use_pro_model() -> bool:
    return os.getenv("GEMINI_USE_PRO", "").strip().lower() in ("1", "true", "yes")


def _model_for_generation() -> str:
    """Fast model by default; Pro only when GEMINI_USE_PRO=1 (saves free-tier quota)."""
    return GEMINI_MODEL if _use_pro_model() else GEMINI_FAST_MODEL


class GeminiError(RuntimeError):
    pass


_genai = None
_types = None
_client = None


def _load_sdk():
    global _genai, _types
    if _genai is None:
        try:
            from google import genai  # type: ignore
            from google.genai import types  # type: ignore
        except ImportError as e:
            raise GeminiError(
                "google-genai is not installed. Run `pip install google-genai` "
                "(see requirements.txt)."
            ) from e
        _genai, _types = genai, types
    return _genai, _types


def _get_client():
    global _client
    if _client is None:
        genai, _ = _load_sdk()
        api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
        if not api_key:
            raise GeminiError(
                "GEMINI_API_KEY (or GOOGLE_API_KEY) is not set. The live courtroom "
                "runs on Gemini 3 — configure a key (no fallback engine)."
            )
        _client = genai.Client(api_key=api_key)
    return _client


def _extract_json(text: str) -> Optional[dict]:
    if not text:
        return None
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


def _generate_json(system: str, user: str, *, model: str, max_tokens: int = 1600, temperature: float = 0.0) -> dict:
    _, types = _load_sdk()
    client = _get_client()
    try:
        resp = client.models.generate_content(
            model=model,
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=temperature,
                max_output_tokens=max_tokens,
                response_mime_type="application/json",
            ),
        )
    except Exception as e:  # surface SDK/transport errors loudly
        raise GeminiError(f"Gemini request failed ({model}): {e}") from e

    parsed = _extract_json(getattr(resp, "text", "") or "")
    if parsed is None:
        raise GeminiError(f"Gemini did not return valid JSON ({model}).")
    return parsed


# ── Phase 1: Senior Lawyer Agent — analyze + compile Elasticsearch query ──────
_PLAN_SYSTEM = """You are the Lead Court Coordinator and Senior Advocate in an Indian legal-tech system.
You receive a citizen's case facts. Do TWO things and return ONE JSON object:

1) Legal analysis: classify the domain and extract the issues + searchable legal entities.
2) Search planning: compile a SYNTACTICALLY CORRECT Elasticsearch Query DSL and an ES|QL
   statement that will retrieve the most relevant prior judgments / statute sections from the
   target index. The DSL must be the *query* body (a JSON object) suitable for the MCP `search`
   tool. Favour a bool query mixing `multi_match` (best_fields) over likely text fields
   (title, text, headline, catchwords) with `should` term boosts on legal entities.

Return ONLY this JSON (no markdown):
{
  "domain": "Civil|Criminal|Consumer|Labor|Constitutional|Other",
  "domain_confidence": <0.0-1.0>,
  "summary": "<2-3 sentence neutral restatement>",
  "legal_entities": ["<statute/section/doctrine/party-type keywords>"],
  "issues": [{"issue": "<point of law>", "governing_law": "<Act/Article/Section or empty>"}],
  "target_index": "<index or index-pattern to search>",
  "query_dsl": { "query": { ... valid Elasticsearch query ... }, "size": <int 5-15> },
  "esql": "<a valid ES|QL statement, e.g. FROM <index> | WHERE ... | KEEP ... | LIMIT 10>",
  "search_rationale": "<1-2 sentences on why this query finds the right precedents>"
}

Rules: 2-4 issues. query_dsl MUST be valid JSON. Use the provided DEFAULT_INDEX as target_index
unless the facts clearly imply another. Never invent section numbers you are unsure of."""


def analyze_and_plan(case_facts: str, default_index: str) -> dict:
    facts = (case_facts or "").strip()[:6000]
    user = (
        f"DEFAULT_INDEX: {default_index}\n\n"
        f"CASE FACTS:\n{facts}\n\n"
        "Analyse and produce the search plan as the specified JSON."
    )
    plan = _generate_json(_PLAN_SYSTEM, user, model=_model_for_generation(), max_tokens=1800)
    plan.setdefault("domain", "Other")
    plan.setdefault("domain_confidence", 0.5)
    plan.setdefault("summary", facts[:300])
    plan.setdefault("legal_entities", [])
    plan.setdefault("issues", [])
    plan.setdefault("target_index", default_index)
    plan.setdefault("query_dsl", {"query": {"multi_match": {"query": facts[:200], "fields": ["*"]}}, "size": 10})
    plan.setdefault("esql", f"FROM {plan.get('target_index', default_index)} | LIMIT 10")
    plan.setdefault("search_rationale", "")
    return plan


# ── Phase 3: Accuser / Defense argument (streamed) ────────────────────────────
_ACCUSER_PERSONA = (
    "You are the PLAINTIFF / PROSECUTION counsel — assertive, persuasive, relentless. "
    "Build the strongest case that the opposing party is liable, aligning facts with favourable precedents."
)
_DEFENSE_PERSONA = (
    "You are the DEFENCE counsel — analytical, protective, sharp on procedure and burden of proof. "
    "Find gaps, raise exceptions, and marshal counter-precedents for the client."
)


def _argument_system(side: str) -> str:
    persona = _ACCUSER_PERSONA if side == "accuser" else _DEFENSE_PERSONA
    return f"""{persona}

You argue before an Indian court in a structured simulation, grounded ONLY in the precedents
retrieved live from Elasticsearch (provided below by docid). 

ZERO-HALLUCINATION CITATION PROTOCOL:
- Cite ONLY precedents from the RETRIEVED PRECEDENTS list, using their EXACT docid.
- Never invent a docid, case name, section, or quote. If you lack authority, argue on principle.

DELIVERY: First person as counsel ("Your Lordship..."). 2-4 tight paragraphs, engaging the
opponent's latest point. Tie each precedent to a fact.

End with a fenced citations block listing only what you relied on:
```citations
[{{"docid": "<exact docid>", "label": "<case/source>", "statute_section": "<e.g. Article 21 or empty>", "quote": "<short phrase>"}}]
```
If nothing concrete: ```citations
[]
```"""


def argue_stream(
    side: str,
    case_facts: str,
    domain: str,
    precedent_block: str,
    transcript_block: str,
    opponent_argument: str,
) -> Generator[str, None, None]:
    """Yield text deltas of the attorney's argument (Gemini streaming)."""
    _, types = _load_sdk()
    client = _get_client()
    user = (
        f"DOMAIN: {domain}\n"
        f"CASE FACTS:\n{case_facts[:2500]}\n\n"
        f"RETRIEVED PRECEDENTS (cite by exact docid only):\n{precedent_block}\n\n"
        f"COURTROOM SO FAR:\n{transcript_block}\n\n"
        + (
            f"OPPOSING COUNSEL JUST ARGUED:\n{opponent_argument[:1500]}\n\nDeliver your rebuttal now."
            if opponent_argument
            else "Deliver your opening argument now."
        )
    )
    try:
        stream = client.models.generate_content_stream(
            model=_model_for_generation(),
            contents=user,
            config=types.GenerateContentConfig(
                system_instruction=_argument_system(side),
                temperature=0.4,
                max_output_tokens=1200,
            ),
        )
        for chunk in stream:
            piece = getattr(chunk, "text", None)
            if piece:
                yield piece
    except Exception as e:
        raise GeminiError(f"Gemini argument stream failed: {e}") from e


# ── Jury scoring (P_* components; weights applied by the orchestrator) ────────
_JURY_SYSTEM = """You are an objective Jury Evaluator in an Indian courtroom simulation. You take no side.
Police hallucinations: if a side cited authority NOT in the GROUNDED AUTHORITIES, flag it.

Score each side on three axes from 0.0 to 1.0:
- statute: strength of statutory alignment (correct sections/articles applied).
- precedent: strength + hierarchy of cited precedents present in GROUNDED AUTHORITIES
  (Supreme Court > High Court > tribunal > district). Reward correct, on-point citations; penalise empty/misapplied.
- factual: how well the argument is grounded in the CASE FACTS (evidence coverage).

Return ONLY this JSON:
{
  "accuser": {"statute": {"score": <0-1>, "rationale": "<=20 words"},
               "precedent": {"score": <0-1>, "rationale": "<=20 words"},
               "factual": {"score": <0-1>, "rationale": "<=20 words"}},
  "defense": {"statute": {...}, "precedent": {...}, "factual": {...}},
  "hallucination_flags": ["<unsupported citation note, or empty>"],
  "rationale": "<2-3 sentences: who is ahead and why>"
}"""


def score_jury(case_facts: str, authorities_block: str, accuser_block: str, defense_block: str) -> dict:
    user = (
        f"CASE FACTS:\n{case_facts[:2000]}\n\n"
        f"GROUNDED AUTHORITIES (the ONLY valid precedents):\n{authorities_block}\n\n"
        f"ACCUSER (Plaintiff/Prosecution) ARGUMENTS:\n{accuser_block}\n\n"
        f"DEFENCE ARGUMENTS:\n{defense_block}\n\n"
        "Score both sides and flag any unsupported citation. Return ONLY the JSON."
    )
    return _generate_json(_JURY_SYSTEM, user, model=GEMINI_FAST_MODEL, max_tokens=1100)


def gemini_status() -> Dict[str, Any]:
    api_key = (os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY") or "").strip()
    try:
        _load_sdk()
        sdk_ok = True
    except GeminiError:
        sdk_ok = False
    return {
        "configured": bool(api_key),
        "sdk_installed": sdk_ok,
        "model": _model_for_generation(),
        "use_pro": _use_pro_model(),
        "pro_model": GEMINI_MODEL,
        "fast_model": GEMINI_FAST_MODEL,
    }
