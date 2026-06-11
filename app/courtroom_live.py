"""
Live courtroom orchestrator — Gemini 3 (Lead Court Coordinator) + Elasticsearch MCP.

Implements the 3-step agentic mission under human-in-the-loop oversight:
  Phase 1  plan_case        — Gemini analyzes facts, classifies domain, compiles ES Query DSL/ES|QL.
  [HITL gate: user reviews & approves the search strategy in the UI]
  Phase 2  execute_search   — live MCP tool calls (list_indices -> get_mappings -> search).
  Phase 3  simulate_turn_*  — Accuser/Defense Gemini agents fueled by retrieved Elastic docs.
           compute_jury_verdict_live — S_jury = 0.4*statute + 0.4*precedent + 0.2*factual.

100% live. No mock data. LLM: Gemini first, Claude fallback when Gemini fails.
"""
from __future__ import annotations

import json
import os
import time
from datetime import datetime
from typing import Any, Dict, Generator, List, Optional

from app import gemini_engine
from app.kanoon_client import court_weight
from app.mcp_elastic_client import ElasticMCPError, get_mcp_client
from app.retrieval import HybridRetriever
from app.courtroom import (
    WEIGHTS,
    DISCLAIMER,
    CourtroomSession,
    analyze_and_plan_elastic,
    argue_stream_elastic,
    claude_configured,
    claude_status,
    create_session,
    get_session,
    save_session,
    score_jury_elastic,
    _LOCK,
    _chunk_text,
    _format_precedents,
    _format_transcript,
    _parse_citations,
    _record_user_turn,
    _condense_side,
    _SIDE_LABELS,
)

ELASTIC_INDEX = os.getenv("ELASTIC_INDEX", "legal-judgments")


class LiveLLMError(RuntimeError):
    pass


def _plan_with_llm(case_facts: str) -> tuple[dict, str]:
    gemini_err: Optional[Exception] = None
    try:
        plan = gemini_engine.analyze_and_plan(case_facts, default_index=ELASTIC_INDEX)
        return plan, "gemini"
    except gemini_engine.GeminiError as e:
        gemini_err = e
        print(f"[WARN] Gemini planning failed, trying Claude: {e}")

    if not claude_configured():
        raise LiveLLMError(
            f"Gemini planning failed ({gemini_err}). "
            "Set ANTHROPIC_API_KEY for Claude fallback."
        ) from gemini_err
    try:
        return analyze_and_plan_elastic(case_facts, ELASTIC_INDEX), "claude"
    except Exception as e:
        raise LiveLLMError(f"Gemini failed ({gemini_err}); Claude planning failed: {e}") from e


def _score_jury_with_llm(
    case_facts: str,
    authorities_block: str,
    accuser_block: str,
    defense_block: str,
    *,
    prefer: str = "gemini",
) -> tuple[dict, str]:
    engines = ("gemini", "claude") if prefer == "gemini" else ("claude", "gemini")
    errors: List[str] = []
    for engine in engines:
        try:
            if engine == "gemini":
                return (
                    gemini_engine.score_jury(
                        case_facts, authorities_block, accuser_block, defense_block
                    ),
                    "gemini",
                )
            if claude_configured():
                return (
                    score_jury_elastic(
                        case_facts, authorities_block, accuser_block, defense_block
                    ),
                    "claude",
                )
            errors.append("ANTHROPIC_API_KEY not set")
        except Exception as e:
            errors.append(f"{engine}: {e}")
            print(f"[WARN] {engine} jury scoring failed: {e}")
    raise LiveLLMError("Jury scoring failed — " + "; ".join(errors))


# ── Phase 1: plan ─────────────────────────────────────────────────────────────
def plan_case(case_facts: str) -> Dict[str, Any]:
    """LLM compiles the search strategy (Gemini, Claude fallback). Opens a session."""
    plan, engine = _plan_with_llm(case_facts)
    analysis = {
        "domain": plan.get("domain", "Other"),
        "domain_confidence": plan.get("domain_confidence", 0.5),
        "summary": plan.get("summary", ""),
        "issues": plan.get("issues", []),
        "governing_acts": plan.get("legal_entities", []),
        "suggested_court": "supremecourt",
    }
    session = create_session(case_facts, analysis)
    with _LOCK:
        session.engine = engine
        session.plan = plan
    save_session(session)
    return {"session_id": session.id, "analysis": analysis, "plan": plan, "engine": engine}


