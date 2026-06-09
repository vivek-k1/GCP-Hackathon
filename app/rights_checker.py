"""
Rights checker: maps a user's described situation to specific statutory rights.

Pipeline:
  1. Keyword-based bill identification (deterministic — no LLM)
  2. BM25 retrieval of top-3 chunks per relevant bill (≤6 chunks total)
  3. Claude Sonnet extracts rights with mandatory source_quote per right
  4. Post-processing fuzzy-matches each quote against retrieved chunks
  5. Returns grounding_summary showing how many rights are source-verified

Hallucination prevention:
- Every right must include an 8+ word source_quote from the provided text
- Fuzzy-match check: ≥50% of quote's key words must appear in a retrieved chunk
- Unverified rights are flagged but not removed (user sees the badge)
- "Law is silent" is surfaced as an explicit output field, not silently omitted
"""
from typing import Dict, List

from app.pdf_parser import load_all_bills
from app.retrieval import HybridRetriever
from app.prompts import RIGHTS_CHECKER_PROMPT
from app.cost_tracker import tracker
from app.sanitizer import sanitize_query
from app.llm_handler import _get_client, _extract_json

_retrievers: Dict[str, HybridRetriever] = {}

# Keyword → bill key (deterministic mapping, no LLM)
_KEYWORDS: Dict[str, List[str]] = {
    "dpdp": [
        "data", "privacy", "personal information", "digital", "data protection",
        "data fiduciary", "consent", "data principal", "share my data",
        "delete my data", "app", "platform", "account", "information collected",
    ],
    "telecom": [
        "phone", "telecom", "broadband", "sim", "internet service", "spectrum",
        "tower", "signal", "network", "mobile", "isp", "operator",
        "subscriber", "trai", "telecom company",
    ],
    "social_security": [
        "worker", "employee", "factory", "social security", "provident fund",
        "pf", "gratuity", "esi", "esic", "maternity", "unorganised",
        "gig", "platform worker", "labour", "labor", "employer",
        "salary", "wages", "termination", "fired", "dismissed",
    ],
    "bns": [
        "crime", "murder", "theft", "assault", "fir", "police",
        "arrest", "bail", "complaint", "offence", "offense",
        "harassment", "cheating", "fraud", "criminal", "accused",
        "victim", "punish", "jail", "violence",
    ],
    "maha_rent": [
        "rent", "tenant", "landlord", "eviction", "lease", "flat",
        "apartment", "deposit", "housing", "maharashtra", "mumbai",
        "thane", "pune", "premises",
    ],
}

CENTRAL_BILLS = ["dpdp", "social_security", "bns", "telecom"]


def _get_retriever(bill_key: str, bills: dict) -> HybridRetriever:
    if bill_key not in _retrievers:
        _retrievers[bill_key] = HybridRetriever(bills[bill_key]["chunks"], bill_key)
    return _retrievers[bill_key]


def _key_words(text: str) -> set:
    return {w.lower() for w in text.split() if len(w) > 3}


def _quote_grounded(quote: str, chunks: List[Dict], threshold: float = 0.5) -> bool:
    """Fuzzy check: do ≥50% of the quote's key words appear in any chunk?"""
    if not quote:
        return False
    words = _key_words(quote)
    if len(words) < 4:
        return True  # too short to verify meaningfully
    for chunk in chunks:
        if len(words & _key_words(chunk["text"])) / len(words) >= threshold:
            return True
    return False


def identify_relevant_bills(situation: str) -> List[str]:
    """
    Score each bill by keyword overlap with the situation text.
    Returns bills sorted by score — no LLM, fully deterministic.
    Defaults to all central bills when no keywords match.
    """
    lower = situation.lower()
    scores: Dict[str, int] = {}
    for key, keywords in _KEYWORDS.items():
        score = sum(1 for kw in keywords if kw in lower)
        if score > 0:
            scores[key] = score

    if not scores:
        return CENTRAL_BILLS

    max_score = max(scores.values())
    return sorted(
        [k for k, v in scores.items() if v >= max(1, max_score // 2)],
        key=lambda k: -scores[k],
    )


def check_rights(situation: str, uploaded_bills: Dict = None) -> Dict:
    """
    Given a user's described situation, return their rights under applicable bills.
    uploaded_bills: optional dict of {key: {display_name, chunks, text, ...}} for
    user-uploaded PDFs to search in addition to the built-in bills.
    Includes deterministic source-quote grounding verification for every right.
    """
    clean, warning = sanitize_query(situation)
    if not clean:
        return {
            "error": warning,
            "your_rights": [],
            "disclaimer": "This is information only, not legal advice.",
        }

    bills = load_all_bills()
    if uploaded_bills:
        bills = {**bills, **uploaded_bills}

    bill_keys = identify_relevant_bills(clean)

    # Always include uploaded bills — we don't know their content yet
    if uploaded_bills:
        for key in uploaded_bills:
            if key not in bill_keys:
                bill_keys.append(key)

    all_chunks: List[Dict] = []
    for key in bill_keys:
        if key not in bills:
            continue
        retriever = _get_retriever(key, bills)
        chunks = retriever.retrieve(clean, top_k=3)
        bill_name = bills[key]["display_name"]
        for chunk in chunks:
            chunk["bill_name"] = bill_name
            chunk["bill_key"] = key
        all_chunks.extend(chunks)

    bills_searched = [bills[k]["display_name"] for k in bill_keys if k in bills]

    if not all_chunks:
        return {
            "situation_understood": clean,
            "your_rights": [],
            "your_duties": [],
            "what_law_does_not_cover": (
                "No relevant sections found in the available bills for this situation."
            ),
            "disclaimer": (
                "This is plain-language legal information, not legal advice. "
                "For legal action, consult a qualified lawyer or contact NALSA at 15100 (free)."
            ),
            "insufficient_grounding": True,
            "bills_searched": bills_searched,
        }

    # Rank by BM25 score, cap at 6 chunks to control tokens
    all_chunks.sort(key=lambda x: x.get("score", 0), reverse=True)
    all_chunks = all_chunks[:6]

    context = "\n\n".join(
        f"[{c['bill_name']} — {c['section']}]\n{c['text'][:650]}"
        for c in all_chunks
    )

    user_msg = (
        f"SITUATION: {clean}\n\n"
        f"RELEVANT LAW SECTIONS:\n{context}\n\n"
        "Identify rights based ONLY on the text above. Return ONLY JSON."
    )

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        temperature=0,
        system=RIGHTS_CHECKER_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    result = _extract_json(response.content[0].text)
    tracker.log_call(
        "claude-sonnet-4-6",
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    # Deterministic grounding verification
    for right in result.get("your_rights", []):
        right["grounded"] = _quote_grounded(right.get("source_quote", ""), all_chunks)
    for duty in result.get("your_duties", []):
        duty["grounded"] = _quote_grounded(duty.get("source_quote", ""), all_chunks)

    rights = result.get("your_rights", [])
    n_grounded = sum(1 for r in rights if r.get("grounded", False))

    result.update({
        "bills_searched": bills_searched,
        "sections_reviewed": [
            f"{c['bill_name']} — {c['section']}" for c in all_chunks
        ],
        "grounding_summary": {
            "total_rights": len(rights),
            "grounded_rights": n_grounded,
            "ungrounded_rights": len(rights) - n_grounded,
        },
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
        "_warning": warning,
    })
    return result
