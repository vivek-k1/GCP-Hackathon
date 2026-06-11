"""
Create ELASTIC_INDEX (default: legal-judgments) and bulk-index the demo precedent corpus.

Run once against an empty Elastic Cloud deployment:
    python -m app.elastic_seed
"""
from __future__ import annotations

import json
import os
import sys

import httpx
from dotenv import load_dotenv

from app.kanoon_client import demo_corpus


def bootstrap(index: str | None = None) -> dict:
    load_dotenv(override=True)
    api_key = os.getenv("ELASTIC_API_KEY", "").strip()
    kibana_url = os.getenv("KIBANA_URL", "").strip().rstrip("/")
    index = (index or os.getenv("ELASTIC_INDEX", "legal-judgments")).strip()

    if not api_key:
        raise RuntimeError("ELASTIC_API_KEY is not set.")
    es_url = os.getenv("ELASTICSEARCH_URL", "").strip().rstrip("/")
    if not es_url and kibana_url and ".kb." in kibana_url.lower():
        es_url = kibana_url.replace(".kb.", ".es.", 1)
    if not es_url:
        raise RuntimeError("Set KIBANA_URL (*.kb.*) or ELASTICSEARCH_URL (*.es.*).")

    headers = {"Authorization": f"ApiKey {api_key}", "Content-Type": "application/json"}
    docs = demo_corpus()

    with httpx.Client(timeout=60.0) as client:
        mapping = {
            "mappings": {
                "properties": {
                    "docid": {"type": "keyword"},
                    "title": {"type": "text"},
                    "court": {"type": "keyword"},
                    "date": {"type": "date", "ignore_malformed": True},
                    "keywords": {"type": "keyword"},
                    "headline": {"type": "text"},
                    "url": {"type": "keyword"},
                    "text": {"type": "text"},
                }
            },
        }
        create = client.put(f"{es_url}/{index}", headers=headers, json=mapping)
        if create.status_code not in (200, 400):
            create.raise_for_status()
        if create.status_code == 400 and "resource_already_exists" not in create.text:
            raise RuntimeError(f"Could not create index '{index}': {create.text[:400]}")

        lines: list[str] = []
        for doc in docs:
            lines.append(json.dumps({"index": {"_index": index, "_id": doc["docid"]}}))
            lines.append(json.dumps(doc))
        bulk = client.post(
            f"{es_url}/_bulk",
            headers={**headers, "Content-Type": "application/x-ndjson"},
            content=("\n".join(lines) + "\n").encode(),
        )
        if bulk.status_code >= 400:
            raise RuntimeError(f"Bulk index failed: {bulk.text[:400]}")
        result = bulk.json()
        if result.get("errors"):
            raise RuntimeError(f"Bulk index reported errors: {json.dumps(result)[:400]}")
        client.post(f"{es_url}/{index}/_refresh", headers=headers)

    return {"index": index, "documents_indexed": len(docs), "elasticsearch_url": es_url}


def main() -> None:
    try:
        summary = bootstrap()
        print(f"[OK] Indexed {summary['documents_indexed']} documents into '{summary['index']}'")
        print(f"     Cluster: {summary['elasticsearch_url']}")
    except Exception as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
