"""
Courtroom Simulation engine — Precedent-Aware Multi-Agent RAG (PA-MA-RAG).

This is a LangGraph-style state machine implemented in plain Python so it plugs
directly into the existing SSE streaming pattern without adding heavy graph
dependencies. The node graph is:

    User facts
        -> Senior Lawyer Agent (domain + issue spotting)            [analyze_case]
        -> Retriever Agent (Indian Kanoon -> local vector index)    [run_retrieval]
        -> Accuser  <-> Defense  (turn-based, precedent grounded)   [generate_turn_stream]
        -> Jury Evaluator (anti-hallucination + S_jury scoring)     [compute_jury_verdict]

Each AI statement is bound by a Zero-Hallucination Citation Protocol: agents may
only cite docids that appear in the retrieved precedent set and statute sections
present in the case materials. The Jury validates citations against grounded text.
"""
import json
import os
import re
import threading
import uuid
from datetime import datetime
from typing import Dict, Generator, List, Optional, Tuple

import anthropic

from app.cost_tracker import tracker
from app.kanoon_client import get_kanoon_client, court_weight
from app.retrieval import HybridRetriever


# Configurable models. Default to the codebase-proven slugs; override the
# attorney model with COURTROOM_MODEL (e.g. a premium reasoning model) via env.
COURTROOM_MODEL = os.getenv("COURTROOM_MODEL", "claude-sonnet-4-6")
JURY_MODEL = os.getenv("COURTROOM_JURY_MODEL", "claude-haiku-4-5-20251001")

DISCLAIMER = (
    "Educational courtroom simulation — NOT legal advice or representation. "
    "AI attorneys may err; verify every citation against the official record and "
    "consult a qualified advocate before any real proceeding."
)

WEIGHTS = {"statute": 0.4, "precedent": 0.4, "factual": 0.2}

_client: Optional[anthropic.Anthropic] = None
_SESSIONS: Dict[str, "CourtroomSession"] = {}
_LOCK = threading.RLock()


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        _client = anthropic.Anthropic()
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


def _chunk_text(text: str, size: int = 600, overlap: int = 80) -> List[str]:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]
    chunks = []
    start = 0
    while start < len(text):
        end = min(len(text), start + size)
        chunks.append(text[start:end])
        if end >= len(text):
            break
        start = end - overlap
    return chunks


# ── Session state ───────────────────────────────────────────────────────────
class CourtroomSession:
    def __init__(self, case_facts: str, analysis: dict):
        self.id = uuid.uuid4().hex[:12]
        self.case_facts = case_facts
        self.analysis = analysis
        self.precedents: List[Dict] = []
        self.retriever: Optional[HybridRetriever] = None
        self._text_meta: Dict[str, Dict] = {}
        self.transcript: List[Dict] = []
        self.created_at = datetime.utcnow().isoformat()
        self._turn_seq = 0

    def next_turn_id(self) -> int:
        self._turn_seq += 1
        return self._turn_seq

    def precedent_index(self) -> Dict[str, Dict]:
        return {p["docid"]: p for p in self.precedents}

    def retrieve_context(self, query: str, top_k: int = 4) -> List[Dict]:
        """Return top precedent chunks with their metadata for grounding."""
        if not self.retriever:
            # fall back to precedent headlines
            return [
                {
                    "docid": p["docid"],
                    "title": p["title"],
                    "court": p["court"],
                    "weight": p.get("weight", 0.5),
                    "snippet": (p.get("headline") or p.get("snippet") or "")[:500],
                }
                for p in self.precedents[:top_k]
            ]
        hits = self.retriever.retrieve(query, top_k=top_k)
        out = []
        for h in hits:
            meta = self._text_meta.get(h["text"], {})
            out.append(
                {
                    "docid": meta.get("docid", ""),
                    "title": meta.get("title", h.get("section", "")),
                    "court": meta.get("court", ""),
                    "weight": meta.get("weight", 0.5),
                    "snippet": h["text"][:500],
                }
            )
        return out

    # ── Serialization (survives backend restarts / --reload) ────────────
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "case_facts": self.case_facts,
            "analysis": self.analysis,
            "precedents": self.precedents,
            "text_meta": self._text_meta,
            "transcript": self.transcript,
            "created_at": self.created_at,
            "turn_seq": self._turn_seq,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "CourtroomSession":
        s = cls.__new__(cls)  # bypass __init__ (which would mint a new id)
        s.id = d["id"]
        s.case_facts = d.get("case_facts", "")
        s.analysis = d.get("analysis", {})
        s.precedents = d.get("precedents", [])
        s._text_meta = d.get("text_meta", {})
        s.transcript = d.get("transcript", [])
        s.created_at = d.get("created_at", datetime.utcnow().isoformat())
        s._turn_seq = int(d.get("turn_seq", len(s.transcript)))
        s.retriever = None
        s._rebuild_retriever()
        return s

    def _rebuild_retriever(self) -> None:
        """Reconstruct the precedent vector index from persisted chunk metadata."""
        if not self._text_meta:
            return
        sections = [
            {"section": meta.get("title", ""), "text": chunk}
            for chunk, meta in self._text_meta.items()
        ]
        try:
            self.retriever = HybridRetriever(sections, bill_key=f"kanoon_{self.id}")
        except Exception as e:
            print(f"[WARN] retriever rebuild failed for {self.id}: {e}")
            self.retriever = None


