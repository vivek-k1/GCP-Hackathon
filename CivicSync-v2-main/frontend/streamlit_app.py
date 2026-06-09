"""
Policy Explainer — Indian Legislation in Plain Language
Dark-mode Streamlit frontend with shadcn-inspired design.
"""

import sys
import os
import json
from pathlib import Path

ROOT = str(Path(__file__).parent.parent)
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import streamlit as st
from dotenv import load_dotenv

load_dotenv()

st.set_page_config(
    page_title="Policy Explainer — Indian Laws",
    page_icon="🏛️",
    layout="wide",
    initial_sidebar_state="expanded",
)

from frontend.theme import (
    SHADCN_CSS, notice_html, badge_html, label_html,
    CARD, BORDER, FG, MUTED_FG, ACCENT,
)
st.markdown(SHADCN_CSS, unsafe_allow_html=True)

# ── Resource loaders ────────────────────────────────────────────────────────
@st.cache_resource(show_spinner="Loading bills & building search indexes…")
def load_resources():
    from app.pdf_parser import load_all_bills
    from app.retrieval import HybridRetriever
    bills = load_all_bills()
    retrievers = {k: HybridRetriever(d["chunks"], bill_key=k) for k, d in bills.items()}
    return bills, retrievers


@st.cache_data(show_spinner=False)
def load_state_bills_data():
    from app.state_bills import load_state_bills, get_states, get_year_range
    return load_state_bills(), get_states(), get_year_range()


# ── Header ──────────────────────────────────────────────────────────────────
st.markdown(
    f"""
<div style="border-bottom:1px solid {BORDER};padding-bottom:1rem;margin-bottom:1.25rem;">
  <div style="display:flex;align-items:center;gap:0.75rem;">
    <span style="font-size:1.75rem;line-height:1;">🏛️</span>
    <div>
      <h1 style="margin:0;font-family:'DM Sans',sans-serif;font-size:1.375rem;
                 font-weight:700;letter-spacing:-0.025em;color:{FG};">
        Policy Explainer
      </h1>
      <p style="margin:0;font-size:0.8125rem;color:{MUTED_FG};">
        Indian legislation in plain language · Claude Sonnet 4.6 + Haiku 4.5
      </p>
    </div>
  </div>
</div>
""",
    unsafe_allow_html=True,
)

# ── Legal notice ─────────────────────────────────────────────────────────────
st.markdown(
    notice_html(
        "<strong>Information notice — not legal advice.</strong> "
        "AI-generated summaries do not substitute consultation with a qualified advocate. "
        "Always verify against the official Gazette text.",
        kind="warning",
    ),
    unsafe_allow_html=True,
)

# ── Load resources ──────────────────────────────────────────────────────────
try:
    _base_bills, _base_retrievers = load_resources()
except Exception as e:
    st.error(f"Failed to load bills: {e}")
    st.stop()

# Merge user-uploaded bills (session-scoped) with built-in bills
_uploaded_bills = st.session_state.get("uploaded_bills", {})
_uploaded_retrievers = st.session_state.get("uploaded_retrievers", {})
BILLS = {**_base_bills, **_uploaded_bills}
RETRIEVERS = {**_base_retrievers, **_uploaded_retrievers}

# ── Sidebar ─────────────────────────────────────────────────────────────────
with st.sidebar:
    st.markdown(label_html("SETTINGS"), unsafe_allow_html=True)

    BILL_OPTIONS = {
        "dpdp":            "DPDP Act 2023 — Data Protection",
        "social_security": "Code on Social Security 2020",
        "bns":             "Bharatiya Nyaya Sanhita 2023",
        "telecom":         "Telecommunications Act 2023",
        "maha_rent":       "Maharashtra Rent Control Act 1999 ★",
    }
    for _uk, _ud in _uploaded_bills.items():
        BILL_OPTIONS[_uk] = f"[Uploaded] {_ud['display_name']}"

    selected_key = st.selectbox(
        "Bill",
        options=list(BILL_OPTIONS.keys()),
        format_func=lambda k: BILL_OPTIONS[k],
    )

    PERSONAS = [
        "General User", "Gig Worker", "Farmer",
        "Small Business Owner", "Student", "Tenant", "Other (Custom)",
    ]
    selected_persona = st.selectbox("Who are you?", PERSONAS)

    custom_persona = ""
    if selected_persona == "Other (Custom)":
        st.markdown(
            f'<p style="font-size:0.8125rem;color:{MUTED_FG};margin:0.25rem 0 0.375rem;">',
            unsafe_allow_html=True,
        )
        custom_persona = st.text_area(
            label="Your background",
            value="I am a 28-year-old salaried IT employee in Bengaluru, "
                  "earning ₹8 lakh per year. I use Swiggy, Zepto, and Razorpay daily.",
            height=100,
            key="custom_persona_input",
            label_visibility="collapsed",
        )
        if not custom_persona.strip():
            st.warning("Please describe yourself for a personalised explanation.")

    language = st.radio("Language", ["English", "Hindi"])

    st.divider()

    # ── Upload a Bill ─────────────────────────────────────────────────────
    st.markdown(label_html("UPLOAD A BILL"), unsafe_allow_html=True)
    uploaded_file = st.file_uploader(
        "PDF",
        type=["pdf"],
        key="bill_upload",
        help="Upload any Indian bill or act as a PDF (max 100 pages). "
             "Image-scanned PDFs cannot be parsed.",
        label_visibility="collapsed",
    )

    if uploaded_file is not None:
        import re as _re
        _slug = _re.sub(r"\W+", "_", uploaded_file.name.lower().replace(".pdf", ""))[:28]
        _ukey = f"upload_{_slug}"

        if _ukey not in st.session_state.get("uploaded_bills", {}):
            with st.spinner(f"Parsing {uploaded_file.name}…"):
                try:
                    from app.pdf_parser import extract_text_from_bytes, chunk_by_section
                    from app.retrieval import HybridRetriever as _HR

                    _pdf_bytes = uploaded_file.read()
                    _text = extract_text_from_bytes(_pdf_bytes)

                    if len(_text.strip()) < 400:
                        st.error(
                            "PDF appears to be image-scanned — text could not be extracted. "
                            "Try a text-based PDF or paste the text manually."
                        )
                    else:
                        _chunks = chunk_by_section(_text, _ukey)
                        _display = uploaded_file.name.replace(".pdf", "").replace(".PDF", "")

                        if "uploaded_bills" not in st.session_state:
                            st.session_state["uploaded_bills"] = {}
                            st.session_state["uploaded_retrievers"] = {}

                        st.session_state["uploaded_bills"][_ukey] = {
                            "display_name": _display,
                            "chunks": _chunks,
                            "text": _text[:50_000],
                            "path": "uploaded",
                            "tag": "Uploaded",
                        }
                        st.session_state["uploaded_retrievers"][_ukey] = _HR(_chunks, _ukey)
                        st.rerun()
                except Exception as _e:
                    st.error(f"Upload failed: {_e}")

    # Show uploaded bills with remove buttons
    if st.session_state.get("uploaded_bills"):
        for _key, _data in list(st.session_state["uploaded_bills"].items()):
            _c1, _c2 = st.columns([4, 1])
            with _c1:
                st.markdown(
                    f'<p style="font-size:0.75rem;color:{MUTED_FG};margin:0.2rem 0;">'
                    f'📄 {_data["display_name"][:28]}<br>'
                    f'<span style="color:#52525b;">{len(_data["chunks"])} sections</span></p>',
                    unsafe_allow_html=True,
                )
            with _c2:
                if st.button("✕", key=f"rm_{_key}",
                             help="Remove this uploaded bill"):
                    del st.session_state["uploaded_bills"][_key]
                    del st.session_state["uploaded_retrievers"][_key]
                    st.rerun()

    st.divider()

    bill_data = BILLS.get(selected_key, {})
    tag = bill_data.get("tag", "Central")
    st.markdown(
        f'<div style="display:flex;flex-direction:column;gap:0.2rem;">'
        f'<span style="font-size:0.75rem;color:{MUTED_FG};">Bills loaded: <strong style="color:{FG};">{len(BILLS)}</strong></span>'
        f'<span style="font-size:0.75rem;color:{MUTED_FG};">Sections: <strong style="color:{FG};">{len(bill_data.get("chunks",[]))}</strong></span>'
        f'<span style="font-size:0.75rem;color:{MUTED_FG};">Type: <strong style="color:{FG};">{tag}</strong></span>'
        f'</div>',
        unsafe_allow_html=True,
    )

