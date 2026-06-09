"""
Pre-compute and cache summaries for demo sections.
Run once: python scripts/precache_summaries.py
"""
import sys
import json
import os
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()

from app.pdf_parser import load_all_bills, BILL_DISPLAY_NAMES
from app.retrieval import HybridRetriever
from app.llm_handler import summarize_with_citations, verify_with_haiku

# Sections to pre-cache for each bill
DEMO_QUERIES = {
    "dpdp": [
        "What is personal data?",
        "What is a data fiduciary?",
        "What are my rights under DPDP?",
    ],
    "social_security": [
        "What benefits do gig workers get?",
        "Who is covered under social security?",
    ],
    "bns": [
        "What is a cognizable offence?",
    ],
    "telecom": [
        "What is a licensed telecom entity?",
    ],
}

CACHE_PATH = "data/cached_summaries.json"


def main():
    print("Loading bills…")
    bills = load_all_bills()
    cache = {}

    for bill_key, queries in DEMO_QUERIES.items():
        if bill_key not in bills:
            print(f"⚠️ Bill {bill_key} not found; skipping")
            continue

        print(f"\n🔄 Pre-caching {bill_key}…")
        retriever = HybridRetriever(bills[bill_key]["chunks"], bill_key=bill_key)
        cache[bill_key] = {}

        for query in queries:
            print(f"  Query: {query!r}")
            try:
                results = retriever.retrieve(query, top_k=3)
                if not results:
                    print(f"  ❌ No results")
                    continue

                top = results[0]
                sonnet = summarize_with_citations(
                    top["text"], top["section"], BILL_DISPLAY_NAMES[bill_key]
                )
                haiku = verify_with_haiku(top["text"], sonnet["summary"])

                cache[bill_key][query] = {
                    "section": top["section"],
                    "source_text": top["text"][:3000],
                    "summary": sonnet["summary"],
                    "faithfulness_score": haiku.get("overall_faithfulness_score"),
                    "requires_review": haiku.get("requires_human_review", False),
                    "red_flags": haiku.get("red_flags", []),
                }
                print(f"  ✅ Cached — faithfulness={haiku.get('overall_faithfulness_score')}")
            except Exception as e:
                print(f"  ❌ Failed: {e}")

    os.makedirs("data", exist_ok=True)
    with open(CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)

    print(f"\n✅ Cache saved to {CACHE_PATH}")


if __name__ == "__main__":
    main()
