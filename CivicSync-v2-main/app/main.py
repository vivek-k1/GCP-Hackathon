import os
import json
from datetime import datetime
import re
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

from app.pdf_parser import load_all_bills, BILL_DISPLAY_NAMES, BILL_TAGS, extract_text_from_bytes, chunk_by_section
from app.retrieval import HybridRetriever
from app.llm_handler import summarize_with_citations, verify_with_haiku
from app.schemas import BillResponse, SonnetSummary, HaikuJudgement
from app.cost_tracker import tracker

import textstat

app = FastAPI(title="Policy Explainer — CivicSync", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BILLS: dict = {}
RETRIEVERS: dict = {}
# Sessionless upload store (demo / single-user); same idea as Streamlit session_state uploads
UPLOADED_BILLS_DATA: dict = {}
UPLOADED_RETRIEVERS: dict = {}


def _get_retriever(bill_key: str):
    if bill_key in RETRIEVERS:
        return RETRIEVERS[bill_key]
    if bill_key in UPLOADED_RETRIEVERS:
        return UPLOADED_RETRIEVERS[bill_key]
    return None


def _bill_display_name(bill_key: str) -> str:
    if bill_key in BILL_DISPLAY_NAMES:
        return BILL_DISPLAY_NAMES[bill_key]
    if bill_key in UPLOADED_BILLS_DATA:
        return UPLOADED_BILLS_DATA[bill_key]["display_name"]
    return bill_key.upper()

DISCLAIMER = (
    "AI-generated information only — NOT legal advice. "
    "Consult a qualified advocate before taking any action. "
    "Source: India Code / Parliament of India."
)


@app.on_event("startup")
async def startup():
    global BILLS, RETRIEVERS
    BILLS = load_all_bills()
    for key, data in BILLS.items():
        RETRIEVERS[key] = HybridRetriever(data["chunks"], bill_key=key)
        print(f"[OK] Retriever ready for {key}")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "bills_loaded": list(BILLS.keys()) + list(UPLOADED_BILLS_DATA.keys()),
        "cost_summary": tracker.summary(),
        "endpoints": {"upload_bill": "POST /upload-bill", "bills": "GET /bills"},
    }