# ── Tabs ─────────────────────────────────────────────────────────────────────
tab_explain, tab_browse, tab_rights, tab_conflicts = st.tabs([
    "Explain a Law", "Browse State Bills", "Rights Checker", "Cross-Bill Analysis",
])


# ════════════════════════════════════════════════════════════════════════════
# TAB 1 — Explain a Law
# ════════════════════════════════════════════════════════════════════════════
with tab_explain:

    query = st.text_input(
        "Your question",
        placeholder="e.g. What is personal data?  What rights do I have as a tenant?",
        key="query_input",
        label_visibility="collapsed",
    )

    btn_col, clr_col = st.columns([3, 1])
    with btn_col:
        search_clicked = st.button("Get Explanation", type="primary", use_container_width=True)
    with clr_col:
        if st.button("Clear", use_container_width=True):
            for k in ["last_result", "last_query", "last_bill", "verdict_results"]:
                st.session_state.pop(k, None)
            st.rerun()

    # ── Query runner ──────────────────────────────────────────────────────
    def run_query(bill_key: str, query_text: str, persona: str = "") -> dict:
        from app.llm_handler import summarize_with_citations, verify_with_haiku
        from app.sanitizer import sanitize_persona, check_output_prescriptive
        import textstat

        persona = sanitize_persona(persona)
        results = RETRIEVERS[bill_key].retrieve(query_text, top_k=3)
        if not results:
            raise ValueError("No relevant sections found.")

        top = results[0]
        bill_name = BILLS[bill_key]["display_name"]
        sonnet = summarize_with_citations(
            top["text"], top["section"], bill_name, custom_persona=persona
        )
        summary_json = sonnet["summary"]

        pf = check_output_prescriptive(summary_json)
        if pf:
            summary_json["_prescriptive_flags"] = pf

        try:
            haiku = verify_with_haiku(top["text"], summary_json)
        except Exception as e:
            haiku = {"overall_faithfulness_score": None,
                     "requires_human_review": True, "red_flags": [str(e)]}

        blob = " ".join([
            summary_json.get("tl_dr", ""),
            summary_json.get("purpose", ""),
            " ".join(p.get("provision", "") for p in summary_json.get("key_provisions", [])),
        ])
        summary_json["grade_level"] = round(
            textstat.flesch_kincaid_grade(blob) if blob.strip() else 8.0, 1
        )
        return {
            "section": top["section"],
            "source_text": top["text"],
            "summary": summary_json,
            "faithfulness_score": haiku.get("overall_faithfulness_score"),
            "requires_review": haiku.get("requires_human_review", True),
            "red_flags": haiku.get("red_flags", []),
            "sonnet_usage": sonnet["usage"],
        }

    if search_clicked and query.strip():
        from app.sanitizer import sanitize_query
        clean_q, warn = sanitize_query(query.strip())
        if warn and not clean_q:
            st.error(warn)
        else:
            if warn:
                st.markdown(notice_html(warn, "warning"), unsafe_allow_html=True)
            with st.spinner("Retrieving · Summarising · Verifying…"):
                try:
                    res = run_query(selected_key, clean_q, custom_persona)
                    st.session_state.update({
                        "last_result": res, "last_query": clean_q,
                        "last_bill": selected_key,
                    })
                    st.session_state.pop("verdict_results", None)
                except Exception as e:
                    st.error(f"Error: {e}")
                    st.session_state.pop("last_result", None)
    elif search_clicked:
        st.warning("Please enter a question first.")

    # ── Results display ───────────────────────────────────────────────────
    if "last_result" in st.session_state:
        result = st.session_state["last_result"]
        summary = result["summary"]

        st.markdown('<div style="margin-top:1rem;"></div>', unsafe_allow_html=True)

        # ── Stat card row ─────────────────────────────────────────────────
        grade = summary.get("grade_level", "—")
        score = result.get("faithfulness_score")
        score_str = f"{score:.1f}/5" if score is not None else "N/A"
        score_col = "#4ade80" if (score or 0) >= 3.5 else "#f87171"

        st.markdown(
            f"""
<div class="sh-card" style="display:flex;align-items:center;
     justify-content:space-between;flex-wrap:wrap;gap:1rem;padding:1rem 1.5rem;">
  <div>
    <p class="sh-label" style="margin:0 0 0.2rem;">Section</p>
    <p style="margin:0;font-family:'DM Sans',sans-serif;font-size:1rem;
              font-weight:600;color:{FG};">{result['section']}</p>
  </div>
  <div style="display:flex;gap:2.5rem;">
    <div style="text-align:right;">
      <p class="sh-label" style="margin:0 0 0.2rem;">Reading Grade</p>
      <p style="margin:0;font-family:'DM Sans',sans-serif;font-size:1.5rem;
                font-weight:700;color:{FG};">
        {grade}<span style="font-size:0.875rem;color:{MUTED_FG};">/18</span>
      </p>
    </div>
    <div style="text-align:right;">
      <p class="sh-label" style="margin:0 0 0.2rem;">AI Accuracy</p>
      <p style="margin:0;font-family:'DM Sans',sans-serif;font-size:1.5rem;
                font-weight:700;color:{score_col};">{score_str}</p>
    </div>
  </div>
</div>
""",
            unsafe_allow_html=True,
        )

        if result.get("requires_review"):
            st.markdown(
                notice_html("Faithfulness score below threshold — treat with extra caution.", "warning"),
                unsafe_allow_html=True,
            )
        if summary.get("_prescriptive_flags"):
            st.markdown(
                notice_html(
                    "The summary contained prescriptive language ('you should…') and was flagged. "
                    "This is information only — not a personal recommendation.",
                    "warning",
                ),
                unsafe_allow_html=True,
            )

        # ── Split pane ────────────────────────────────────────────────────
        left, right = st.columns([1, 1], gap="large")

        with left:
            tl_dr   = summary.get("tl_dr", "")
            purpose = summary.get("purpose", "")

            # TL;DR card
            st.markdown(
                f'<div class="sh-card" style="border-left:3px solid #3b82f6;'
                f'padding:1rem 1.25rem;margin-bottom:0.75rem;">'
                f'<p class="sh-label" style="margin:0 0 0.3rem;color:#60a5fa;">TL;DR</p>'
                f'<p style="margin:0;font-family:\'DM Sans\',sans-serif;font-size:0.9375rem;'
                f'font-weight:600;color:{FG};line-height:1.4;">{tl_dr}</p>'
                f'</div>',
                unsafe_allow_html=True,
            )

            if purpose:
                st.markdown(
                    f'<p style="font-size:0.875rem;color:#d4d4d8;line-height:1.6;'
                    f'margin:0 0 0.75rem;">{purpose}</p>',
                    unsafe_allow_html=True,
                )

            # Key Provisions
            provisions = summary.get("key_provisions", [])
            if provisions:
                st.markdown(label_html("KEY PROVISIONS"), unsafe_allow_html=True)
                for prov in provisions:
                    with st.expander(f"{prov.get('provision','')[:72]}…"):
                        st.markdown(f"**Rule:** {prov.get('provision','')}")
                        st.markdown(
                            f'<code style="background:#27272a;color:#a1a1aa;'
                            f'padding:0.125rem 0.5rem;border-radius:0.25rem;'
                            f'font-size:0.75rem;">{prov.get("source_section","")}</code>',
                            unsafe_allow_html=True,
                        )
                        eg = prov.get("concrete_example", "")
                        if eg:
                            st.markdown(
                                f'<p style="font-size:0.8125rem;color:#a1a1aa;'
                                f'border-left:2px solid #3f3f46;padding-left:0.75rem;'
                                f'margin-top:0.5rem;line-height:1.5;">{eg}</p>',
                                unsafe_allow_html=True,
                            )

            # Persona impacts
            impacts = summary.get("persona_impacts", [])

            # Find impact for selected persona (or general user as fallback)
            persona_match = next(
                (i for i in impacts
                 if i.get("persona", "").lower() == selected_persona.lower()),
                next(
                    (i for i in impacts if i.get("persona", "").lower() == "general user"),
                    None
                )
            )

            st.markdown(label_html(f"FOR {selected_persona.upper()}"), unsafe_allow_html=True)

            if persona_match and persona_match.get("applies") is False:
                # Not applicable — show clear grounding message
                reason = persona_match.get("concrete_impact", "")
                st.markdown(
                    f'<div class="sh-card" style="border-left:3px solid #78350f;'
                    f'background:#1c1000;padding:1rem 1.25rem;">'
                    f'<p class="sh-label" style="margin:0 0 0.3rem;color:#fbbf24;">'
                    f'NOT DIRECTLY APPLICABLE</p>'
                    f'<p style="margin:0;font-size:0.875rem;color:#fcd34d;">{reason}</p>'
                    f'</div>',
                    unsafe_allow_html=True,
                )
            elif persona_match:
                with st.expander(persona_match.get("persona", selected_persona), expanded=True):
                    st.markdown(persona_match.get("concrete_impact", ""))
                    tl = persona_match.get("timeline")
                    if tl and tl.lower() not in ("not applicable to this persona", ""):
                        st.markdown(
                            f'<span style="font-size:0.75rem;color:{MUTED_FG};">'
                            f'Timeline: {tl}</span>',
                            unsafe_allow_html=True,
                        )
                    info = persona_match.get("no_recommendation_only_info")
                    if info:
                        st.markdown(notice_html(info, "info"), unsafe_allow_html=True)
            else:
                # No match at all — show all impacts collapsed
                show = impacts
                for imp in show:
                    with st.expander(imp.get("persona", "")):
                        st.markdown(imp.get("concrete_impact", ""))

            # Misconceptions
            misconceptions = summary.get("common_misconceptions", [])
            if misconceptions:
                with st.expander("Common Misconceptions"):
                    for m in misconceptions:
                        st.markdown(f"- {m}")

            # Hindi
            if language == "Hindi":
                st.divider()
                st.markdown(label_html("हिंदी अनुवाद"), unsafe_allow_html=True)
                with st.spinner("Translating via Bhashini…"):
                    try:
                        from app.translator import translate_to_hindi
                        st.markdown(
                            notice_html(f"<strong>सारांश:</strong> {translate_to_hindi(tl_dr)}", "info"),
                            unsafe_allow_html=True,
                        )
                        st.markdown(f"**उद्देश्य:** {translate_to_hindi(purpose)}")
                    except Exception as e:
                        st.caption(f"Hindi translation unavailable: {e}")

        with right:
            st.markdown(label_html("SOURCE TEXT"), unsafe_allow_html=True)
            st.caption(BILLS[st.session_state["last_bill"]]["display_name"])
            st.text_area(
                label="Source",
                value=result.get("source_text", "")[:3000],
                height=480,
                disabled=True,
                key="source_text_box",
                label_visibility="collapsed",
            )

        # ── Ambiguities ───────────────────────────────────────────────────
        ambiguities = summary.get("ambiguities", [])
        if ambiguities:
            st.markdown(label_html("UNCLEAR CLAUSES"), unsafe_allow_html=True)
            st.caption("These clauses have more than one possible meaning. Lawyers disagree on how to read them.")
            for i, amb in enumerate(ambiguities, 1):
                clause = amb.get("ambiguous_text", "Unclear clause")
                with st.expander(f"Clause {i} — {clause[:65]}…"):
                    st.markdown(
                        f'<blockquote style="border-left:2px solid {ACCENT};'
                        f'padding-left:0.75rem;color:{MUTED_FG};'
                        f'font-style:italic;margin:0 0 0.75rem;">{clause}</blockquote>',
                        unsafe_allow_html=True,
                    )
                    st.markdown(f"**Reading A:** {amb.get('interpretation_1','')}")
                    if amb.get("interpretation_2"):
                        st.markdown(f"**Reading B:** {amb['interpretation_2']}")
                    if amb.get("expert_note"):
                        st.markdown(notice_html(amb["expert_note"], "info"), unsafe_allow_html=True)

        # ── Accuracy warnings ─────────────────────────────────────────────
        red_flags = result.get("red_flags", [])
        _ERR = ("line ", "column ", "char ", "Expecting", "JSONDecodeError",
                "json", "delimiter", "Unterminated", "truncated")
        parse_errs = [f for f in red_flags if any(h.lower() in f.lower() for h in _ERR)]
        real_flags = [f for f in red_flags if f not in parse_errs]

        if parse_errs:
            with st.expander("AI Checker Could Not Run"):
                st.caption("Haiku could not verify this summary. Treat it with extra care.")
        if real_flags:
            with st.expander("Accuracy Warnings"):
                st.caption("Haiku flagged these potential issues:")
                for flag in real_flags:
                    st.markdown(notice_html(flag, "error"), unsafe_allow_html=True)

        # ── Policy Verdict Panel ──────────────────────────────────────────
        st.markdown(label_html("POLICY VERDICT — 5 PERSPECTIVES"), unsafe_allow_html=True)
        st.caption(
            "Five Haiku agents read the same summary independently (~550 tokens each, sequential)."
        )

        vb, vc = st.columns([2, 1])
        with vb:
            run_verdict = st.button(
                "Run 5-Perspective Analysis", key="run_verdict_btn", use_container_width=True
            )
        with vc:
            if st.button("Clear", key="clear_verdict_btn", use_container_width=True):
                st.session_state.pop("verdict_results", None)
                st.rerun()

        if run_verdict:
            from app.verdict_agents import run_verdict_agents
            bname = BILLS[st.session_state["last_bill"]]["display_name"]
            verdicts, bar = [], st.progress(0, text="Starting…")
            labels = ["Economist", "Social Worker", "Legal Expert", "Industry", "Citizen"]
            for i, vr in enumerate(run_verdict_agents(summary, bname)):
                verdicts.append(vr)
                bar.progress((i + 1) / 5, text=f"{labels[i]} done ({i+1}/5)")
            bar.empty()
            st.session_state["verdict_results"] = verdicts
            st.rerun()

        if "verdict_results" in st.session_state:
            from app.verdict_agents import verdict_style
            verdicts = st.session_state["verdict_results"]

            POSITIVE = {"positive","protective","robust","business_friendly","good_news"}
            NEGATIVE = {"concern","exclusionary","legally_risky","burdensome","bad_news"}
            pos = sum(1 for v in verdicts if v.get("verdict") in POSITIVE)
            neg = sum(1 for v in verdicts if v.get("verdict") in NEGATIVE)
            mix = len(verdicts) - pos - neg

            st.markdown(
                f'<div class="sh-card" style="display:flex;align-items:center;'
                f'gap:1.25rem;padding:0.875rem 1.25rem;flex-wrap:wrap;">'
                f'<span class="sh-label">OVERALL</span>'
                f'<span class="sh-badge sh-badge-green">{pos} Positive</span>'
                f'<span class="sh-badge sh-badge-amber">{mix} Mixed</span>'
                f'<span class="sh-badge sh-badge-red">{neg} Concern</span>'
                f'</div>',
                unsafe_allow_html=True,
            )

            FIELD_LABELS = {
                "positives":"Positives","concerns":"Concerns",
                "who_is_protected":"Who is protected","who_is_excluded":"Who may be excluded",
                "implementation_gap":"Implementation gap","grassroots_note":"Ground-level note",
                "strengths":"Legal strengths","gaps":"Legal gaps",
                "likely_litigation":"Likely court challenge",
                "constitutional_note":"Constitutional angle",
                "compliance_cost":"Compliance cost","who_benefits":"Who benefits",
                "who_struggles":"Who struggles",
                "ease_of_doing_business":"Ease of doing business","msme_note":"MSME note",
                "what_changes_for_me":"What changes","what_stays_same":"What stays the same",
                "biggest_question":"Biggest question","trust_level":"Trust level",
                "most_affected_sector":"Most affected sector","fiscal_note":"Fiscal note",
            }

            for v in verdicts:
                vd = v.get("verdict","neutral")
                bg, fg, icon = verdict_style(vd)
                with st.expander(f"{v.get('agent_label','')} — {v.get('headline','')}"):
                    st.markdown(
                        f'<span class="sh-badge" style="background:{bg};color:{fg};">'
                        f'{icon} {vd.replace("_"," ").title()}</span>',
                        unsafe_allow_html=True,
                    )
                    for key, friendly in FIELD_LABELS.items():
                        val = v.get(key)
                        if not val:
                            continue
                        if isinstance(val, list):
                            st.markdown(f"**{friendly}**")
                            for item in val:
                                st.markdown(f"- {item}")
                        else:
                            st.markdown(f"**{friendly}:** {val}")
                    conf = v.get("confidence")
                    if conf is not None:
                        st.progress(float(conf), text=f"Confidence {conf:.0%}")
                    if v.get("error"):
                        st.error(v["error"])

        # ── Cost expander ─────────────────────────────────────────────────
        with st.expander("Token & Cost Details"):
            usage = result.get("sonnet_usage", {})
            inp, out = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
            cost = (inp * 3 + out * 15) / 1_000_000
            c1, c2, c3 = st.columns(3)
            c1.metric("Input tokens", f"{inp:,}")
            c2.metric("Output tokens", f"{out:,}")
            c3.metric("Est. cost", f"₹{cost*84:.2f}")
            st.caption("Sonnet 4.6 (summary) · Haiku 4.5 (judge + verdict agents)")

        st.markdown(
            notice_html(
                "AI summary for informational purposes only. Not legal advice. "
                "Consult a qualified advocate before acting on any law. "
                "Source: India Code / Parliament of India · CC-BY 4.0",
                "warning",
            ),
            unsafe_allow_html=True,
        )

    else:
        # ── Empty state ───────────────────────────────────────────────────
        st.markdown('<div style="margin-top:1.5rem;"></div>', unsafe_allow_html=True)

        DEMO_QS = {
            "dpdp":            ["What is personal data?","What is a data fiduciary?",
                                 "What are my rights under DPDP?"],
            "social_security": ["What benefits do gig workers get?",
                                 "Who is covered under social security?"],
            "bns":             ["What is a cognizable offence?","What are punishments for theft?"],
            "telecom":         ["What is a licensed telecom entity?","What is biometric KYC?"],
            "maha_rent":       ["Can my landlord evict me?",
                                 "How much deposit can my landlord ask for?",
                                 "What repairs must my landlord do?"],
        }

        st.markdown(label_html("TRY THESE QUESTIONS"), unsafe_allow_html=True)
        for q in DEMO_QS.get(selected_key, []):
            if st.button(q, key=f"demo_{q}"):
                st.session_state["query_input"] = q
                st.rerun()

        st.markdown(
            f'<div class="sh-card" style="margin-top:1.5rem;border-left:2px solid {ACCENT};">'
            f'<p class="sh-label" style="margin:0 0 0.25rem;">ROADMAP</p>'
            f'<p style="margin:0;font-size:0.875rem;color:#d4d4d8;">'
            f'WhatsApp bot · All 22 scheduled languages · State laws · Bill comparison</p>'
            f'</div>',
            unsafe_allow_html=True,
        )