# ── Persistence ──────────────────────────────────────────────────────────────
_SESSION_DIR = os.getenv("COURTROOM_SESSION_DIR", "data/courtroom_sessions")


def _session_path(session_id: str) -> str:
    safe = re.sub(r"[^a-zA-Z0-9_-]", "", session_id)[:32]
    return os.path.join(_SESSION_DIR, f"{safe}.json")


def save_session(session: CourtroomSession) -> None:
    """Atomically persist a session so it survives restarts. Concurrency-safe."""
    with _LOCK:
        try:
            os.makedirs(_SESSION_DIR, exist_ok=True)
            path = _session_path(session.id)
            tmp = f"{path}.{os.getpid()}.tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(session.to_dict(), f, ensure_ascii=False)
            os.replace(tmp, path)  # atomic on same filesystem
        except Exception as e:
            print(f"[WARN] could not persist session {session.id}: {e}")


def _load_session_from_disk(session_id: str) -> Optional[CourtroomSession]:
    path = _session_path(session_id)
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None
    try:
        return CourtroomSession.from_dict(data)
    except Exception as e:
        print(f"[WARN] could not restore session {session_id}: {e}")
        return None


def get_session(session_id: str) -> Optional[CourtroomSession]:
    with _LOCK:
        s = _SESSIONS.get(session_id)
        if s is not None:
            return s
    # fall back to disk (e.g. after a --reload wiped memory)
    s = _load_session_from_disk(session_id)
    if s is not None:
        with _LOCK:
            _SESSIONS[s.id] = s
    return s


def _register_session(session: CourtroomSession) -> None:
    with _LOCK:
        _SESSIONS[session.id] = session
        # keep memory bounded for the demo
        if len(_SESSIONS) > 50:
            oldest = sorted(_SESSIONS.values(), key=lambda s: s.created_at)[:-50]
            for s in oldest:
                _SESSIONS.pop(s.id, None)
    save_session(session)


# ── Node 1: Senior Lawyer Agent ──────────────────────────────────────────────
_SENIOR_PROMPT = """You are a Senior Advocate and legal strategist practising across Indian courts.
You receive a citizen's case facts. Classify the dispute and spot the legal issues so a
research team can pull precedents from Indian Kanoon.

Return ONLY this JSON (no preamble, no markdown):
{
  "domain": "Civil|Criminal|Consumer|Labor|Constitutional|Other",
  "domain_confidence": <0.0-1.0>,
  "summary": "<2-3 sentence neutral restatement of the dispute>",
  "issues": [
    {"issue": "<crisp point of law>", "governing_law": "<Act / Article / Section if identifiable>", "kanoon_query": "<3-7 word search query for Indian Kanoon>"}
  ],
  "governing_acts": ["<likely governing statute 1>", "<statute 2>"],
  "suggested_court": "supremecourt|highcourts|tribunals|district"
}

Rules: 2-4 issues. kanoon_query must be short keyword phrases (no punctuation). Do not invent section numbers you are unsure of — leave governing_law empty instead."""