# ── Phase 2: execute live MCP search ──────────────────────────────────────────
def _extract_hits(result_json: Any) -> List[Dict[str, Any]]:
    """Robustly pull ES hit documents from a (possibly wrapped) MCP search result."""
    if not isinstance(result_json, (dict, list)):
        return []

    def find_hits(node: Any) -> Optional[List[dict]]:
        if isinstance(node, dict):
            h = node.get("hits")
            if isinstance(h, dict) and isinstance(h.get("hits"), list):
                return h["hits"]
            if isinstance(h, list):
                return h
            for v in node.values():
                found = find_hits(v)
                if found is not None:
                    return found
        elif isinstance(node, list):
            for v in node:
                found = find_hits(v)
                if found is not None:
                    return found
        return None

    return find_hits(result_json) or []


def _first(d: dict, *keys: str, default: str = "") -> str:
    for k in keys:
        v = d.get(k)
        if isinstance(v, list) and v:
            v = v[0]
        if v not in (None, ""):
            return str(v)
    return default


def _hit_to_precedent(hit: Dict[str, Any]) -> Dict[str, Any]:
    src = hit.get("_source") or hit.get("source") or hit
    docid = str(hit.get("_id") or _first(src, "docid", "id", "tid") or "")
    title = _first(src, "title", "case_title", "name", "doc_title", default=f"Document {docid}")
    court = _first(src, "court", "docsource", "bench", "tribunal")
    url = _first(src, "url", "link", "source_url")
    date = _first(src, "date", "publishdate", "judgment_date", "decided_on")
    body = _first(src, "text", "content", "judgment", "body", "headline", "summary")
    return {
        "docid": docid,
        "title": title,
        "court": court,
        "url": url,
        "date": date,
        "snippet": (body[:300] if body else _first(src, "headline", "summary")[:300]),
        "_body": body,
        "weight": court_weight(court) if court else 0.7,
        "score": hit.get("_score"),
    }


