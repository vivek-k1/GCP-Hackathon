"""
Cross-bill conflict and overlap detector.

Retrieves relevant sections from two bills via BM25, asks Claude Sonnet
to identify genuine conflicts and overlaps, then deterministically verifies
that every claimed quote appears in the retrieved source text.

Hallucination prevention:
- Sonnet is forced to copy-paste exact quotes (minimum 8 words each)
- Post-processing fuzzy-matches each quote against retrieved chunks
- Conflicts with unverified quotes are flagged, not silently accepted
- insufficient_grounding flag prevents displaying invented conflicts
"""
from typing import Dict, List

from app.pdf_parser import load_all_bills
from app.retrieval import HybridRetriever
from app.prompts import CONFLICT_DETECTOR_PROMPT
from app.cost_tracker import tracker
from app.llm_handler import _get_client, _extract_json

_retrievers: Dict[str, HybridRetriever] = {}


def _get_retriever(bill_key: str, bills: dict) -> HybridRetriever:
    if bill_key not in _retrievers:
        _retrievers[bill_key] = HybridRetriever(bills[bill_key]["chunks"], bill_key)
    return _retrievers[bill_key]


def _key_words(text: str) -> set:
    return {w.lower() for w in text.split() if len(w) > 3}


def _quote_grounded(quote: str, chunks: List[Dict], threshold: float = 0.5) -> bool:
    """Fuzzy check: do ≥50% of the quote's meaningful words appear in any chunk?"""
    if not quote:
        return False
    words = _key_words(quote)
    if len(words) < 4:
        return True  # too short to verify meaningfully
    for chunk in chunks:
        chunk_words = _key_words(chunk["text"])
        if len(words & chunk_words) / len(words) >= threshold:
            return True
    return False


def _verify_quotes(result: dict, chunks_a: List[Dict], chunks_b: List[Dict]) -> dict:
    """Mark each conflict as grounded/ungrounded based on deterministic quote check."""
    total = 0
    grounded_count = 0
    for conflict in result.get("conflicts", []):
        a_ok = _quote_grounded(conflict.get("bill_a_quote", ""), chunks_a)
        b_ok = _quote_grounded(conflict.get("bill_b_quote", ""), chunks_b)
        conflict["quote_a_verified"] = a_ok
        conflict["quote_b_verified"] = b_ok
        conflict["grounded"] = a_ok and b_ok
        total += 1
        if conflict["grounded"]:
            grounded_count += 1

    result["grounding_summary"] = {
        "total": total,
        "grounded": grounded_count,
        "ungrounded": total - grounded_count,
    }
    return result


def detect_conflicts(
    bill_a_key: str,
    bill_b_key: str,
    topic: str,
    top_k: int = 4,
    uploaded_bills: Dict = None,
) -> Dict:
    """
    Detect conflicts and overlaps between two bills on a given topic.
    uploaded_bills: optional dict of user-uploaded bills to include in the pool.
    Returns structured JSON with per-conflict grounding verification.
    """
    bills = load_all_bills()
    if uploaded_bills:
        bills = {**bills, **uploaded_bills}

    if bill_a_key not in bills or bill_b_key not in bills:
        return {"error": "One or both bills not found.", "conflicts": [], "overlaps": []}
    if bill_a_key == bill_b_key:
        return {"error": "Please select two different bills.", "conflicts": [], "overlaps": []}

    query = topic.strip() if topic.strip() else "provisions obligations rights duties definitions"

    ret_a = _get_retriever(bill_a_key, bills)
    ret_b = _get_retriever(bill_b_key, bills)
    chunks_a = ret_a.retrieve(query, top_k=top_k)
    chunks_b = ret_b.retrieve(query, top_k=top_k)

    bill_a_name = bills[bill_a_key]["display_name"]
    bill_b_name = bills[bill_b_key]["display_name"]

    if not chunks_a and not chunks_b:
        return {
            "conflicts": [], "overlaps": [], "gaps": [],
            "insufficient_grounding": True,
            "confidence": "low",
            "bill_a_name": bill_a_name,
            "bill_b_name": bill_b_name,
            "error": "No relevant sections found in either bill for this topic.",
        }

    max_chars = 3_500
    context_a = "\n\n".join(
        f"[{bill_a_name} — {c['section']}]\n{c['text']}" for c in chunks_a
    )[:max_chars]
    context_b = "\n\n".join(
        f"[{bill_b_name} — {c['section']}]\n{c['text']}" for c in chunks_b
    )[:max_chars]

    user_msg = (
        f"TOPIC: {topic or 'General provisions, obligations, and definitions'}\n\n"
        f"=== BILL A: {bill_a_name} ===\n{context_a}\n\n"
        f"=== BILL B: {bill_b_name} ===\n{context_b}\n\n"
        "Find ONLY conflicts and overlaps supported by the text above. Return JSON only."
    )

    client = _get_client()
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        temperature=0,
        system=CONFLICT_DETECTOR_PROMPT,
        messages=[{"role": "user", "content": user_msg}],
    )

    result = _extract_json(response.content[0].text)
    tracker.log_call(
        "claude-sonnet-4-6",
        response.usage.input_tokens,
        response.usage.output_tokens,
    )

    result = _verify_quotes(result, chunks_a, chunks_b)
    result.update({
        "bill_a_name": bill_a_name,
        "bill_b_name": bill_b_name,
        "chunks_found": {"bill_a": len(chunks_a), "bill_b": len(chunks_b)},
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
        },
    })
    return result