def analyze_case(case_facts: str) -> dict:
    facts = (case_facts or "").strip()[:6000]
    resp = _get_client().messages.create(
        model=COURTROOM_MODEL,
        max_tokens=900,
        temperature=0,
        system=_SENIOR_PROMPT,
        messages=[{"role": "user", "content": f"CASE FACTS:\n{facts}\n\nReturn ONLY the JSON."}],
    )
    tracker.log_call(COURTROOM_MODEL, resp.usage.input_tokens, resp.usage.output_tokens)
    parsed = _extract_json(resp.content[0].text) or {}
    parsed.setdefault("domain", "Other")
    parsed.setdefault("domain_confidence", 0.5)
    parsed.setdefault("summary", facts[:300])
    parsed.setdefault("issues", [])
    parsed.setdefault("governing_acts", [])
    parsed.setdefault("suggested_court", "supremecourt")
    return parsed


def create_session(case_facts: str, analysis: dict) -> CourtroomSession:
    session = CourtroomSession(case_facts=case_facts, analysis=analysis)
    _register_session(session)
    return session


# ── Node 2: Retriever Agent ──────────────────────────────────────────────────
# Keep retrieval responsive: real judgments can be hundreds of KB, so cap how
# many we deep-fetch and how much of each we index.
MAX_PRECEDENTS = int(os.getenv("COURTROOM_MAX_PRECEDENTS", "6"))
MAX_VERDICT_CHARS = int(os.getenv("COURTROOM_MAX_VERDICT_CHARS", "18000"))


def run_retrieval(
    session: CourtroomSession,
    court: str = "",
    max_results: int = 5,
) -> List[Dict]:
    """Query Indian Kanoon for each spotted issue, then build a local vector index."""
    client = get_kanoon_client()
    analysis = session.analysis
    court = court or analysis.get("suggested_court", "supremecourt")

    queries: List[str] = []
    for issue in analysis.get("issues", []):
        q = (issue.get("kanoon_query") or issue.get("issue") or "").strip()
        if q:
            queries.append(q)
    if not queries:
        queries = [analysis.get("summary", "")[:80] or session.case_facts[:80]]

    seen: Dict[str, Dict] = {}
    for q in queries[:4]:
        if len(seen) >= MAX_PRECEDENTS:
            break
        res = client.search_precedents(q, court=court, max_results=max_results)
        for d in res.get("docs", []):
            if d["docid"] and d["docid"] not in seen:
                seen[d["docid"]] = d

    # Cap the number of precedents we deep-fetch + index (relevance-ordered).
    precedents = list(seen.values())[:MAX_PRECEDENTS]

    # Pull full verdict text and build a local semantic index over chunks.
    sections: List[Dict] = []
    text_meta: Dict[str, Dict] = {}
    for p in precedents:
        full = client.fetch_full_verdict(p["docid"]) or {}
        body = (full.get("text") or p.get("headline") or "")[:MAX_VERDICT_CHARS]
        p["snippet"] = (p.get("headline") or body[:300])
        for ch in _chunk_text(body or p.get("headline", ""), size=600):
            sections.append({"section": p["title"], "text": ch})
            text_meta[ch] = {
                "docid": p["docid"],
                "title": p["title"],
                "court": p["court"],
                "url": p.get("url", ""),
                "weight": p.get("weight", court_weight(p.get("court", ""))),
            }

    with _LOCK:
        session.precedents = precedents
        session._text_meta = text_meta
        if sections:
            try:
                session.retriever = HybridRetriever(sections, bill_key=f"kanoon_{session.id}")
            except Exception as e:
                print(f"[WARN] precedent index build failed: {e}")
                session.retriever = None
    save_session(session)
    return precedents


# ── Nodes 3/4: Accuser & Defense Attorney Agents ─────────────────────────────
_SIDE_LABELS = {
    "accuser": "Plaintiff / Prosecution Counsel",
    "defense": "Defence Counsel",
}

_ACCUSER_PERSONA = (
    "You are the PLAINTIFF / PROSECUTION counsel. Persona: assertive, persuasive, "
    "relentless. Your objective is to build the strongest possible case that the "
    "opposing party is liable / guilty, aligning the facts with favourable precedents."
)
_DEFENSE_PERSONA = (
    "You are the DEFENCE counsel. Persona: analytical, protective, sharp on procedure. "
    "Your objective is to find gaps in the opponent's case, raise exceptions and "
    "burden-of-proof failures, and marshal counter-precedents in the client's favour."
)