def execute_search(
    session: CourtroomSession,
    query_dsl: Optional[Dict[str, Any]] = None,
    index: Optional[str] = None,
    run_esql: bool = False,
) -> Dict[str, Any]:
    """Phase 2 (post-approval): live list_indices -> get_mappings -> search via Elastic MCP."""
    mcp = get_mcp_client()
    plan = session.plan or {}
    index = (index or plan.get("target_index") or ELASTIC_INDEX).strip()
    body = query_dsl or plan.get("query_dsl") or {"query": {"multi_match": {"query": session.case_facts[:200], "fields": ["*"]}}, "size": 10}
    if "query" not in body:
        body = {"query": body}

    diagnostics: Dict[str, Any] = {
        "index": index,
        "endpoint": mcp.masked_endpoint,
        "query_dsl": body,
        "esql": plan.get("esql", ""),
        "steps": [],
    }
    t0 = time.perf_counter()

    # Live connect (raises ElasticMCPError if creds/endpoint bad)
    info = mcp.connect()
    diagnostics["protocol_version"] = info["protocolVersion"]
    diagnostics["server_info"] = info["serverInfo"]

    # 1) list_indices — verify availability
    t_idx = time.perf_counter()
    idx_res = mcp.list_indices()
    index_names = _index_names(idx_res)
    cluster_names = mcp.list_cluster_indices()
    if cluster_names:
        index_names = sorted(set(index_names) | set(cluster_names))
    diagnostics["steps"].append({
        "tool": "list_indices",
        "ms": round((time.perf_counter() - t_idx) * 1000, 1),
        "count": len(index_names),
    })
    diagnostics["indices_sample"] = index_names[:25]
    if index_names and index not in index_names and not _pattern_matches(index, index_names):
        raise ElasticMCPError(
            f"Index '{index}' not found on the cluster. Available (sample): {index_names[:10]}"
        )
    if not index_names:
        diagnostics["indices_warning"] = (
            f"No indices visible on the cluster. Create '{index}' and ingest documents, "
            "or run: python -m app.elastic_seed"
        )

    # 2) get_mappings — validate schema
    t_map = time.perf_counter()
    field_count = 0
    try:
        map_res = mcp.get_mappings(index)
        field_count = _count_fields(map_res.get("json"))
    except ElasticMCPError as e:
        diagnostics["mappings_warning"] = str(e)
    diagnostics["steps"].append({
        "tool": "get_mappings",
        "ms": round((time.perf_counter() - t_map) * 1000, 1),
        "field_count": field_count,
    })

    # 3) search — execute the approved Query DSL
    t_search = time.perf_counter()
    search_res = mcp.search_dsl(index, body)
    search_ms = round((time.perf_counter() - t_search) * 1000, 1)
    hits = _extract_hits(search_res.get("json"))
    diagnostics["steps"].append({
        "tool": "search",
        "ms": search_ms,
        "hit_count": len(hits),
    })

    # Optional ES|QL analytical pass (non-fatal)
    if run_esql and plan.get("esql"):
        try:
            t_esql = time.perf_counter()
            esql_res = mcp.esql(plan["esql"])
            diagnostics["steps"].append({
                "tool": "esql",
                "ms": round((time.perf_counter() - t_esql) * 1000, 1),
            })
            diagnostics["esql_result"] = (esql_res.get("text") or "")[:1500]
        except ElasticMCPError as e:
            diagnostics["esql_warning"] = str(e)

    precedents = [_hit_to_precedent(h) for h in hits]
    precedents = [p for p in precedents if p["docid"] or p["_body"]]

    # Build a local semantic index over retrieved bodies for argument grounding
    sections: List[Dict] = []
    text_meta: Dict[str, Dict] = {}
    for p in precedents:
        body_text = (p.pop("_body", "") or p.get("snippet", ""))[:18000]
        for ch in _chunk_text(body_text, size=600):
            sections.append({"section": p["title"], "text": ch})
            text_meta[ch] = {
                "docid": p["docid"],
                "title": p["title"],
                "court": p["court"],
                "url": p.get("url", ""),
                "weight": p.get("weight", 0.7),
            }

    diagnostics["total_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    diagnostics["hit_count"] = len(precedents)
    diagnostics["completed_at"] = datetime.utcnow().isoformat()

    with _LOCK:
        session.precedents = precedents
        session._text_meta = text_meta
        session.diagnostics = diagnostics
        if sections:
            try:
                session.retriever = HybridRetriever(sections, bill_key=f"elastic_{session.id}")
            except Exception as e:
                print(f"[WARN] precedent index build failed: {e}")
                session.retriever = None
    save_session(session)

    return {"precedents": precedents, "diagnostics": diagnostics}


def _index_names(idx_res: Dict[str, Any]) -> List[str]:
    data = idx_res.get("json")
    names: List[str] = []

    def add_name(item: Any) -> None:
        if isinstance(item, str) and item:
            names.append(item)
        elif isinstance(item, dict):
            n = item.get("index") or item.get("name")
            if n:
                names.append(str(n))

    if isinstance(data, list):
        for it in data:
            add_name(it)
    elif isinstance(data, dict):
        # platform_core_list_indices: {"results":[{"data":{"indices":[],"aliases":[],...}}]}
        for block in data.get("results") or []:
            if not isinstance(block, dict):
                continue
            payload = block.get("data") if isinstance(block.get("data"), dict) else block
            for key in ("indices", "aliases", "data_streams"):
                for it in payload.get(key) or []:
                    add_name(it)
        if isinstance(data.get("indices"), list):
            for it in data["indices"]:
                add_name(it)
        elif not names and "results" not in data:
            names.extend(list(data.keys()))
    elif data is None and idx_res.get("text"):
        # Only when MCP returned plain text (not structured JSON).
        for tok in str(idx_res["text"]).replace(",", " ").split():
            if tok and not tok.startswith(("{", "[", '"', "'")):
                names.append(tok.strip("[]{}:\"'"))
    return names


def _pattern_matches(index: str, names: List[str]) -> bool:
    if "*" in index:
        import fnmatch
        return any(fnmatch.fnmatch(n, index) for n in names)
    return False


def _count_fields(mapping_json: Any) -> int:
    if not isinstance(mapping_json, (dict, list)):
        return 0
    count = 0

    def walk(node: Any):
        nonlocal count
        if isinstance(node, dict):
            props = node.get("properties")
            if isinstance(props, dict):
                count += len(props)
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(mapping_json)
    return count


# ── Phase 3: Gemini courtroom debate (streamed) ──────────────────────────────
def _generate_argument_stream_live(
    session: CourtroomSession,
    side: str,
    opponent_argument: str,
) -> Generator[dict, None, None]:
    role_label = _SIDE_LABELS.get(side, side)
    query = opponent_argument or session.analysis.get("summary", "") or session.case_facts
    ctx = session.retrieve_context(query, top_k=4)

    yield {"type": "turn_meta", "side": side, "speaker": "ai", "role_label": role_label}

    full = ""
    emitted = 0
    case_facts = session.case_facts
    domain = session.analysis.get("domain", "Other")
    precedent_block = _format_precedents(ctx)
    transcript_block = _format_transcript(session.transcript)
    prefer = getattr(session, "engine", "gemini") or "gemini"

    def _stream(engine: str) -> Generator[str, None, None]:
        if engine == "claude":
            yield from argue_stream_elastic(
                side, case_facts, domain, precedent_block, transcript_block, opponent_argument
            )
        else:
            yield from gemini_engine.argue_stream(
                side, case_facts, domain, precedent_block, transcript_block, opponent_argument
            )

    engines = (prefer, "claude" if prefer == "gemini" else "gemini")
    streamed = False
    for engine in engines:
        if engine == "claude" and not claude_configured():
            continue
        try:
            for delta in _stream(engine):
                streamed = True
                full += delta
                cut = full.find("```")
                prose_now = full if cut == -1 else full[:cut]
                if len(prose_now) > emitted:
                    chunk = prose_now[emitted:]
                    emitted = len(prose_now)
                    yield {"type": "delta", "side": side, "text": chunk}
            with _LOCK:
                session.engine = engine
            break
        except Exception as e:
            print(f"[WARN] {engine} attorney failed: {e}")
            if engine == engines[-1]:
                yield {"type": "error", "message": f"Attorney failed ({engine}): {str(e)[:200]}"}
                return
            full = ""
            emitted = 0

    if not streamed:
        yield {"type": "error", "message": "No LLM available for attorney (configure Gemini or Claude)."}
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


def simulate_turn_stream_live(
    session: CourtroomSession,
    side: str,
    manual_argument: str = "",
) -> Generator[dict, None, None]:
    side = "accuser" if side not in ("accuser", "defense") else side
    if not session.precedents:
        yield {"type": "error", "message": "No precedents loaded. Approve & run the Elasticsearch search first."}
        yield {"type": "done"}
        return

    if manual_argument and manual_argument.strip():
        user_turn = _record_user_turn(session, side, manual_argument)
        yield {"type": "turn", "data": user_turn}
        opposing = "defense" if side == "accuser" else "accuser"
        yield from _generate_argument_stream_live(session, opposing, manual_argument.strip())
    else:
        last = session.transcript[-1] if session.transcript else None
        opponent_arg = ""
        if last and last["side"] != side:
            opponent_arg = last["argument"]
        yield from _generate_argument_stream_live(session, side, opponent_arg)

    try:
        verdict = compute_jury_verdict_live(session)
        yield {"type": "verdict", "data": verdict}
    except Exception as e:
        yield {"type": "error", "message": f"Jury scoring failed: {str(e)[:200]}"}

    yield {"type": "done"}


# ── Jury scoring (hardcoded S_jury weights) ──────────────────────────────────
def compute_jury_verdict_live(session: CourtroomSession) -> dict:
    authorities = "\n".join(
        f"- docid={p['docid']} | {p['title']} ({p.get('court','')}, weight={p.get('weight', 0.7):.2f})"
        for p in session.precedents
    ) or "(none retrieved)"

    parsed, engine = _score_jury_with_llm(
        session.case_facts,
        authorities,
        _condense_side(session.transcript, "accuser"),
        _condense_side(session.transcript, "defense"),
        prefer=getattr(session, "engine", "gemini") or "gemini",
    )
    with _LOCK:
        session.engine = engine

    def _side(d: dict) -> dict:
        def comp(key: str) -> dict:
            c = (d or {}).get(key, {}) if isinstance(d, dict) else {}
            try:
                score = float(c.get("score", 0.0))
            except (TypeError, ValueError):
                score = 0.0
            return {"score": max(0.0, min(1.0, score)), "rationale": str(c.get("rationale", ""))[:160]}

        statute, precedent, factual = comp("statute"), comp("precedent"), comp("factual")
        s_jury = (
            WEIGHTS["statute"] * statute["score"]
            + WEIGHTS["precedent"] * precedent["score"]
            + WEIGHTS["factual"] * factual["score"]
        )
        return {"statute": statute, "precedent": precedent, "factual": factual, "s_jury": round(s_jury, 4)}

    accuser = _side(parsed.get("accuser", {}))
    defense = _side(parsed.get("defense", {}))
    margin = round(accuser["s_jury"] - defense["s_jury"], 4)
    leaning = "balanced" if abs(margin) < 0.05 else ("accuser" if margin > 0 else "defense")

    flags = parsed.get("hallucination_flags", [])
    flags = [str(f)[:200] for f in flags if str(f).strip()] if isinstance(flags, list) else []

    return {
        "accuser": accuser,
        "defense": defense,
        "leaning": leaning,
        "margin": margin,
        "rationale": str(parsed.get("rationale", ""))[:600],
        "hallucination_flags": flags,
        "weights": WEIGHTS,
        "disclaimer": DISCLAIMER,
        "engine": engine,
    }


# ── Infra telemetry ──────────────────────────────────────────────────────────
def infra_status() -> Dict[str, Any]:
    mcp = get_mcp_client()
    return {
        "elastic": mcp.health(),
        "gemini": gemini_engine.gemini_status(),
        "claude": claude_status(),
        "llm_fallback": "claude",
        "weights": WEIGHTS,
        "default_index": ELASTIC_INDEX,
    }
