"""
Indian Kanoon API client for the Courtroom Simulation (PA-MA-RAG).

Wraps https://api.indiankanoon.org for precedent search and full-verdict
retrieval. When no API token is configured (env INDIAN_KANOON_API_TOKEN),
the client transparently falls back to a small curated demo corpus so the
courtroom simulation works end-to-end offline.

Indian Kanoon is a POST-based token API:
    POST /search/?formInput=<query>&pagenum=<n>
    POST /doc/<docid>/
    Authorization: Token <api_token>
"""
import os
import re
from typing import Dict, List, Optional

import requests


# Court hierarchy weights — Supreme Court precedents bind more strongly than
# High Court / tribunal / district rulings. Used by the jury scoring engine.
COURT_WEIGHTS: Dict[str, float] = {
    "supremecourt": 1.0,
    "scorder": 0.95,
    "delhi": 0.7,
    "bombay": 0.7,
    "kolkata": 0.7,
    "chennai": 0.7,
    "highcourts": 0.7,
    "tribunals": 0.5,
    "district": 0.4,
    "demo": 0.6,
}

DEFAULT_COURT = "supremecourt"


def court_weight(docsource: str) -> float:
    """Map a docsource / court label to a normalized hierarchy weight (0-1)."""
    if not docsource:
        return 0.5
    key = docsource.strip().lower()
    for token, w in COURT_WEIGHTS.items():
        if token in key:
            return w
    # High Court catch-all
    if "high court" in key or "hc" in key:
        return 0.7
    if "supreme" in key:
        return 1.0
    return 0.5


def _parse_found(value, fallback: int) -> int:
    """Indian Kanoon returns `found` as e.g. '1 - 10 of 3188' (or sometimes an int)."""
    if isinstance(value, int):
        return value
    if isinstance(value, str):
        # grab the last/largest number in strings like "1 - 10 of 3188"
        nums = re.findall(r"\d+", value)
        if nums:
            return int(nums[-1])
    return fallback