def _build_argument_system(side: str) -> str:
    persona = _ACCUSER_PERSONA if side == "accuser" else _DEFENSE_PERSONA
    return f"""{persona}

You are arguing before an Indian court in a structured simulation.

ZERO-HALLUCINATION CITATION PROTOCOL (mandatory):
- You may ONLY cite precedents from the PRECEDENTS list provided, using their EXACT docid.
- You may cite statute sections/articles only if they appear in the CASE MATERIALS.
- Never invent a docid, case name, section number, or quote. If you lack authority, argue on principle and say so.

DELIVERY:
- Speak in the first person as counsel ("Your Lordship, ...", "My learned friend...").
- 2 to 4 tight paragraphs. Directly engage the opponent's most recent point if one exists.
- Be specific: tie each precedent to a fact.

After your spoken argument, output a fenced citations block listing only what you actually relied on:
```citations
[{{"docid": "<exact docid>", "label": "<case name>", "statute_section": "<e.g. Article 21 or empty>", "quote": "<short phrase from the snippet>"}}]
```
If you cited nothing concrete, output an empty array: ```citations
[]
```"""


def _format_precedents(ctx: List[Dict]) -> str:
    lines = []
    for c in ctx:
        lines.append(
            f"- docid={c['docid']} | {c['title']} ({c['court']}, hierarchy_weight={c.get('weight', 0.5):.2f})\n"
            f"  snippet: {c['snippet']}"
        )
    return "\n".join(lines) if lines else "(no precedents retrieved — argue on statutory principle only)"


def _format_transcript(transcript: List[Dict], limit: int = 4) -> str:
    if not transcript:
        return "(opening — no prior arguments)"
    recent = transcript[-limit:]
    lines = []
    for t in recent:
        who = t.get("role_label") or t.get("side", "")
        lines.append(f"[{who}]: {t.get('argument', '')[:600]}")
    return "\n\n".join(lines)


def _parse_citations(full_text: str, precedent_index: Dict[str, Dict]) -> Tuple[str, List[Dict]]:
    """Split prose from the trailing ```citations block and validate docids."""
    prose = full_text
    citations: List[Dict] = []
    m = re.search(r"```citations\s*([\s\S]*?)```", full_text)
    if m:
        prose = full_text[: m.start()].strip()
        raw = m.group(1).strip()
        try:
            arr = json.loads(raw)
            if isinstance(arr, list):
                for c in arr:
                    if not isinstance(c, dict):
                        continue
                    docid = str(c.get("docid", "")).strip()
                    meta = precedent_index.get(docid)
                    citations.append(
                        {
                            "docid": docid,
                            "label": c.get("label") or (meta["title"] if meta else ""),
                            "statute_section": c.get("statute_section", ""),
                            "quote": c.get("quote", ""),
                            "url": meta["url"] if meta else "",
                            # preliminary: docid exists in retrieved set
                            "grounded": bool(meta) if docid else None,
                        }
                    )
        except json.JSONDecodeError:
            pass
    return prose.strip(), citations