# ════════════════════════════════════════════════════════════════════════════
# TAB 2 — Browse State Bills
# ════════════════════════════════════════════════════════════════════════════
with tab_browse:
    try:
        all_rows, all_states, (yr_min, yr_max) = load_state_bills_data()
    except Exception as e:
        st.error(f"Could not load state bills: {e}")
        st.stop()

    # Hero
    st.markdown(
        f"""
<div style="background:linear-gradient(135deg,#18181b,#27272a);
     border:1px solid {BORDER};border-radius:0.5rem;
     padding:1.5rem;margin-bottom:1.25rem;">
  <p class="sh-label" style="margin:0 0 0.25rem;color:{MUTED_FG};">DATASET</p>
  <h2 style="margin:0;font-family:'DM Sans',sans-serif;font-size:2rem;
             font-weight:700;letter-spacing:-0.03em;color:{FG};">
    {len(all_rows):,} State Bills
  </h2>
  <p style="margin:0.25rem 0 0;font-size:0.875rem;color:{MUTED_FG};">
    Across <strong style="color:{FG};">30 states &amp; UTs</strong> ·
    <strong style="color:{FG};">{yr_min}</strong> –
    <strong style="color:{FG};">{yr_max}</strong> ·
    Source: PRS Legislative Research
  </p>
</div>
""",
        unsafe_allow_html=True,
    )

    # Filters
    f1, f2, f3, f4 = st.columns([2, 1, 1, 2])
    with f1:
        state_filter = st.selectbox("State", ["All States"] + all_states, key="sb_state")
    with f2:
        year_from = st.number_input("From", min_value=yr_min, max_value=yr_max,
                                    value=yr_min, step=1, key="sb_yr_from")
    with f3:
        year_to = st.number_input("To", min_value=yr_min, max_value=yr_max,
                                  value=yr_max, step=1, key="sb_yr_to")
    with f4:
        keyword = st.text_input("Search", placeholder="rent, labour, education…", key="sb_kw")

    from app.state_bills import filter_bills
    filtered = filter_bills(
        state=state_filter if state_filter != "All States" else None,
        year_from=int(year_from), year_to=int(year_to), query=keyword,
    )

    st.markdown(
        f'<p style="font-size:0.8125rem;color:{MUTED_FG};margin:0.25rem 0 0.75rem;">'
        f'Showing <strong style="color:{FG};">{len(filtered):,}</strong> bills</p>',
        unsafe_allow_html=True,
    )

    import pandas as pd
    if filtered:
        df = pd.DataFrame(filtered)[["bill","state","date","chamber"]]
        df.columns = ["Bill Name","State","Date","Legislature"]
        st.dataframe(df.head(500), use_container_width=True, height=400, hide_index=True)
        if len(filtered) > 500:
            st.caption(f"Showing first 500 of {len(filtered):,}. Narrow filters for more.")
        st.download_button(
            "Download filtered list (CSV)",
            data=df.to_csv(index=False).encode(),
            file_name="state_bills_filtered.csv",
            mime="text/csv",
        )
    else:
        st.markdown(
            notice_html("No bills match your filters. Try widening the year range or clearing the keyword.", "info"),
            unsafe_allow_html=True,
        )

    # Chart
    st.markdown(label_html("BILLS BY STATE"), unsafe_allow_html=True)
    state_counts = {}
    for r in filtered:
        state_counts[r["state"]] = state_counts.get(r["state"], 0) + 1
    if state_counts:
        chart_df = (
            pd.DataFrame(list(state_counts.items()), columns=["State","Bills"])
            .sort_values("Bills", ascending=False).head(15)
        )
        st.bar_chart(chart_df.set_index("State"))

    # Spotlight
    st.markdown(
        f'<div class="sh-card" style="border-left:3px solid #e4e4e7;margin-top:1rem;">'
        f'<p class="sh-label" style="margin:0 0 0.25rem;">SPOTLIGHT</p>'
        f'<h3 style="margin:0 0 0.5rem;font-family:\'DM Sans\',sans-serif;'
        f'font-size:1rem;font-weight:600;color:{FG};">'
        f'Maharashtra Rent Control Act 1999</h3>'
        f'<p style="margin:0 0 0.75rem;font-size:0.875rem;color:#d4d4d8;">'
        f'Over <strong style="color:{FG};">12 million households</strong> in Maharashtra '
        f'rent their homes. This Act governs eviction, rent increases, deposits and '
        f'tenant rights — yet most tenants have never read it.</p>'
        f'<p style="margin:0;font-size:0.8125rem;color:{MUTED_FG};">'
        f'Select <strong style="color:{FG};">Maharashtra Rent Control Act 1999 ★</strong> '
        f'in the sidebar, go to <strong style="color:{FG};">Explain a Law</strong>, '
        f'and ask: <em>"Can my landlord evict me?"</em></p>'
        f'</div>',
        unsafe_allow_html=True,
    )