def _strip_html(html) -> str:
    if html is None:
        return ""
    if not isinstance(html, str):
        html = str(html)
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;", " ", text)
    text = re.sub(r"&amp;", "&", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class IndianKanoonClient:
    """Thin client over the Indian Kanoon token API with demo fallback."""

    def __init__(self, api_token: Optional[str] = None):
        self.api_token = (api_token or os.getenv("INDIAN_KANOON_API_TOKEN", "")).strip()
        self.base_url = "https://api.indiankanoon.org"
        self.timeout = 25

    @property
    def live(self) -> bool:
        """True when a real API token is configured."""
        return bool(self.api_token)

    def _headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Token {self.api_token}",
            "Accept": "application/json",
        }

    # ── Search ──────────────────────────────────────────────────────────
    def search_precedents(
        self,
        query: str,
        court: str = DEFAULT_COURT,
        page: int = 0,
        max_results: int = 6,
    ) -> Dict:
        """
        Search Indian Kanoon for precedents matching `query`.

        Returns a normalized dict:
            {"source": "live"|"demo", "found": int, "docs": [ {docid,title,court,headline,url,weight}, ... ]}
        """
        if not self.live:
            return self._demo_search(query, court, max_results)

        url = f"{self.base_url}/search/?formInput={requests.utils.quote(query)}&pagenum={page}"
        if court:
            url += f"&doctypes={court}"
        try:
            resp = requests.post(url, headers=self._headers(), timeout=self.timeout)
        except requests.RequestException as e:
            return {"source": "demo", "found": 0, "error": f"Kanoon unreachable: {e}",
                    "docs": self._demo_search(query, court, max_results)["docs"]}

        if resp.status_code != 200:
            return {
                "source": "demo",
                "found": 0,
                "error": f"Kanoon API {resp.status_code}",
                "docs": self._demo_search(query, court, max_results)["docs"],
            }

        payload = resp.json()
        docs: List[Dict] = []
        for d in (payload.get("docs") or [])[:max_results]:
            docid = str(d.get("tid") or d.get("docid") or "")
            docsource = d.get("docsource") or d.get("court") or court
            docs.append(
                {
                    "docid": docid,
                    "title": _strip_html(d.get("title") or "Untitled judgment"),
                    "court": docsource,
                    "headline": _strip_html(d.get("headline") or d.get("snippet") or ""),
                    "url": f"https://indiankanoon.org/doc/{docid}/" if docid else "",
                    "weight": court_weight(docsource),
                    "date": d.get("publishdate") or d.get("date") or "",
                }
            )
        return {
            "source": "live",
            "found": _parse_found(payload.get("found"), len(docs)),
            "docs": docs,
        }

    # ── Full verdict ────────────────────────────────────────────────────
    def fetch_full_verdict(self, doc_id: str) -> Optional[Dict]:
        """Fetch the full judgment text for a docid. Returns {docid,title,court,text,url}."""
        if not self.live:
            return self._demo_doc(doc_id)

        url = f"{self.base_url}/doc/{doc_id}/"
        try:
            resp = requests.post(url, headers=self._headers(), timeout=self.timeout)
        except requests.RequestException:
            return self._demo_doc(doc_id)
        if resp.status_code != 200:
            return self._demo_doc(doc_id)
        payload = resp.json()
        return {
            "docid": str(doc_id),
            "title": _strip_html(payload.get("title") or ""),
            "court": payload.get("docsource") or "",
            "text": _strip_html(payload.get("doc") or ""),
            "url": f"https://indiankanoon.org/doc/{doc_id}/",
        }

    # ── Demo corpus (offline fallback) ──────────────────────────────────
    def _demo_search(self, query: str, court: str, max_results: int) -> Dict:
        q = (query or "").lower()
        scored = []
        for doc in _DEMO_CORPUS:
            kw = doc["keywords"]
            score = sum(1 for k in kw if k in q)
            # always surface at least a baseline so the dock is never empty
            scored.append((score, doc))
        scored.sort(key=lambda x: x[0], reverse=True)
        docs = []
        for _, doc in scored[:max_results]:
            docs.append(
                {
                    "docid": doc["docid"],
                    "title": doc["title"],
                    "court": doc["court"],
                    "headline": doc["headline"],
                    "url": doc["url"],
                    "weight": court_weight(doc["court"]),
                    "date": doc["date"],
                }
            )
        return {"source": "demo", "found": len(docs), "docs": docs}

    def _demo_doc(self, doc_id: str) -> Optional[Dict]:
        for doc in _DEMO_CORPUS:
            if doc["docid"] == str(doc_id):
                return {
                    "docid": doc["docid"],
                    "title": doc["title"],
                    "court": doc["court"],
                    "text": doc["text"],
                    "url": doc["url"],
                }
        return None


