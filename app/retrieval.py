import os
import json
import numpy as np
from rank_bm25 import BM25Okapi
from typing import List, Dict, Optional, Tuple

try:
    import voyageai
    _VOYAGE_AVAILABLE = True
except ImportError:
    _VOYAGE_AVAILABLE = False


EMBED_CACHE_PATH = "data/embeddings_cache.json"


def _load_embed_cache() -> Dict[str, List[float]]:
    try:
        with open(EMBED_CACHE_PATH) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_embed_cache(cache: Dict[str, List[float]]) -> None:
    os.makedirs("data", exist_ok=True)
    with open(EMBED_CACHE_PATH, "w") as f:
        json.dump(cache, f)


class HybridRetriever:
    """
    Hybrid BM25 + Voyage AI dense retrieval with RRF fusion.
    Falls back to BM25-only if VOYAGEAI_API_KEY is not set.
    """

    def __init__(self, sections: List[Dict], bill_key: str = ""):
        self.sections = sections
        self.bill_key = bill_key
        self.corpus = [s["text"] for s in sections]

        # BM25 index
        tokenized = [doc.lower().split() for doc in self.corpus]
        self.bm25 = BM25Okapi(tokenized)

        # Dense embeddings (Voyage AI)
        self._voyage_client: Optional[object] = None
        self._embeddings: Optional[np.ndarray] = None
        self._embed_cache = _load_embed_cache()
        self._use_dense = self._init_voyage()

    def _init_voyage(self) -> bool:
        api_key = os.getenv("VOYAGEAI_API_KEY", "")
        if not _VOYAGE_AVAILABLE or not api_key:
            return False
        try:
            self._voyage_client = voyageai.Client(api_key=api_key)
            self._build_dense_index()
            return True
        except Exception as e:
            print(f"[WARN] Voyage AI init failed ({e}); using BM25 only.")
            return False

    def _embed_texts(self, texts: List[str], input_type: str = "document") -> np.ndarray:
        """Batch embed texts via Voyage AI, with in-memory + disk cache."""
        results = []
        uncached_texts = []
        uncached_indices = []

        for i, t in enumerate(texts):
            key = f"{self.bill_key}:{input_type}:{hash(t)}"
            if key in self._embed_cache:
                results.append((i, self._embed_cache[key]))
            else:
                uncached_texts.append(t)
                uncached_indices.append((i, key))

        if uncached_texts:
            # Batch in chunks of 128 to stay within API limits
            batch_size = 128
            new_embeddings = []
            for start in range(0, len(uncached_texts), batch_size):
                batch = uncached_texts[start: start + batch_size]
                result = self._voyage_client.embed(batch, model="voyage-law-2", input_type=input_type)
                new_embeddings.extend(result.embeddings)

            for (idx, cache_key), emb in zip(uncached_indices, new_embeddings):
                self._embed_cache[cache_key] = emb
                results.append((idx, emb))

            _save_embed_cache(self._embed_cache)

        results.sort(key=lambda x: x[0])
        return np.array([r[1] for r in results], dtype=np.float32)

    def _build_dense_index(self) -> None:
        print(f"  Building dense index for {self.bill_key} ({len(self.corpus)} sections)...")
        self._embeddings = self._embed_texts(self.corpus, input_type="document")
        # Normalize for cosine similarity via dot product
        norms = np.linalg.norm(self._embeddings, axis=1, keepdims=True) + 1e-8
        self._embeddings = self._embeddings / norms

    def _bm25_ranks(self, query: str, top_n: int) -> List[Tuple[int, float]]:
        scores = self.bm25.get_scores(query.lower().split())
        ranked = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        return ranked[:top_n]

    def _dense_ranks(self, query: str, top_n: int) -> List[Tuple[int, float]]:
        q_emb = self._embed_texts([query], input_type="query")
        q_emb = q_emb / (np.linalg.norm(q_emb) + 1e-8)
        scores = (self._embeddings @ q_emb.T).flatten()
        ranked = sorted(enumerate(scores.tolist()), key=lambda x: x[1], reverse=True)
        return ranked[:top_n]

    def retrieve(self, query: str, top_k: int = 5) -> List[Dict]:
        """
        Hybrid retrieval with Reciprocal Rank Fusion.
        Returns top_k sections sorted by relevance.
        """
        pool = top_k * 2
        bm25_ranked = self._bm25_ranks(query, pool)

        rrf: Dict[int, float] = {}
        for rank, (idx, _) in enumerate(bm25_ranked):
            rrf[idx] = rrf.get(idx, 0.0) + 1.0 / (rank + 60)

        if self._use_dense and self._embeddings is not None:
            dense_ranked = self._dense_ranks(query, pool)
            for rank, (idx, _) in enumerate(dense_ranked):
                rrf[idx] = rrf.get(idx, 0.0) + 1.0 / (rank + 60)

        top = sorted(rrf.items(), key=lambda x: x[1], reverse=True)[:top_k]
        return [
            {
                "section": self.sections[idx]["section"],
                "text": self.sections[idx]["text"],
                "has_provisos": self.sections[idx].get("has_provisos", False),
                "score": score,
            }
            for idx, score in top
        ]


if __name__ == "__main__":
    from app.pdf_parser import extract_bill_text, chunk_by_section
    text = extract_bill_text("bills/Digital Personal Data Protection Act 2023.pdf")
    sections = chunk_by_section(text, "dpdp")
    retriever = HybridRetriever(sections, "dpdp")
    results = retriever.retrieve("What is personal data?", top_k=3)
    print(f"[OK] Retrieved {len(results)} sections")
    for r in results:
        print(f"  {r['section']} (score={r['score']:.4f}): {r['text'][:80]}...")