@app.post("/summarize")
async def summarize(
    bill: str = Query(..., description="Bill key: dpdp | social_security | bns | telecom"),
    query: str = Query(..., description="User question about the bill"),
    persona: Optional[str] = Query(None, description="User persona for filtered impacts"),
    top_k: int = Query(3, ge=1, le=10),
):
    retriever = _get_retriever(bill)
    if retriever is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown bill '{bill}'. Valid keys: {list(BILLS.keys()) + list(UPLOADED_BILLS_DATA.keys())}",
        )

    results = retriever.retrieve(query, top_k=top_k)

    if not results:
        raise HTTPException(status_code=404, detail="No relevant sections found for this query.")

    top = results[0]
    bill_name = _bill_display_name(bill)

    try:
        sonnet_resp = summarize_with_citations(
            bill_text=top["text"],
            section_name=top["section"],
            bill_name=bill_name,
            custom_persona=persona or "",
            user_question=query,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sonnet summarization failed: {e}")

    summary_json = sonnet_resp["summary"]

    try:
        haiku_resp = verify_with_haiku(top["text"], summary_json)
    except Exception as e:
        # Non-fatal: return summary without verification
        haiku_resp = {
            "overall_faithfulness_score": None,
            "requires_human_review": True,
            "red_flags": [f"Haiku verification failed: {e}"],
            "approval": False,
        }

    # Compute actual grade level on the summary text
    summary_text = " ".join([
        summary_json.get("tl_dr", ""),
        summary_json.get("purpose", ""),
        " ".join(p.get("provision", "") for p in summary_json.get("key_provisions", [])),
    ])
    computed_grade = textstat.flesch_kincaid_grade(summary_text) if summary_text.strip() else 8.0
    summary_json["grade_level"] = round(computed_grade, 1)

    return BillResponse(
        bill=bill,
        bill_display_name=bill_name,
        section=top["section"],
        source_text=top["text"][:3000],  # Limit for UI rendering
        summary=SonnetSummary(**summary_json),
        faithfulness_score=haiku_resp.get("overall_faithfulness_score") or 0.0,
        requires_review=haiku_resp.get("requires_human_review", True),
        red_flags=haiku_resp.get("red_flags", []),
        tokens_used={
            "sonnet": sonnet_resp["usage"],
            "haiku": haiku_resp.get("usage", {}),
        },
        generated_at=datetime.utcnow().isoformat(),
        disclaimer=DISCLAIMER,
    )


@app.get("/bills")
def list_bills():
    out = {
        key: {
            "display_name": data["display_name"],
            "num_sections": len(data["chunks"]),
            "tag": BILL_TAGS.get(key, "Central"),
        }
        for key, data in BILLS.items()
    }
    for key, data in UPLOADED_BILLS_DATA.items():
        out[key] = {
            "display_name": f"[Uploaded] {data['display_name']}",
            "num_sections": len(data["chunks"]),
            "uploaded": True,
        }
    return out


@app.post("/upload-bill")
async def upload_bill(file: UploadFile = File(...)):
    """Accept a PDF, chunk it, and register it as an ephemeral bill key (upload_*)."""
    global UPLOADED_BILLS_DATA, UPLOADED_RETRIEVERS

    name = (file.filename or "").strip()
    if not name.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    contents = await file.read()
    max_bytes = 200 * 1024 * 1024
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail="File exceeds 200 MB per file.")

    base = name.rsplit(".", 1)[0]
    slug = re.sub(r"\W+", "_", base.lower()) or "document"
    slug = slug.strip("_")[:28]
    ukey = f"upload_{slug}"

    try:
        text = extract_text_from_bytes(contents)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read PDF: {e}")

    if len(text.strip()) < 400:
        raise HTTPException(
            status_code=400,
            detail="Could not extract enough text — this may be a scanned PDF. Use a text-based PDF.",
        )

    chunks = chunk_by_section(text, ukey)
    display = base.replace(".PDF", "")
    UPLOADED_BILLS_DATA[ukey] = {
        "display_name": display,
        "chunks": chunks,
        "text": text[:50_000],
        "path": "uploaded",
        "tag": "Uploaded",
    }
    UPLOADED_RETRIEVERS[ukey] = HybridRetriever(chunks, bill_key=ukey)

    return {
        "bill_key": ukey,
        "display_name": display,
        "num_sections": len(chunks),
    }


@app.delete("/upload-bill/{bill_key:path}")
def delete_uploaded_bill(bill_key: str):
    """Remove an uploaded bill from server memory."""
    global UPLOADED_BILLS_DATA, UPLOADED_RETRIEVERS

    if not bill_key.startswith("upload_"):
        raise HTTPException(status_code=400, detail="Only keys starting with upload_ can be removed here.")
    UPLOADED_BILLS_DATA.pop(bill_key, None)
    UPLOADED_RETRIEVERS.pop(bill_key, None)
    return {"ok": True}


@app.get("/cost")
def cost_summary():
    return tracker.summary()


# ── New CivicSync endpoints ───────────────────────────────────────────────