# A compact, clearly-labelled demo precedent corpus so the simulation is fully
# functional without an Indian Kanoon API token. Texts are paraphrased
# summaries for educational simulation only — NOT verbatim judgments.
_DEMO_CORPUS: List[Dict] = [
    {
        "docid": "1199182",
        "title": "K.S. Puttaswamy (Retd.) v. Union of India",
        "court": "Supreme Court of India",
        "date": "2017-08-24",
        "keywords": ["privacy", "data", "surveillance", "personal", "consent", "aadhaar", "fundamental"],
        "headline": "Right to privacy is a fundamental right under Article 21; informational privacy protected.",
        "url": "https://indiankanoon.org/doc/91938676/",
        "text": (
            "[DEMO SUMMARY] A nine-judge bench held that the right to privacy is intrinsic to the "
            "right to life and personal liberty under Article 21 and to the freedoms guaranteed by "
            "Part III. Informational privacy is a facet of privacy. Any restriction must satisfy the "
            "tests of legality, legitimate State aim, and proportionality. Consent and purpose "
            "limitation are central to lawful processing of personal data."
        ),
    },
    {
        "docid": "2002701",
        "title": "Maneka Gandhi v. Union of India",
        "court": "Supreme Court of India",
        "date": "1978-01-25",
        "keywords": ["liberty", "natural justice", "procedure", "article 21", "fair", "hearing"],
        "headline": "Procedure depriving liberty must be just, fair and reasonable — not arbitrary.",
        "url": "https://indiankanoon.org/doc/1766147/",
        "text": (
            "[DEMO SUMMARY] The Court held that any procedure under Article 21 must be right, just and "
            "fair, and not arbitrary, fanciful or oppressive. Principles of natural justice, including "
            "the right to be heard (audi alteram partem), are read into administrative action affecting "
            "rights, even where the statute is silent."
        ),
    },
    {
        "docid": "3004510",
        "title": "Olga Tellis v. Bombay Municipal Corporation",
        "court": "Supreme Court of India",
        "date": "1985-07-10",
        "keywords": ["eviction", "tenant", "livelihood", "notice", "shelter", "rent", "landlord", "housing"],
        "headline": "Right to livelihood is part of Article 21; eviction requires fair procedure and notice.",
        "url": "https://indiankanoon.org/doc/709776/",
        "text": (
            "[DEMO SUMMARY] The Court recognised that the right to livelihood is an integral facet of the "
            "right to life. While encroachers can be removed, the procedure must be fair and reasonable, "
            "and reasonable notice and an opportunity to be heard must be given before eviction."
        ),
    },
    {
        "docid": "4087220",
        "title": "Vishaka v. State of Rajasthan",
        "court": "Supreme Court of India",
        "date": "1997-08-13",
        "keywords": ["workplace", "harassment", "employer", "labour", "employee", "duty", "safety", "women"],
        "headline": "Employers bear a duty to prevent workplace harassment; guidelines binding until legislation.",
        "url": "https://indiankanoon.org/doc/1031794/",
        "text": (
            "[DEMO SUMMARY] In the absence of legislation, the Court framed binding guidelines placing a "
            "positive duty on employers to provide a safe working environment and effective complaint "
            "mechanisms. The decision illustrates judicially-created obligations filling a statutory gap."
        ),
    },
    {
        "docid": "5061190",
        "title": "Hussainara Khatoon v. State of Bihar",
        "court": "Supreme Court of India",
        "date": "1979-03-09",
        "keywords": ["criminal", "bail", "speedy trial", "accused", "detention", "fir", "section", "custody"],
        "headline": "Speedy trial is a fundamental right; prolonged pre-trial detention is unconstitutional.",
        "url": "https://indiankanoon.org/doc/1373730/",
        "text": (
            "[DEMO SUMMARY] The Court held that a speedy trial is an essential ingredient of the right to "
            "life and liberty under Article 21. Undertrial prisoners detained for periods longer than the "
            "maximum sentence for their alleged offence must be released; the State must provide free legal aid."
        ),
    },
    {
        "docid": "6033120",
        "title": "M.C. Mehta v. Union of India (Consumer / Public Interest)",
        "court": "Supreme Court of India",
        "date": "1986-12-20",
        "keywords": ["consumer", "negligence", "liability", "compensation", "defect", "service", "deficiency", "product"],
        "headline": "Enterprises engaged in hazardous activity bear absolute liability for resulting harm.",
        "url": "https://indiankanoon.org/doc/1486949/",
        "text": (
            "[DEMO SUMMARY] The Court evolved the principle of absolute liability: an enterprise engaged in a "
            "hazardous or inherently dangerous activity owes an absolute and non-delegable duty to the "
            "community, and is liable to compensate for harm without exceptions such as those available "
            "under the older rule of strict liability."
        ),
    },
    {
        "docid": "7012009",
        "title": "Indian Council for Enviro-Legal Action v. Union of India",
        "court": "Supreme Court of India",
        "date": "1996-02-13",
        "keywords": ["polluter", "pays", "compensation", "damage", "liability", "consumer", "remediation"],
        "headline": "Polluter-pays principle: the party causing harm bears the cost of remediation.",
        "url": "https://indiankanoon.org/doc/1818014/",
        "text": (
            "[DEMO SUMMARY] The Court applied the polluter-pays principle, holding that the financial cost of "
            "preventing or remedying damage caused by an activity must be borne by the party responsible for "
            "the harm. The principle informs liability and compensation analysis across regulatory disputes."
        ),
    },
]


def demo_corpus() -> List[Dict]:
    """Demo precedents for Elastic seeding when the cluster has no live Kanoon data."""
    return list(_DEMO_CORPUS)


# Module-level singleton, lazily created
_kanoon_client: Optional[IndianKanoonClient] = None


def get_kanoon_client() -> IndianKanoonClient:
    global _kanoon_client
    if _kanoon_client is None:
        _kanoon_client = IndianKanoonClient()
    return _kanoon_client