def _generate_argument_stream(
    session: CourtroomSession,
    side: str,
    opponent_argument: str,
) -> Generator[dict, None, None]:
    """Stream an AI attorney's argument as text deltas, then emit the structured turn."""
    role_label = _SIDE_LABELS.get(side, side)
    query = opponent_argument or session.analysis.get("summary", "") or session.case_facts
    ctx = session.retrieve_context(query, top_k=4)

    case_block = (
        f"DOMAIN: {session.analysis.get('domain', 'Other')}\n"
        f"CASE FACTS:\n{session.case_facts[:2500]}\n\n"
        f"GOVERNING ACTS (from senior counsel): {', '.join(session.analysis.get('governing_acts', [])) or 'unspecified'}\n"
    )
    user_block = (
        f"{case_block}\n"
        f"PRECEDENTS (cite by exact docid only):\n{_format_precedents(ctx)}\n\n"
        f"COURTROOM SO FAR:\n{_format_transcript(session.transcript)}\n\n"
    )
    if opponent_argument:
        user_block += f"OPPOSING COUNSEL JUST ARGUED:\n{opponent_argument[:1500]}\n\nDeliver your rebuttal now."
    else:
        user_block += "Deliver your opening argument now."

    yield {"type": "turn_meta", "side": side, "speaker": "ai", "role_label": role_label}

    full = ""
    emitted = 0
    usage_in = usage_out = 0
    try:
        with _get_client().messages.stream(
            model=COURTROOM_MODEL,
            max_tokens=1100,
            temperature=0.4,
            system=_build_argument_system(side),
            messages=[{"role": "user", "content": user_block}],
        ) as stream:
            for delta in stream.text_stream:
                full += delta
                # Only stream the prose portion (suppress the citations fence)
                cut = full.find("```")
                prose_now = full if cut == -1 else full[:cut]
                if len(prose_now) > emitted:
                    chunk = prose_now[emitted:]
                    emitted = len(prose_now)
                    yield {"type": "delta", "side": side, "text": chunk}
            final = stream.get_final_message()
            usage_in = final.usage.input_tokens
            usage_out = final.usage.output_tokens
        tracker.log_call(COURTROOM_MODEL, usage_in, usage_out)
    except Exception as e:
        yield {"type": "error", "message": f"Attorney agent failed: {str(e)[:160]}"}
        return

    prose, citations = _parse_citations(full, session.precedent_index())
    turn = {
        "turn_id": session.next_turn_id(),
        "side": side,
        "speaker": "ai",
        "role_label": role_label,
        "argument": prose,
        "citations": citations,
        "timestamp": datetime.utcnow().isoformat(),
    }
    with _LOCK:
        session.transcript.append(turn)
    save_session(session)
    yield {"type": "turn", "data": turn}


def _record_user_turn(session: CourtroomSession, side: str, argument: str) -> dict:
    role_label = _SIDE_LABELS.get(side, side)
    # validate any docids the user referenced against the retrieved set
    citations = []
    for docid in set(re.findall(r"\b(\d{5,9})\b", argument or "")):
        meta = session.precedent_index().get(docid)
        if meta:
            citations.append(
                {
                    "docid": docid,
                    "label": meta["title"],
                    "statute_section": "",
                    "quote": "",
                    "url": meta["url"],
                    "grounded": True,
                }
            )
    turn = {
        "turn_id": session.next_turn_id(),
        "side": side,
        "speaker": "user",
        "role_label": f"{role_label} (You)",
        "argument": (argument or "").strip(),
        "citations": citations,
        "timestamp": datetime.utcnow().isoformat(),
    }
    with _LOCK:
        session.transcript.append(turn)
    save_session(session)
    return turn


def simulate_turn_stream(
    session: CourtroomSession,
    side: str,
    manual_argument: str = "",
) -> Generator[dict, None, None]:
    """
    State-machine step.
    - If manual_argument is given, `side` is the USER's side: record it, then the
      OPPOSING AI attorney rebuts (streamed).
    - Otherwise `side` is the AI attorney to speak next (auto debate).
    Always finishes with an updated jury verdict.
    """
    side = "accuser" if side not in ("accuser", "defense") else side

    if manual_argument and manual_argument.strip():
        user_turn = _record_user_turn(session, side, manual_argument)
        yield {"type": "turn", "data": user_turn}
        opposing = "defense" if side == "accuser" else "accuser"
        yield from _generate_argument_stream(session, opposing, manual_argument.strip())
    else:
        last = session.transcript[-1] if session.transcript else None
        opponent_arg = ""
        if last and last["side"] != side:
            opponent_arg = last["argument"]
        yield from _generate_argument_stream(session, side, opponent_arg)

    try:
        verdict = compute_jury_verdict(session)
        yield {"type": "verdict", "data": verdict}
    except Exception as e:
        yield {"type": "error", "message": f"Jury scoring failed: {str(e)[:160]}"}

    yield {"type": "done"}