@app.post("/verdict-agents")
async def verdict_agents_stream(
    bill: str = Query(..., description="Bill key"),
    query: str = Query(..., description="User question about the bill"),
    persona: Optional[str] = Query(
        None,
        description="Reader persona (e.g. Student) for tailored summary and agent angles",
    ),
    top_k: int = Query(3, ge=1, le=10),
):
    """
    SSE endpoint: streams verdict agent results one at a time.
    Each event is a JSON object with the agent's analysis.
    """
    retriever = _get_retriever(bill)
    if retriever is None:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown bill '{bill}'. Valid keys: {list(BILLS.keys()) + list(UPLOADED_BILLS_DATA.keys())}",
        )

    results = retriever.retrieve(query, top_k=top_k)
    if not results:
        raise HTTPException(status_code=404, detail="No relevant sections found.")

    top = results[0]
    bill_name = _bill_display_name(bill)

    try:
        sonnet_resp = summarize_with_citations(
            bill_text=top["text"],
            section_name=top["section"],
            bill_name=bill_name,
            custom_persona=persona or "",
            user_question=query,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Summarization failed: {e}")

    summary_json = sonnet_resp["summary"]

    def event_stream():
        from app.verdict_agents import run_verdict_agents, synthesize_reader_overall

        yield f"data: {json.dumps({'type': 'summary', 'data': summary_json})}\n\n"

        agent_results: list = []
        for agent_result in run_verdict_agents(
            summary_json,
            bill_name,
            user_query=query,
            reader_persona=persona or "",
        ):
            agent_results.append(agent_result)
            yield f"data: {json.dumps({'type': 'agent', 'data': agent_result})}\n\n"

        overall_payload = synthesize_reader_overall(
            bill_name=bill_name,
            user_query=query,
            reader_persona=persona or "",
            summary_json=summary_json,
            agent_results=agent_results,
        )
        yield f"data: {json.dumps({'type': 'overall', 'data': overall_payload})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/check-rights")
async def check_rights_endpoint(
    situation: str = Query(..., description="User's described situation"),
):
    """Check user rights against applicable legislation."""
    from app.rights_checker import check_rights
    try:
        result = check_rights(situation)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Rights check failed: {e}")


@app.post("/detect-conflicts")
async def detect_conflicts_endpoint(
    bill_a: str = Query(..., description="First bill key"),
    bill_b: str = Query(..., description="Second bill key"),
    topic: str = Query("", description="Topic to analyze"),
):
    """Detect conflicts and overlaps between two bills."""
    from app.conflict_detector import detect_conflicts
    try:
        result = detect_conflicts(bill_a, bill_b, topic)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Conflict detection failed: {e}")


@app.get("/state-bills/meta")
def state_bills_meta():
    """Metadata for the state bills browser (data/bills_states.csv when present)."""
    from app.state_bills import load_state_bills, get_states, get_year_range

    rows = load_state_bills()
    y0, y1 = get_year_range()
    states = get_states()
    return {
        "total_count": len(rows),
        "states": ["All States", *states],
        "year_from_default": y0,
        "year_to_default": y1,
        "dataset_present": len(rows) > 0,
        "source_note": "PRS Legislative Research — place bills_states.csv under data/ to enable browsing.",
    }


@app.get("/state-bills")
def state_bills_search(
    state: Optional[str] = Query(
        None, description="State name, or 'All States' / omit for every state"
    ),
    year_from: Optional[int] = Query(None, ge=1900, le=2100),
    year_to: Optional[int] = Query(None, ge=1900, le=2100),
    q: str = Query("", description="Keyword filter on bill title"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    from app.state_bills import filter_bills, load_state_bills

    if not load_state_bills():
        return {
            "rows": [],
            "total": 0,
            "limit": limit,
            "offset": offset,
            "message": "Dataset not found. Add data/bills_states.csv next to the app, or set STATE_BILLS_CSV to its path (see state_bills.py).",
        }

    st = None
    if state and state.strip() and state.strip() != "All States":
        st = state.strip()

    rows = filter_bills(state=st, year_from=year_from, year_to=year_to, query=q)
    total = len(rows)
    page = rows[offset : offset + limit]
    return {
        "rows": page,
        "total": total,
        "limit": limit,
        "offset": offset,
    }


if __name__ == "__main__":
    import uvicorn
    # Match civicsync-ui Vite proxy (vite.config.ts → 127.0.0.1:8005)
    uvicorn.run("app.main:app", host="0.0.0.0", port=8005, reload=True)