# ════════════════════════════════════════════════════════════════════════════
# TAB 3 — Rights Checker
# ════════════════════════════════════════════════════════════════════════════
with tab_rights:

    st.markdown(
        f'<div class="sh-card" style="border-left:3px solid #3b82f6;padding:1rem 1.25rem;'
        f'margin-bottom:1rem;">'
        f'<p class="sh-label" style="margin:0 0 0.25rem;color:#60a5fa;">HOW IT WORKS</p>'
        f'<p style="margin:0;font-size:0.875rem;color:#d4d4d8;line-height:1.6;">'
        f'Describe your situation in plain English. The tool finds which laws apply, '
        f'retrieves relevant sections, and lists your rights — each backed by an exact '
        f'quote from the statute. Every right is source-verified.'
        f'</p></div>',
        unsafe_allow_html=True,
    )

    situation_input = st.text_area(
        "Describe your situation",
        placeholder=(
            "e.g. My employer has not paid my salary for two months and I was fired without notice.\n"
            "e.g. The app shared my location data without asking me.\n"
            "e.g. My landlord wants to evict me but I have paid all rent."
        ),
        height=110,
        key="rights_situation",
        label_visibility="collapsed",
    )

    rc_btn = st.button("Check My Rights", type="primary",
                       use_container_width=True, key="rights_run_btn")

    if rc_btn:
        if not situation_input.strip():
            st.warning("Please describe your situation first.")
        else:
            with st.spinner("Identifying applicable laws · Retrieving sections · Checking rights…"):
                try:
                    from app.rights_checker import check_rights
                    rc_result = check_rights(
                        situation_input.strip(),
                        uploaded_bills=st.session_state.get("uploaded_bills") or None,
                    )
                    st.session_state["rc_result"] = rc_result
                except Exception as e:
                    st.error(f"Error: {e}")
                    st.session_state.pop("rc_result", None)

    if "rc_result" in st.session_state:
        rc = st.session_state["rc_result"]

        if rc.get("error"):
            st.markdown(notice_html(rc["error"], "error"), unsafe_allow_html=True)
        else:
            # Warning banner (distress / advice redirect)
            if rc.get("_warning"):
                st.markdown(notice_html(rc["_warning"], "warning"), unsafe_allow_html=True)

            # Situation understood card
            situation_text = rc.get("situation_understood", "")
            if situation_text:
                st.markdown(
                    f'<div class="sh-card" style="padding:0.875rem 1.25rem;margin-bottom:0.75rem;">'
                    f'<p class="sh-label" style="margin:0 0 0.2rem;">SITUATION UNDERSTOOD</p>'
                    f'<p style="margin:0;font-size:0.875rem;color:{FG};">{situation_text}</p>'
                    f'</div>',
                    unsafe_allow_html=True,
                )

            # Bills searched
            bills_searched = rc.get("bills_searched", [])
            if bills_searched:
                badges = " ".join(
                    f'<span class="sh-badge sh-badge-blue">{b}</span>' for b in bills_searched
                )
                st.markdown(
                    f'<p class="sh-label" style="margin:0.25rem 0 0.3rem;">LAWS SEARCHED</p>'
                    f'<div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.75rem;">'
                    f'{badges}</div>',
                    unsafe_allow_html=True,
                )

            gs = rc.get("grounding_summary", {})
            n_rights = gs.get("total_rights", 0)
            n_grounded = gs.get("grounded_rights", 0)

            # Rights
            rights = rc.get("your_rights", [])
            if rights:
                st.markdown(label_html(f"YOUR RIGHTS — {n_grounded}/{n_rights} SOURCE-VERIFIED"),
                            unsafe_allow_html=True)

                CONF_BADGE = {
                    "clear":     ("sh-badge-green",  "CLEAR"),
                    "likely":    ("sh-badge-amber",  "LIKELY"),
                    "uncertain": ("sh-badge-red",    "UNCERTAIN"),
                }

                for right in rights:
                    conf = right.get("confidence", "uncertain").lower()
                    badge_cls, badge_txt = CONF_BADGE.get(conf, ("sh-badge-zinc", conf.upper()))
                    grounded = right.get("grounded", False)
                    src_badge = "sh-badge-green" if grounded else "sh-badge-amber"
                    src_label = "VERIFIED" if grounded else "UNVERIFIED"

                    right_text = right.get("right", "")
                    label = right_text[:80] + ("…" if len(right_text) > 80 else "")

                    with st.expander(label):
                        st.markdown(
                            f'<span class="sh-badge {badge_cls}">{badge_txt}</span> '
                            f'<span class="sh-badge {src_badge}">{src_label}</span>',
                            unsafe_allow_html=True,
                        )
                        st.markdown(
                            f'<p style="margin:0.5rem 0 0.25rem;font-size:0.9375rem;'
                            f'font-weight:600;color:{FG};">{right_text}</p>',
                            unsafe_allow_html=True,
                        )

                        src_section = right.get("source_section", "")
                        src_bill = right.get("source_bill", "")
                        if src_section:
                            st.markdown(
                                f'<code style="background:#27272a;color:#a1a1aa;'
                                f'padding:0.125rem 0.5rem;border-radius:0.25rem;'
                                f'font-size:0.75rem;">{src_bill} — {src_section}</code>',
                                unsafe_allow_html=True,
                            )

                        quote = right.get("source_quote", "")
                        if quote:
                            st.markdown(
                                f'<blockquote style="border-left:2px solid #3f3f46;'
                                f'padding-left:0.75rem;color:{MUTED_FG};'
                                f'font-style:italic;margin:0.5rem 0;font-size:0.8125rem;">'
                                f'"{quote}"</blockquote>',
                                unsafe_allow_html=True,
                            )

                        meaning = right.get("what_this_means", "")
                        if meaning:
                            st.markdown(
                                f'<p style="margin:0.25rem 0 0;font-size:0.8125rem;'
                                f'color:#d4d4d8;">{meaning}</p>',
                                unsafe_allow_html=True,
                            )
            else:
                st.markdown(
                    notice_html("No specific rights found in the retrieved sections for this situation.", "info"),
                    unsafe_allow_html=True,
                )

            # Duties
            duties = rc.get("your_duties", [])
            if duties:
                st.markdown(label_html("YOUR DUTIES"), unsafe_allow_html=True)
                for duty in duties:
                    with st.expander(duty.get("duty", "")[:80]):
                        st.markdown(f"**{duty.get('duty', '')}**")
                        quote = duty.get("source_quote", "")
                        if quote:
                            st.markdown(
                                f'<blockquote style="border-left:2px solid #3f3f46;'
                                f'padding-left:0.75rem;color:{MUTED_FG};'
                                f'font-style:italic;margin:0.5rem 0;font-size:0.8125rem;">'
                                f'"{quote}"</blockquote>',
                                unsafe_allow_html=True,
                            )

            # What law doesn't cover
            gap = rc.get("what_law_does_not_cover", "")
            if gap:
                st.markdown(label_html("WHAT THE LAW DOESN'T COVER"), unsafe_allow_html=True)
                st.markdown(notice_html(gap, "warning"), unsafe_allow_html=True)

            # Helplines
            helplines = rc.get("helplines", [])
            if helplines:
                st.markdown(label_html("HELPLINES"), unsafe_allow_html=True)
                for hl in helplines:
                    st.markdown(
                        f'<div class="sh-card" style="padding:0.625rem 1rem;">'
                        f'<p style="margin:0;font-size:0.875rem;color:#4ade80;">{hl}</p>'
                        f'</div>',
                        unsafe_allow_html=True,
                    )

            # Sections reviewed
            with st.expander("Sections reviewed"):
                for s in rc.get("sections_reviewed", []):
                    st.caption(s)

            # Disclaimer
            st.markdown(
                notice_html(rc.get("disclaimer", ""), "info"),
                unsafe_allow_html=True,
            )

            # Grounding summary
            st.markdown(
                f'<p style="font-size:0.75rem;color:{MUTED_FG};margin-top:0.5rem;">'
                f'Source verification: {n_grounded}/{n_rights} rights confirmed in retrieved text.</p>',
                unsafe_allow_html=True,
            )

    else:
        st.markdown('<div style="margin-top:1rem;"></div>', unsafe_allow_html=True)
        DEMO_SITUATIONS = [
            "My employer fired me without giving me one month's notice",
            "A food delivery app shared my location with advertisers without permission",
            "My landlord wants to evict me even though I paid all my rent",
            "The telecom company disconnected my SIM without warning",
        ]
        st.markdown(label_html("TRY THESE SITUATIONS"), unsafe_allow_html=True)
        for demo in DEMO_SITUATIONS:
            if st.button(demo, key=f"rc_demo_{demo}"):
                st.session_state["rights_situation"] = demo
                st.rerun()