# ── Node 5: Jury Evaluator Agent + Scoring Engine ────────────────────────────
_JURY_PROMPT = """You are an objective, neutral Jury Evaluator in an Indian courtroom simulation.
You do not take sides. You assess how well each side has argued, and you POLICE HALLUCINATIONS:
if a side cited a case/section that is NOT in the provided GROUNDED AUTHORITIES, flag it.

Score each side on three axes, each from 0.0 to 1.0:
- statute: strength of statutory alignment (explicit sections/articles correctly applied).
- precedent: strength + hierarchy of cited precedents actually present in GROUNDED AUTHORITIES
  (Supreme Court > High Court > tribunal > district — weights are provided; reward correct, on-point, high-weight citations; penalise empty or misapplied ones).
- factual: how well the argument is grounded in the stated CASE FACTS (evidence coverage).

Return ONLY this JSON:
{
  "accuser": {"statute": {"score": <0-1>, "rationale": "<=20 words"},
               "precedent": {"score": <0-1>, "rationale": "<=20 words"},
               "factual": {"score": <0-1>, "rationale": "<=20 words"}},
  "defense": {"statute": {...}, "precedent": {...}, "factual": {...}},
  "hallucination_flags": ["<short note on any unsupported citation, or empty list>"],
  "rationale": "<2-3 sentences: who is currently ahead and why>"
}"""


def _condense_side(transcript: List[Dict], side: str) -> str:
    parts = []
    for t in transcript:
        if t["side"] == side:
            cites = ", ".join(
                f"{c.get('docid','?')}:{c.get('label','')}" for c in t.get("citations", [])
            )
            parts.append(f"- {t.get('argument','')[:500]}\n  cited: [{cites or 'none'}]")
    return "\n".join(parts) if parts else "(this side has not argued yet)"


def compute_jury_verdict(session: CourtroomSession) -> dict:
    authorities = "\n".join(
        f"- docid={p['docid']} | {p['title']} ({p['court']}, weight={p.get('weight', 0.5):.2f})"
        for p in session.precedents
    ) or "(none retrieved)"

    user_block = f"""CASE FACTS:
{session.case_facts[:2000]}

GROUNDED AUTHORITIES (the ONLY valid precedents; anything else is a hallucination):
{authorities}

ACCUSER (Plaintiff/Prosecution) ARGUMENTS:
{_condense_side(session.transcript, 'accuser')}

DEFENCE ARGUMENTS:
{_condense_side(session.transcript, 'defense')}

Score both sides and flag any unsupported citation. Return ONLY the JSON."""

    resp = _get_client().messages.create(
        model=JURY_MODEL,
        max_tokens=900,
        temperature=0,
        system=_JURY_PROMPT,
        messages=[{"role": "user", "content": user_block}],
    )
    tracker.log_call(JURY_MODEL, resp.usage.input_tokens, resp.usage.output_tokens)
    parsed = _extract_json(resp.content[0].text) or {}

    def _side(d: dict) -> dict:
        def comp(key: str) -> dict:
            c = (d or {}).get(key, {}) if isinstance(d, dict) else {}
            try:
                score = float(c.get("score", 0.0))
            except (TypeError, ValueError):
                score = 0.0
            return {"score": max(0.0, min(1.0, score)), "rationale": str(c.get("rationale", ""))[:160]}

        statute = comp("statute")
        precedent = comp("precedent")
        factual = comp("factual")
        s_jury = (
            WEIGHTS["statute"] * statute["score"]
            + WEIGHTS["precedent"] * precedent["score"]
            + WEIGHTS["factual"] * factual["score"]
        )
        return {
            "statute": statute,
            "precedent": precedent,
            "factual": factual,
            "s_jury": round(s_jury, 4),
        }

    accuser = _side(parsed.get("accuser", {}))
    defense = _side(parsed.get("defense", {}))
    margin = round(accuser["s_jury"] - defense["s_jury"], 4)
    if abs(margin) < 0.05:
        leaning = "balanced"
    else:
        leaning = "accuser" if margin > 0 else "defense"

    flags = parsed.get("hallucination_flags", [])
    if not isinstance(flags, list):
        flags = []
    flags = [str(f)[:200] for f in flags if str(f).strip()]

    return {
        "accuser": accuser,
        "defense": defense,
        "leaning": leaning,
        "margin": margin,
        "rationale": str(parsed.get("rationale", ""))[:600],
        "hallucination_flags": flags,
        "weights": WEIGHTS,
        "disclaimer": DISCLAIMER,
    }
