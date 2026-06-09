"""
Checkpoint tests — run with: pytest tests/test_all.py -v
"""
import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


# ── Checkpoint 2.0: Schemas ────────────────────────────────────────────────
def test_schemas_validate():
    from app.schemas import SonnetSummary, KeyProvision, Ambiguity, PersonaImpact, BillResponse
    from datetime import datetime

    prov = KeyProvision(
        provision="Data principals have the right to correct their data.",
        source_section="Section 12",
        concrete_example="You can ask Zomato to correct your phone number.",
    )
    amb = Ambiguity(
        ambiguous_text="'personal data' includes information 'capable of identifying'",
        interpretation_1="Any info linkable to a person",
        interpretation_2="Only direct identifiers",
        expert_note="Breadth unclear until case law develops",
    )
    impact = PersonaImpact(
        persona="Gig Worker",
        concrete_impact="Apps collecting your location must tell you why.",
        timeline="Effective August 2023",
    )
    summary = SonnetSummary(
        tl_dr="Data protection law for Indian citizens.",
        purpose="Sets rules for how companies handle your data.",
        key_provisions=[prov],
        ambiguities=[amb],
        persona_impacts=[impact],
        grade_level=7.2,
    )
    assert summary.tl_dr.startswith("Data")
    assert len(summary.key_provisions) == 1
    assert summary.grade_level == 7.2
    print("✅ Schemas: All Pydantic models validate correctly")


# ── Checkpoint 2.1: PDF Parsing ────────────────────────────────────────────
def test_pdf_parsing_dpdp():
    from app.pdf_parser import extract_bill_text, chunk_by_section

    path = "bills/Digital Personal Data Protection Act 2023.pdf"
    text = extract_bill_text(path)
    assert len(text) > 1000, f"Extracted text too short: {len(text)} chars"

    chunks = chunk_by_section(text, "dpdp")
    assert len(chunks) >= 5, f"Expected ≥5 sections, got {len(chunks)}"

    first = chunks[0]
    assert "section" in first
    assert "text" in first
    assert "token_count" in first
    print(f"✅ DPDP PDF: {len(chunks)} sections extracted; first = {first['section']}")


def test_pdf_parsing_all_bills():
    from app.pdf_parser import load_all_bills

    bills = load_all_bills()
    assert len(bills) >= 4, f"Expected ≥4 bills, got {len(bills)}"
    for key, data in bills.items():
        assert len(data["chunks"]) >= 3, f"{key}: only {len(data['chunks'])} sections"
        print(f"✅ {key}: {len(data['chunks'])} sections")


# ── Checkpoint 2.2: Retrieval (BM25 only — no API key required) ───────────
def test_retrieval_bm25():
    from app.pdf_parser import extract_bill_text, chunk_by_section
    from app.retrieval import HybridRetriever

    text = extract_bill_text("bills/Digital Personal Data Protection Act 2023.pdf")
    chunks = chunk_by_section(text, "dpdp")
    retriever = HybridRetriever(chunks, "dpdp")

    results = retriever.retrieve("personal data", top_k=3)
    assert len(results) > 0, "BM25 retrieval returned no results"
    for r in results:
        assert "section" in r
        assert "text" in r
        assert "score" in r
    print(f"✅ BM25 retrieval: {len(results)} results for 'personal data'")


def test_retrieval_returns_relevant():
    from app.pdf_parser import extract_bill_text, chunk_by_section
    from app.retrieval import HybridRetriever

    text = extract_bill_text("bills/Digital Personal Data Protection Act 2023.pdf")
    chunks = chunk_by_section(text, "dpdp")
    retriever = HybridRetriever(chunks, "dpdp")

    results = retriever.retrieve("data fiduciary", top_k=5)
    assert len(results) >= 1
    # Top result should contain relevant text
    top_text = results[0]["text"].lower()
    assert any(kw in top_text for kw in ["data", "fiduciary", "person", "information"]), \
        f"Top result doesn't seem relevant: {top_text[:200]}"
    print(f"✅ Retrieval relevance: top result contains expected keywords")


# ── Checkpoint 3: Prompts ──────────────────────────────────────────────────
def test_prompts_loaded():
    from app.prompts import SONNET_SYSTEM_PROMPT, HAIKU_JUDGE_PROMPT

    assert len(SONNET_SYSTEM_PROMPT) > 500
    assert "tl_dr" in SONNET_SYSTEM_PROMPT
    assert "grade_level" in SONNET_SYSTEM_PROMPT
    assert len(HAIKU_JUDGE_PROMPT) > 200
    assert "overall_faithfulness_score" in HAIKU_JUDGE_PROMPT
    assert "3.5" in HAIKU_JUDGE_PROMPT  # threshold check
    print("✅ Prompts: Both system prompts loaded and contain expected fields")


# ── Checkpoint cost tracker ────────────────────────────────────────────────
def test_cost_tracker():
    from app.cost_tracker import CostTracker

    ct = CostTracker(budget_usd=20.0)
    result = ct.log_call("claude-sonnet-4-6", input_tokens=1000, output_tokens=500)
    assert result["cost_usd"] > 0
    assert result["total_spent_usd"] > 0
    assert result["budget_remaining_usd"] < 20.0

    ct.log_call("claude-haiku-4-5-20251001", input_tokens=500, output_tokens=200)
    s = ct.summary()
    assert s["total_calls"] == 2
    assert s["sonnet_calls"] == 1
    assert s["haiku_calls"] == 1
    print(f"✅ CostTracker: ${s['total_cost_usd']:.6f} tracked for 2 calls")


# ── Run standalone ─────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_schemas_validate()
    test_pdf_parsing_dpdp()
    test_pdf_parsing_all_bills()
    test_retrieval_bm25()
    test_retrieval_returns_relevant()
    test_prompts_loaded()
    test_cost_tracker()
    print("\n✅ ALL TESTS PASSED")