# ════════════════════════════════════════════════════════════════════════════
# TAB 4 — Cross-Bill Analysis
# ════════════════════════════════════════════════════════════════════════════
with tab_conflicts:

    st.markdown(
        f'<div class="sh-card" style="border-left:3px solid #f59e0b;padding:1rem 1.25rem;'
        f'margin-bottom:1rem;">'
        f'<p class="sh-label" style="margin:0 0 0.25rem;color:#fbbf24;">HOW IT WORKS</p>'
        f'<p style="margin:0;font-size:0.875rem;color:#d4d4d8;line-height:1.6;">'
        f'Select two bills and a topic. The tool retrieves the most relevant sections from '
        f'each, then identifies genuine conflicts and overlaps — backed by exact source quotes. '
        f'Every conflict quote is deterministically verified against retrieved text.'
        f'</p></div>',
        unsafe_allow_html=True,
    )

    BILL_OPTS = {
        "dpdp":            "DPDP Act 2023",
        "social_security": "Code on Social Security 2020",
        "bns":             "Bharatiya Nyaya Sanhita 2023",
        "telecom":         "Telecommunications Act 2023",
        "maha_rent":       "Maharashtra Rent Control Act 1999",
    }
    for _uk, _ud in st.session_state.get("uploaded_bills", {}).items():
        BILL_OPTS[_uk] = f"[Uploaded] {_ud['display_name']}"

    ca_col, cb_col = st.columns(2)
    with ca_col:
        st.markdown(label_html("BILL A"), unsafe_allow_html=True)
        bill_a = st.selectbox(
            "Bill A", options=list(BILL_OPTS.keys()),
            format_func=lambda k: BILL_OPTS[k],
            key="conflict_bill_a", label_visibility="collapsed",
        )
    with cb_col:
        st.markdown(label_html("BILL B"), unsafe_allow_html=True)
        bill_b_opts = [k for k in BILL_OPTS if k != bill_a]
        bill_b = st.selectbox(
            "Bill B", options=bill_b_opts,
            format_func=lambda k: BILL_OPTS[k],
            key="conflict_bill_b", label_visibility="collapsed",
        )

    conflict_topic = st.text_input(
        "Topic (optional)",
        placeholder="e.g. data sharing  ·  worker rights  ·  definitions of personal data",
        key="conflict_topic",
        label_visibility="collapsed",
    )

    conf_btn = st.button(
        "Detect Conflicts & Overlaps", type="primary",
        use_container_width=True, key="conflict_run_btn",
    )

    if conf_btn:
        with st.spinner("Retrieving sections · Analysing conflicts · Verifying quotes…"):
            try:
                from app.conflict_detector import detect_conflicts
                conf_result = detect_conflicts(
                    bill_a, bill_b, conflict_topic,
                    uploaded_bills=st.session_state.get("uploaded_bills") or None,
                )
                st.session_state["conf_result"] = conf_result
            except Exception as e:
                st.error(f"Error: {e}")
                st.session_state.pop("conf_result", None)

    if "conf_result" in st.session_state:
        cr = st.session_state["conf_result"]

        if cr.get("error"):
            st.markdown(notice_html(cr["error"], "error"), unsafe_allow_html=True)
        elif cr.get("insufficient_grounding"):
            st.markdown(
                notice_html(
                    "The retrieved sections did not contain enough information to find "
                    "genuine conflicts on this topic. Try a different topic or bill pair.",
                    "warning",
                ),
                unsafe_allow_html=True,
            )
        else:
            bill_a_name = cr.get("bill_a_name", "Bill A")
            bill_b_name = cr.get("bill_b_name", "Bill B")
            gs = cr.get("grounding_summary", {})
            n_total = gs.get("total", 0)
            n_grounded = gs.get("grounded", 0)

            # Header card
            st.markdown(
                f'<div class="sh-card" style="display:flex;align-items:center;'
                f'gap:1.25rem;padding:0.875rem 1.25rem;flex-wrap:wrap;">'
                f'<span class="sh-badge sh-badge-blue">{bill_a_name}</span>'
                f'<span style="color:{MUTED_FG};font-size:0.875rem;">vs</span>'
                f'<span class="sh-badge sh-badge-blue">{bill_b_name}</span>'
                f'{"<span class=sh-badge sh-badge-zinc>" + cr.get("topic","") + "</span>" if cr.get("topic") else ""}'
                f'<span style="margin-left:auto;" class="sh-badge '
                f'{"sh-badge-green" if n_grounded == n_total and n_total > 0 else "sh-badge-amber"}">'
                f'{n_grounded}/{n_total} verified</span>'
                f'</div>',
                unsafe_allow_html=True,
            )

            # Conflict type styling
            CTYPE_BADGE = {
                "direct_contradiction": ("sh-badge-red",   "DIRECT CONTRADICTION"),
                "scope_overlap":        ("sh-badge-amber",  "SCOPE OVERLAP"),
                "definitional_conflict":("sh-badge-amber",  "DEFINITIONAL CONFLICT"),
                "procedural_gap":       ("sh-badge-blue",   "PROCEDURAL GAP"),
            }

            conflicts = cr.get("conflicts", [])
            st.markdown(label_html(f"CONFLICTS FOUND ({len(conflicts)})"), unsafe_allow_html=True)

            if not conflicts:
                st.markdown(
                    notice_html("No direct conflicts found in the retrieved sections.", "info"),
                    unsafe_allow_html=True,
                )
            else:
                for c in conflicts:
                    ctype = c.get("conflict_type", "")
                    badge_cls, badge_txt = CTYPE_BADGE.get(
                        ctype, ("sh-badge-zinc", ctype.replace("_", " ").upper())
                    )
                    grounded = c.get("grounded", False)
                    src_badge = "sh-badge-green" if grounded else "sh-badge-amber"
                    src_label = "VERIFIED" if grounded else "UNVERIFIED"
                    title = c.get("title", "Conflict")

                    with st.expander(title):
                        st.markdown(
                            f'<span class="sh-badge {badge_cls}">{badge_txt}</span> '
                            f'<span class="sh-badge {src_badge}">{src_label}</span>',
                            unsafe_allow_html=True,
                        )

                        # Side-by-side quotes
                        qa, qb = st.columns(2)
                        with qa:
                            st.markdown(
                                f'<p class="sh-label" style="margin:0.625rem 0 0.25rem;">'
                                f'{bill_a_name} — {c.get("bill_a_section","")}</p>'
                                f'<blockquote style="border-left:2px solid #3b82f6;'
                                f'padding-left:0.75rem;color:{MUTED_FG};'
                                f'font-style:italic;margin:0;font-size:0.8125rem;">'
                                f'"{c.get("bill_a_quote","")}"'
                                f'{"<br><span class=sh-badge sh-badge-green style=margin-top:0.4rem;display:inline-block;>QUOTE VERIFIED</span>" if c.get("quote_a_verified") else "<br><span class=sh-badge sh-badge-amber style=margin-top:0.4rem;display:inline-block;>NOT IN RETRIEVED TEXT</span>"}'
                                f'</blockquote>',
                                unsafe_allow_html=True,
                            )
                        with qb:
                            st.markdown(
                                f'<p class="sh-label" style="margin:0.625rem 0 0.25rem;">'
                                f'{bill_b_name} — {c.get("bill_b_section","")}</p>'
                                f'<blockquote style="border-left:2px solid #f59e0b;'
                                f'padding-left:0.75rem;color:{MUTED_FG};'
                                f'font-style:italic;margin:0;font-size:0.8125rem;">'
                                f'"{c.get("bill_b_quote","")}"'
                                f'{"<br><span class=sh-badge sh-badge-green style=margin-top:0.4rem;display:inline-block;>QUOTE VERIFIED</span>" if c.get("quote_b_verified") else "<br><span class=sh-badge sh-badge-amber style=margin-top:0.4rem;display:inline-block;>NOT IN RETRIEVED TEXT</span>"}'
                                f'</blockquote>',
                                unsafe_allow_html=True,
                            )

                        plain = c.get("plain_english", "")
                        impact = c.get("citizen_impact", "")
                        if plain:
                            st.markdown(
                                f'<p style="margin:0.75rem 0 0.25rem;font-size:0.875rem;'
                                f'color:{FG};">{plain}</p>',
                                unsafe_allow_html=True,
                            )
                        if impact:
                            st.markdown(notice_html(f"Citizen impact: {impact}", "info"),
                                        unsafe_allow_html=True)

            # Overlaps
            overlaps = cr.get("overlaps", [])
            if overlaps:
                st.markdown(label_html(f"OVERLAPS ({len(overlaps)})"), unsafe_allow_html=True)
                for ov in overlaps:
                    with st.expander(ov.get("title", "Overlap")):
                        st.markdown(
                            f'<p style="font-size:0.875rem;color:{FG};">'
                            f'{ov.get("plain_english","")}</p>'
                            f'<p style="font-size:0.75rem;color:{MUTED_FG};margin-top:0.25rem;">'
                            f'{bill_a_name}: {ov.get("bill_a_section","")} · '
                            f'{bill_b_name}: {ov.get("bill_b_section","")}</p>',
                            unsafe_allow_html=True,
                        )

            # Gaps
            gaps = cr.get("gaps", [])
            if gaps:
                st.markdown(label_html("GAPS IN THE LAW"), unsafe_allow_html=True)
                for gap in gaps:
                    st.markdown(
                        f'<p style="font-size:0.875rem;color:{MUTED_FG};'
                        f'border-left:2px solid #3f3f46;padding-left:0.75rem;'
                        f'margin-bottom:0.4rem;">{gap}</p>',
                        unsafe_allow_html=True,
                    )

            # Confidence + grounding note
            conf_lvl = cr.get("confidence", "")
            st.markdown(
                f'<p style="font-size:0.75rem;color:{MUTED_FG};margin-top:0.75rem;">'
                f'Confidence: <strong style="color:{FG};">{conf_lvl}</strong> · '
                f'Quote verification: <strong style="color:{FG};">{n_grounded}/{n_total}</strong> '
                f'conflict pairs confirmed in retrieved source text.</p>',
                unsafe_allow_html=True,
            )

    else:
        st.markdown('<div style="margin-top:1rem;"></div>', unsafe_allow_html=True)
        DEMO_PAIRS = [
            ("dpdp", "telecom", "data sharing and personal information"),
            ("dpdp", "social_security", "worker data and platform obligations"),
            ("bns", "telecom", "interception and surveillance"),
        ]
        st.markdown(label_html("TRY THESE COMPARISONS"), unsafe_allow_html=True)
        for a, b, topic_demo in DEMO_PAIRS:
            label_str = f"{BILL_OPTS[a]} vs {BILL_OPTS[b]} — {topic_demo}"
            if st.button(label_str, key=f"conf_demo_{a}_{b}"):
                st.session_state["conflict_bill_a"] = a
                st.session_state["conflict_topic"] = topic_demo
                st.rerun()
