"""
Input sanitization and guardrails for the Policy Explainer.
Runs before any LLM call to catch injection, abuse, and distress signals.
"""
import re
from typing import Tuple

# ── Prompt injection patterns ──────────────────────────────────────────────
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|above|prior|your)\s+(instructions?|prompts?|rules?|context)",
    r"forget\s+(all|your|the|everything)",
    r"you\s+are\s+now\s+(a|an|the)",
    r"(act|behave|pretend|roleplay)\s+as\s+(a|an|if)",
    r"jailbreak",
    r"DAN\s*mode",
    r"(reveal|show|print|output|repeat)\s+(your\s+)?(system\s+)?prompt",
    r"override\s+(your\s+)?(instructions?|rules?)",
    r"<\s*script",
    r"do\s+anything\s+now",
]

# ── Legal advice requests (redirect, don't refuse) ─────────────────────────
_LEGAL_ADVICE_PATTERNS = [
    r"should\s+i\s+(file|sue|fight|appeal|complain)",
    r"(am|are)\s+i\s+(guilty|liable|at\s+fault|breaking\s+the\s+law)",
    r"can\s+i\s+win\s+(my\s+)?case",
    r"help\s+me\s+(against|fight|beat|defeat)",
    r"(my|our)\s+(lawyer|advocate|case|client)",
    r"legal\s+advice\s+for\s+my",
]

# ── Distress signals (sensitive — surface helpline, don't block) ───────────
_DISTRESS_PATTERNS = [
    r"\b(arrested|arrest|police\s+case|FIR|bail|jail|prison|lockup)\b",
    r"\b(suicide|self.harm|domestic\s+violence|abuse|assault|rape|molest)\b",
    r"\b(threatened|blackmail|extort|harassment)\b",
]

# ── Compiled once ──────────────────────────────────────────────────────────
_RX_INJECT = [re.compile(p, re.IGNORECASE) for p in _INJECTION_PATTERNS]
_RX_ADVICE = [re.compile(p, re.IGNORECASE) for p in _LEGAL_ADVICE_PATTERNS]
_RX_DISTRESS = [re.compile(p, re.IGNORECASE) for p in _DISTRESS_PATTERNS]

# ── Limits ─────────────────────────────────────────────────────────────────
MAX_QUERY_CHARS = 500
MAX_PERSONA_CHARS = 600


def sanitize_query(query: str) -> Tuple[str, str | None]:
    """
    Validate and clean a user query.
    Returns (cleaned_query, warning_message | None).
    warning_message is non-None when the query should be shown a soft redirect
    rather than being rejected outright.
    """
    # Length cap
    query = query.strip()[:MAX_QUERY_CHARS]

    if not query:
        return "", "Please enter a question."

    # Injection check — hard block
    for rx in _RX_INJECT:
        if rx.search(query):
            return "", (
                "That query cannot be processed. "
                "Please ask a factual question about the selected law."
            )

    # Legal advice redirect — soft warning, still allow through
    advice_warning = None
    for rx in _RX_ADVICE:
        if rx.search(query):
            advice_warning = (
                "This looks like a request for personal legal advice. "
                "This app explains what the law says — not what you should do. "
                "For your specific situation, please consult a registered advocate."
            )
            break

    # Distress signal — surface helpline info
    for rx in _RX_DISTRESS:
        if rx.search(query):
            advice_warning = (
                "This topic may involve a serious or urgent situation. "
                "For immediate help: **iCall** 9152987821 · "
                "**National Legal Services Authority** 15100 · "
                "**Women's Helpline** 181. "
                "The information below explains what the law says; it is not legal advice."
            )
            break

    return query, advice_warning


def sanitize_persona(persona: str) -> str:
    """Strip any injection attempts from custom persona text."""
    persona = persona.strip()[:MAX_PERSONA_CHARS]
    for rx in _RX_INJECT:
        if rx.search(persona):
            return ""
    return persona


def check_output_prescriptive(summary_json: dict) -> list[str]:
    """
    Scan LLM output for prescriptive language that should not appear
    (e.g. 'you should file a complaint', 'you must hire a lawyer').
    Returns list of flagged strings.
    """
    PRESCRIPTIVE = [
        r"\byou\s+should\s+(file|hire|consult|sue|appeal|report|go\s+to)\b",
        r"\byou\s+must\s+(immediately|urgently|now)\b",
        r"\byou\s+need\s+to\s+(file|hire|contact\s+a\s+lawyer)\b",
        r"\bimmediately\s+contact\s+a\s+(lawyer|advocate|police)\b",
    ]
    flags = []
    text_to_check = " ".join([
        str(summary_json.get("tl_dr", "")),
        str(summary_json.get("purpose", "")),
        " ".join(
            str(p.get("provision", "")) + " " + str(p.get("concrete_example", ""))
            for p in summary_json.get("key_provisions", [])
        ),
        " ".join(
            str(i.get("concrete_impact", ""))
            for i in summary_json.get("persona_impacts", [])
        ),
    ])
    for pattern in PRESCRIPTIVE:
        matches = re.findall(pattern, text_to_check, re.IGNORECASE)
        flags.extend(matches)
    return flags
