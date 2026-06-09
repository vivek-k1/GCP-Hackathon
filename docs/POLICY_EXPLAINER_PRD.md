# POLICY EXPLAINER FOR INDIAN LEGISLATION
## Complete Product Requirements Document (PRD) for 24-Hour Hackathon Build

**Project**: Policy Explainer AI for Indian Bills & Acts  
**Track**: Governance & Collaboration (Track 4 - Anthropic Hackathon)  
**Timeline**: 24 hours (T+0 to T+24)  
**Team Size**: 1–3 members  
**Target User**: Indian citizens with zero legal knowledge; primary languages English & Hindi  
**Primary Use Case**: Understand pending/recent Indian legislation in plain language with persona-specific impact  

---

## PART 1: PRODUCT VISION & CONSTRAINTS

### Core Value Proposition

Users upload or select an Indian bill/act, get an AI-generated plain-language explanation grouped by:
1. **What is this?** (TL;DR in 15 words)
2. **Who does it affect and how?** (persona-filtered impact statements)
3. **Before vs. After** (structured comparison)
4. **Key provisions** (PRS-format structure with source citations)
5. **Ambiguities & next steps** (transparent uncertainty)

Every claim is grounded in the source bill text via Anthropic Citations API. All output is licensed under CC-BY 4.0 to remain compatible with PRS Legislative Research data.

### Hard Constraints (Non-negotiable)

**Technical Hard Limits:**
- Must use Claude Sonnet 4.6 (not 4.5) as primary LLM
- All summaries must include mandatory `source_quote` field from bill text
- Every claim must link to exact source via Anthropic Citations API character indices
- Haiku 4.5 must verify faithfulness of every summary (score ≥4/5 or flag)
- No external APIs beyond Claude, Bhashini, and embedding libraries (voyage-law-2)
- API costs must not exceed $20 for entire 24-hour demo run
- Zero user authentication—completely stateless
- No storage beyond in-memory session (FAISS vectors, Python dicts)

**Scope Hard Limits:**
- Exactly 3 demo bills (DPDP Act 2023 + Rules 2025, Bharatiya Nyaya Sanhita 2023, Telecommunications Act 2023)
- English + Hindi only (Bhashini API for NMT)
- No WhatsApp integration (demo only; roadmap slide acceptable)
- No fine-tuning, no custom embeddings, no retrieval training
- No user accounts, no database, no login
- Demo must complete end-to-end in <2 seconds per query
- Summary generation must complete in <10 seconds per bill section

**Legal/Ethical Hard Limits:**
- Must include PRS-style disclaimer: *"AI-generated information, not legal advice"*
- Must never recommend specific action to user (e.g., "file an FIR," "sign this contract")
- Must display disclaimer on every page and in every section
- Must flag when AI confidence is low (<0.7)
- Must cite PRS India CC-BY 4.0 source on all PRS-derived content
- Must not train on or retain user data between sessions

### Soft Constraints (Nice-to-have, cut if running out of time)

- Pre/post comprehension quiz with 5–10 test subjects
- Flesch-Kincaid grade-level badge per summary
- "Show me where" button highlighting source text on click
- Multiple interpretation views for ambiguous clauses
- Persona selector for impact customization
- Hindi toggle via Bhashini

---

## PART 2: TECHNICAL ARCHITECTURE

### Tech Stack (Locked-in)

**Backend:**
- **Language**: Python 3.11+
- **Web Framework**: FastAPI (minimal, REST-only, no WebSockets)
- **LLM Client**: anthropic==0.32.0+ (latest SDK)
- **PDF Processing**: pdfplumber==0.12.0+ (text extraction only; no OCR for 24h sprint)
- **Vector Store**: FAISS (Facebook's in-memory vector library; no database)
- **Sparse Retrieval**: rank_bm25==0.2.2
- **Embeddings**: voyageai==0.2.0+ (voyage-law-2 model; legal-specific)
- **Text Analysis**: textstat==0.7.3 (Flesch-Kincaid computation)
- **Validation**: pydantic==2.5.0+ (strict JSON schema validation)

**Frontend:**
- **Framework**: Streamlit==1.40+ (fastest iteration for 24h; no frontend build complexity)
- **OR Next.js 15 + shadcn/ui (if designer on team; adds 4h setup cost)
- **UI Patterns**: Accordion, tabs, split-pane layout, sticky disclaimer banner
- **Styling**: Tailwind CSS (if Next.js) or Streamlit native (if Streamlit)

**Hosting (Choose One):**
- **Streamlit Cloud**: Deploy in 30 seconds (only option for Streamlit)
- **Vercel** (Next.js + API routes as backend)
- **Railway** or **Render** (FastAPI + Next.js)
- **HuggingFace Spaces** (Streamlit or Gradio; unlimited usage)

**APIs (Integrated):**
- **Claude Sonnet 4.6** via Anthropic SDK (primary)
- **Claude Haiku 4.5** via Anthropic SDK (judge/verifier)
- **Bhashini ULCA** for Hindi NMT (bhashini.gov.in; free tier 1000 req/day)
- **Voyage AI** for embeddings (voyage-law-2; $0.12 per 1M tokens input)

**Development Environment:**
- Git + GitHub (for version control, not required to function)
- Python virtual environment (venv or conda)
- `.env` file for API keys (not committed)
- Pre-downloaded PDFs in `/bills/` directory (no dynamic fetching in 24h)

### Data Pipeline Architecture

```
Raw Bill PDF (indiacode.nic.in / prsindia.org PDFs)
  ↓
PDF Text Extraction (pdfplumber; linear regex for Section/Clause numbering)
  ↓
Structure-Aware Chunking (split at Section boundaries; regex ^\d+\.\s+[A-Z])
  ↓
Hybrid Retrieval Index
  ├─ BM25 sparse index (rank_bm25; section number keyword match)
  └─ Dense vectors (voyage-law-2; semantic retrieval)
  ↓
User Query (persona + question)
  ↓
Retrieval (top-5 BM25 + top-5 voyage; RRF fusion; rerank by relevance)
  ↓
Claude Sonnet 4.6 Summarization (with Anthropic Citations API enabled)
  ├─ System prompt: Structure output as PRS-format JSON
  ├─ Mandatory fields: summary, source_quote[], ambiguities[], persona_impacts[]
  └─ Temperature: 0 (deterministic; legal content)
  ↓
Haiku 4.5 Faithfulness Verification
  ├─ Score each claim against source_quote (0–5 scale)
  ├─ Flag anything <4 for human review
  └─ Return confidence metadata
  ↓
Bhashini NMT (if Hindi toggle enabled)
  ├─ Translate summary JSON keys + values
  └─ Stream back to frontend
  ↓
UI Rendering
  ├─ Split-pane: summary left, source right
  ├─ Click any claim → highlight source span
  ├─ Ambiguities show as yellow badges
  └─ Grade-level badge + disclaimer sticky top
```

### Data Schema (Pydantic Models)

```python
# Core models to define in your codebase

class SourceCitation(BaseModel):
    """Single grounded claim with exact source text."""
    claim: str  # The claim text
    source_quote: str  # Exact excerpt from bill
    source_section: str  # e.g., "Section 5(1)(a)"
    confidence: float  # 0.0–1.0; from Haiku judge
    
class Ambiguity(BaseModel):
    """Uncertain interpretation flagged by AI or human."""
    clause: str  # The ambiguous text
    interpretation_a: str  # First reading
    interpretation_b: Optional[str]  # Alternative reading
    expert_note: str  # Why this is ambiguous
    
class PersonaImpact(BaseModel):
    """Impact statement for a specific user persona."""
    persona: str  # e.g., "Gig Worker", "Farmer", "Small Business Owner"
    impact: str  # Concrete consequence
    timeline: Optional[str]  # "Effective from X date"
    action_needed: Optional[str]  # What to do (careful: not advice)
    
class BillSummary(BaseModel):
    """Complete output schema for a bill section."""
    bill_name: str
    section: str
    tl_dr: str  # <20 words
    purpose: str  # 1–2 sentences
    before_after: Optional[dict]  # {before: str, after: str}
    key_provisions: list[SourceCitation]
    ambiguities: list[Ambiguity]
    persona_impacts: list[PersonaImpact]
    grade_level: float  # Flesch-Kincaid
    generated_at: str  # ISO timestamp
    disclaimer: str  # PRS-standard text
    source_citations_data: list[dict]  # Raw output from Citations API
```

---

## PART 3: DETAILED BUILD PLAN (24-HOUR TIMELINE)

### HOUR 0–1: Setup & Data Ingestion

**Checkpoint 0 (T+0:30):**
- Clone a basic FastAPI + Streamlit starter template
- Create project structure: `/app`, `/bills`, `/data`, `/schemas`, `/prompts`
- Download 3 demo bills as PDF into `/bills/`:
  - DPDP Act 2023 + Rules 2025 (from indiacode.nic.in)
  - Bharatiya Nyaya Sanhita 2023 (from prsindia.org)
  - Telecommunications Act 2023 (from indiacode.nic.in)
- Create `.env` file: `ANTHROPIC_API_KEY`, `VOYAGEAI_API_KEY`, `BHASHINI_USER_ID`, `BHASHINI_API_KEY`
- **Goal**: Confirm all PDFs parse cleanly with pdfplumber without corruption

**Checkpoint 1 (T+1:00):**
- PDF → text extraction for all 3 bills complete
- Raw text validated (no encoding errors, no OCR needed)
- Structure detected: Sections, subsections, provisos identified via regex
- **Goal**: Confirm ~90% section detection accuracy on one sample bill

### HOUR 1–4: Core Summarization Pipeline

**Checkpoint 2 (T+2:00):**
- Pydantic schemas (above) fully defined and unit-tested
- FastAPI `/summarize` endpoint scaffolded (accepts bill_name + section, returns BillSummary)
- Claude Sonnet 4.6 system prompt written with exact template structure
- **Test**: Hand-craft one Sonnet 4.6 call on DPDP Section 3(1) with Citations API enabled; verify citations format
- **Goal**: Confirm Citations API returns character indices correctly

**Checkpoint 3 (T+3:00):**
- Haiku 4.5 judge prompt written (score faithfulness 0–5 per claim)
- Validation pipeline: Sonnet → Haiku → Pydantic validation → error handling
- Test on 5 sample DPDP sections; iterate prompt until Haiku consistently scores 4–5
- **Goal**: 100% of summaries pass Haiku ≥4 threshold (tune prompts until passing)

**Checkpoint 4 (T+4:00):**
- End-to-end test: DPDP Section 3 → Sonnet summary → Haiku validation → JSON output
- Latency check: Confirm <10 seconds per section
- API cost tracking: Log token usage; confirm staying under $20 ceiling
- **Goal**: One complete section fully working with all steps

### HOUR 4–7: Retrieval & Search

**Checkpoint 5 (T+5:00):**
- Hybrid retrieval system implemented:
  - BM25 index built for all 3 bills (rank_bm25)
  - Embeddings generated via voyage-law-2 (store in FAISS in-memory)
  - RRF fusion algorithm: combine BM25 + dense ranking
- **Test**: 5 sample queries ("What is data fiduciary?", "When does DPDP apply to WhatsApp?") retrieve correct sections
- **Goal**: Top-1 hit rate >80% on test queries

**Checkpoint 6 (T+6:00):**
- Persona filtering implemented: detect persona from query, filter impact_statements
- Query expansion: add synonyms (e.g., "WhatsApp" → "messaging app", "platform", "intermediary")
- **Test**: Query "As a farmer, what do labour codes mean for me?" retrieves labour sections, not DPDP
- **Goal**: Persona-specific retrieval working

**Checkpoint 7 (T+7:00):**
- Integration: user input → retrieval → summarization → validation → output
- Latency target: query-to-response <3 seconds (target: <2 sec)
- **Goal**: Full pipeline end-to-end; ready for UI integration

### HOUR 7–10: UI & Frontend

**Checkpoint 8 (T+8:00):**
- Basic Streamlit interface OR Next.js frontend scaffolded
- Bill selector dropdown (3 bills)
- Section search box
- **Goal**: UI loads without crashing

**Checkpoint 9 (T+9:00):**
- Split-pane layout:
  - Left pane: Summary (accordion: TL;DR → Purpose → Provisions → Persona Impact)
  - Right pane: Source text with clickable highlight (on claim click, highlight corresponding source span)
- Sticky disclaimer banner top-of-page
- Grade-level badge on each summary
- **Goal**: UI fully rendered; all components visible

**Checkpoint 10 (T+10:00):**
- Persona selector dropdown (3–5 personas: Gig Worker, Farmer, Small Business Owner, Student, Tenant)
- Filter impact statements per persona on click
- Language toggle: English ↔ Hindi (via Bhashini)
- **Goal**: All interactive elements functional

### HOUR 10–14: Localization & Ambiguity Handling

**Checkpoint 11 (T+11:00):**
- Bhashini API integration:
  - GET auth token from bhashini.gov.in/ulca
  - NMT pipeline: English summary → Hindi translation
  - Cache translations in memory (dict) to avoid repeated calls
- **Test**: Translate DPDP Section 3 summary to Hindi; verify quality (should be ~90% accuracy; some terms may need manual mapping)
- **Goal**: Hindi toggle works; translations cached

**Checkpoint 12 (T+12:00):**
- Ambiguity flagging:
  - System prompt instructs Sonnet: "If any clause contains 'unless', 'provided that', 'subject to', or 'shall not', populate ambiguities[] with competing interpretations"
  - UI shows ambiguous clauses with yellow badge + "show both interpretations" button
- **Test**: DPDP Section 5 (which contains provisos) generates 2–3 ambiguity flags
- **Goal**: Ambiguity flagging working

**Checkpoint 13 (T+13:00):**
- Disclaimer system:
  - PRS-standard disclaimer on every page + every section
  - Color: info-blue (not warning-red) to reduce alarm fatigue
  - Persistent but collapsible
- **Test**: Disclaimer visible on every view; click to expand/collapse
- **Goal**: Legal coverage confirmed

**Checkpoint 14 (T+14:00):**
- Integration test: Select bill → search section → get full summary with Hindi, personas, ambiguities, citations, grade level, disclaimer
- Latency check: confirm <3 sec end-to-end
- **Goal**: All features integrated; no broken links or missing data

### HOUR 14–18: Demonstration Preparation & Refinement

**Checkpoint 15 (T+15:00):**
- Pre-compute all summaries for 3 bills (all major sections):
  - DPDP: Sections 2, 3, 4, 5, 6
  - BNS: Sections 100–105 (sample criminal provisions)
  - Telecom Act: Sections 1, 2, 4, 5
- Cache as JSON files to avoid API latency during live demo
- **Goal**: All demo content cached; ready for instant replay

**Checkpoint 16 (T+16:00):**
- Demo script written (3-minute walkthrough):
  - Open DPDP Act
  - "What is a data fiduciary?" → show summary + source
  - "As a student, what does DPDP mean?" → filter to student persona
  - Toggle to Hindi; show translation
  - Click a claim → highlight source
  - Show ambiguities on a proviso clause
  - Flesch-Kincaid badge
- **Goal**: Smooth 3-minute flow; no glitches

**Checkpoint 17 (T+17:00):**
- Comprehension quiz prepared (5–10 questions per bill):
  - Raw bill text question (control): e.g., "Read this 2-paragraph DPDP excerpt; what is a data fiduciary?"
  - Your summary question (test): same question but with your summary as reference
  - Pre-test 5–10 team members or friends
  - Calculate lift: control score → test score
- **Goal**: Data showing 50%+ comprehension improvement

**Checkpoint 18 (T+18:00):**
- Code cleanup: remove debug prints, add docstrings, organize imports
- Requirements.txt finalized
- README.md written (setup, usage, architecture overview)
- GitHub pushed (if using git)
- **Goal**: Codebase production-ready

### HOUR 18–22: Final Polish & Testing

**Checkpoint 19 (T+19:00):**
- Cross-browser testing (Chrome, Firefox, Safari if time)
- Mobile responsiveness check (if UI is web-based)
- Fix UI glitches discovered
- Test error handling: what happens if API fails? Show graceful error message
- **Goal**: No visual bugs; all error paths handled

**Checkpoint 20 (T+20:00):**
- Deployment:
  - If Streamlit: `streamlit deploy` to Streamlit Cloud (30 sec)
  - If Next.js + FastAPI: Deploy backend to Railway/Render + frontend to Vercel (10–15 min)
  - If HF Spaces: Push to Hugging Face (5 min)
- **Test**: Live demo URL working; latency acceptable from cloud
- **Goal**: Live URL ready for judges

**Checkpoint 21 (T+21:00):**
- Fairness audit:
  - Do personas get equal treatment in impact statements? Or does the system favor certain groups?
  - Test for bias in language: any derogatory language for certain personas?
  - Check: is DPDP summary pro-regulation or anti-regulation? (should be neutral)
- **Goal**: Neutral framing confirmed

**Checkpoint 22 (T+22:00):**
- **SUBMISSION DEADLINE** (no penalty until T+23:00)
- Submit: GitHub link + live demo URL + demo video (2-min walkthrough)
- **Checkpoint**: Submitted on time

### HOUR 22–24: Pitch Preparation & Refinement

**Checkpoint 23 (T+23:00):**
- Pitch deck (5–7 slides):
  - Slide 1: Problem (11% English speakers, 790 MPs for 1.4B people, 58% bills pass in <2 weeks)
  - Slide 2: Solution (3-minute demo)
  - Slide 3: How it works (architecture diagram)
  - Slide 4: Impact (comprehension lift data)
  - Slide 5: Roadmap (WhatsApp bot, all 22 languages, state laws)
  - Slide 6: Disclaimers & ethics (why it's not replacing lawyers)
- **Goal**: Pitch deck complete

**Checkpoint 24 (T+24:00):**
- **FINALIST PITCHES BEGIN**
- Present live to judges
- 5-minute demo + 2-minute Q&A
- **Goal**: Judges understand the idea; you're ready to answer "how could this be weaponised?" and "what about liability?"

---

## PART 4: System Prompts (Copy-Paste Ready)

### Claude Sonnet 4.6 System Prompt

```
You are an expert legal translator specializing in making Indian legislation understandable to people with zero legal knowledge.

Your task is to summarize a section of an Indian bill or act in plain language.

OUTPUT REQUIREMENTS:
You MUST respond ONLY with valid JSON matching this exact schema:
{
  "tl_dr": "<15 words summary>",
  "purpose": "<1-2 sentences explaining why this section exists>",
  "key_provisions": [
    {
      "provision": "<human-readable description of one rule>",
      "source_section": "<Section X(Y)(Z)>",
      "concrete_example": "<real-world scenario showing how this applies>"
    }
  ],
  "ambiguities": [
    {
      "ambiguous_text": "<the exact clause from the bill that is unclear>",
      "interpretation_1": "<first reasonable reading>",
      "interpretation_2": "<second reasonable reading>",
      "expert_note": "<why this is genuinely ambiguous; what a lawyer would debate>"
    }
  ],
  "persona_impacts": [
    {
      "persona": "Gig Worker|Farmer|Small Business Owner|Student|Tenant|[Other]",
      "concrete_impact": "<specific consequence for this person; avoid abstract language>",
      "timeline": "<when does this take effect, if applicable>",
      "no_recommendation_only_info": "<what to check / ask about; NOT what to do>"
    }
  ],
  "grade_level": <Flesch-Kincaid grade level of your explanation; 1-18>,
  "common_misconceptions": [
    "<wrong interpretation people might have>",
    "<correct interpretation>"
  ]
}

LANGUAGE RULES:
- Use only present tense ("This section says X" not "This section is saying X")
- Sentences max 15 words; simple vocabulary (8th-grade reading level target)
- Use "you" and "your" frequently; ground in daily life
- Replace jargon: "data fiduciary" → "the company that holds your data"
- Define every legal term on first mention: "cognizable offence (a crime police can arrest you for without asking a judge first)"
- Use Indian currency (₹, lakhs, crores) and references (UPI, WhatsApp, ration cards, auto-rickshaws)
- Use metaphors sparingly; flag them as analogies ("Think of a data fiduciary like...") and link back to literal meaning

ACCURACY RULES:
- Every claim MUST be grounded in the source text; no extrapolation
- If the source is ambiguous, say so explicitly in ambiguities[]
- Do NOT predict how courts will interpret this (e.g., don't say "judges will likely..."; say instead "the law does not specify how this will be interpreted")
- Flag uncertainty: if you're not 100% sure of your interpretation, add to ambiguities[]

BIAS PREVENTION:
- Impact statements must be neutral, not advocating for or against the law
- Do not assume good faith or bad faith intent from legislators
- Present competing framings of controversial provisions (e.g., "Some argue this protects workers; others argue it limits business flexibility")

EXAMPLE (DPDP Act Section 3):
{
  "tl_dr": "Digital Personal Data Protection Act 2023 defines who, what, how of data handling.",
  "purpose": "This act sets the baseline rules for how companies can collect and use your data. It applies to anyone holding Indian citizen data.",
  "key_provisions": [
    {
      "provision": "A 'data principal' is you—any person whose data is being collected. A 'data fiduciary' is the company holding that data.",
      "source_section": "Section 2(c) and 2(f)",
      "concrete_example": "When you sign up for Zomato, you are the data principal. Zomato is the data fiduciary."
    }
  ],
  "ambiguities": [
    {
      "ambiguous_text": "'personal data' includes information 'capable of identifying' a natural person",
      "interpretation_1": "Personal data = any info that could be linked to a specific person (e.g., your email, even anonymised IP logs)",
      "interpretation_2": "Personal data = only data that directly identifies you (e.g., name, phone, Aadhaar)",
      "expert_note": "The law uses 'capable of' which is broader, but courts and regulators may narrow this over time"
    }
  ],
  "persona_impacts": [
    {
      "persona": "Gig Worker",
      "concrete_impact": "If you use Zomato, Swiggy, or Flipkart, this law controls what data they collect and how long they keep it. You have the right to ask them what data they have on you.",
      "timeline": "Became effective 11 August 2023; most compliance rules began 21 August 2024",
      "no_recommendation_only_info": "Check the privacy policy of apps you use; you can email asking what data they store on you"
    }
  ],
  "grade_level": 7.2,
  "common_misconceptions": [
    "Misconception: This law stops companies from collecting any data | Fact: Companies can collect data; this law just controls how they use it and your rights over it",
    "Misconception: This gives you full control to delete your data anytime | Fact: You have limited deletion rights; companies can keep data for legal/operational reasons"
  ]
}

Always respond with ONLY the JSON, no preamble, no explanation.
```

### Claude Haiku 4.5 Judge Prompt

```
You are a legal accuracy judge. You will receive a summary of an Indian bill section and the original source text. Your job is to verify that the summary is accurate—no hallucinations, no false claims, no misinterpretations.

For each key claim in the summary, score it 0–5:
- 5: Exact match to source text; no ambiguity
- 4: Accurate paraphrase; faithfully captures the source meaning
- 3: Minor inaccuracy or oversimplification; core meaning preserved
- 2: Significant inaccuracy or missing qualifier; misleading
- 1: Directly contradicts source
- 0: Hallucinated claim not in source text

OUTPUT ONLY THIS JSON:
{
  "claims_scored": [
    {
      "claim": "<the claim from summary>",
      "source_text": "<the exact text from bill that should support it>",
      "score": <0-5>,
      "reasoning": "<why this score; flagged issues>"
    }
  ],
  "overall_faithfulness_score": <average of all scores; 0-5>,
  "red_flags": ["<any hallucination>", "<any contradiction>"],
  "approval": <true if score >= 4.0, false otherwise>
}

Be strict. If the summary adds qualifiers not in the source, deduct 0.5. If the summary omits important exceptions, deduct 1.0.
```

---

## PART 5: Required Data Assets (Pre-Downloaded)

You must have these files in `/bills/` by Hour 1. Links provided; download directly into your repo.

| Bill | Source | License | File Size | Notes |
|------|--------|---------|-----------|-------|
| DPDP Act 2023 | indiacode.nic.in | Public | ~150 KB | Text layer clean; 38 sections |
| DPDP Rules 2025 | indiacode.nic.in | Public | ~180 KB | Notified 7 Jan 2025; crucial operational details |
| Bharatiya Nyaya Sanhita 2023 | prsindia.org or indiacode.nic.in | CC-BY 4.0 | ~500 KB | Replaces IPC; 536 sections; use sample chapters (e.g., Ch. VII on crimes) |
| Telecommunications Act 2023 | prsindia.org | CC-BY 4.0 | ~250 KB | Key for biometric KYC + enforcement provisions |

Download URLs:
- **DPDP Act**: https://www.indiacode.nic.in/bitstream/123456789/13841/1/digital_personal_data_protection_act_2023.pdf
- **DPDP Rules**: https://www.indiacode.nic.in/bitstream/123456789/13911/1/dpdp_rules_2025.pdf
- **BNS**: https://www.indiacode.nic.in/bitstream/123456789/13868/1/bharatiya_nyaya_sanhita_2023.pdf
- **Telecom Act**: https://prsindia.org/files/bills_acts/acts_parliament/2023/2023BT12.pdf

---

## PART 6: Success Criteria & Judging Rubric

Your project will be judged on the Anthropic Hackathon rubric:

| Dimension | Points | Target | How to Score |
|-----------|--------|--------|--------------|
| **Impact Potential** | 25 | 21–25 | Addresses a specific problem (legal exclusion via language barrier) with a clear population (citizens, zero legal knowledge). Users immediately understand what this solves. |
| **Technical Execution** | 30 | 25–30 | Core functionality works end-to-end. AI is used purposefully (Claude for summarization + Haiku for verification). Live demo flawlessly shows the full flow. |
| **Ethical Alignment** | 25 | 21–25 | Team has clearly wrestled with liability & accuracy concerns. Can articulate: (a) how AI could be weaponised (selective framing, misinformation at scale, voter manipulation), (b) your defenses (Citations API grounding, Haiku verification, PRS disclaimer). |
| **Presentation** | 20 | 17–20 | Clear explanation of problem, solution, and impact. Live demo shows the product working on real Indian bill. Team communicates confidence even when acknowledging limitations. |

### Red Flags That Lose Points (Avoid)

- **"This tool replaces lawyers"** — instant deduction; say instead "information, not advice"
- **No source citations** — judges will ask "where did this claim come from?" and you'll have no answer
- **Demo on fake data** — use real bills; judges know the bills and will notice
- **Hallucinated claims in live demo** — have pre-computed summaries cached; do not generate on stage
- **Inability to explain weaponisation risks** — have the 7-vector analysis ready (from the separate document provided)

### Bonus Points Possible

- Multilingual delivery (Hindi toggle) +2
- Pre/post comprehension data showing learning lift +2
- Persona-specific impact views +2
- Public GitHub repo with clean code +1
- Live deployment (not just local demo) +1

---

## PART 7: Key Files to Create

Create these in your repo (sample structure):

```
policy-explainer/
├── app/
│   ├── main.py                 # FastAPI app with /summarize endpoint
│   ├── retrieval.py            # BM25 + voyage embeddings + FAISS
│   ├── llm_handler.py          # Sonnet summarization + Haiku verification
│   ├── schemas.py              # Pydantic BillSummary, etc.
│   └── prompts.py              # System prompts (above)
├── frontend/
│   └── streamlit_app.py        # Streamlit UI (or Next.js if designer)
├── bills/                       # Pre-downloaded PDFs
│   ├── dpdp_act_2023.pdf
│   ├── dpdp_rules_2025.pdf
│   ├── bharatiya_nyaya_sanhita_2023.pdf
│   └── telecommunications_act_2023.pdf
├── data/
│   ├── bill_chunks.json        # Chunked text from all bills
│   └── cached_summaries.json   # Pre-computed summaries (for demo stability)
├── requirements.txt
├── .env                         # (DO NOT COMMIT)
├── .gitignore
├── README.md
└── PITCH.md                     # Your presentation (7 slides)
```

---

## PART 8: Testing & Validation Checklist

Before final submission, test all of these:

- [ ] All 3 bills load without PDF parsing errors
- [ ] BM25 index builds in <5 seconds; FAISS loads in <2 seconds
- [ ] Query "What is data fiduciary?" retrieves DPDP Section 2 in top-3
- [ ] Sonnet summarization completes <10 sec; includes Citations API data
- [ ] Haiku judge scores Sonnet output ≥4.0 on 80%+ of claims
- [ ] Persona filter works: "As a gig worker..." filters to labour/gig-specific impacts
- [ ] Hindi translation via Bhashini works; quality acceptable (>80% accuracy)
- [ ] Ambiguity detection fires on clauses with "unless", "provided that", "shall not"
- [ ] Disclaimer visible and persistent on all pages
- [ ] UI loads in <3 seconds; responsive on mobile
- [ ] Live demo URL works from remote machine (test from another laptop/phone)
- [ ] All 3 demo bills have pre-computed cached summaries ready for live demo
- [ ] Haiku judge never misses a hallucination in test cases
- [ ] Grade-level badge calculates correctly (test against https://www.textstat.org/)
- [ ] Citations API provides correct character indices (manual spot-check 3 claims)
- [ ] Cost tracking shows <$20 total spend (monitor in API responses)

---

## PART 9: Ethical Guardrails (Non-Optional)

Implement these in code + UX:

1. **No Legal Advice**: Every summary includes PRS disclaimer. Never say "you should" or "file a" or "sign this."
2. **Source Transparency**: Every claim links to source. User can click → see exact text highlighted.
3. **Confidence Flagging**: Claims scored <4/5 by Haiku are marked yellow; user sees uncertainty.
4. **Bias Audit**: Before submission, test for systematic bias (e.g., do certain personas get fewer impact statements?). Fix if found.
5. **Neutral Framing**: Bill summaries present competing interpretations on controversial clauses. Do not editorialize.
6. **No Data Retention**: Session-only. No logs of user queries. No cookies. Stateless.
7. **Accessibility**: All text must be readable at Grade 6–8 level (test with textstat). Images need alt text. Dark mode friendly.

---

## PART 10: Submission Checklist (T+22:00)

- [ ] GitHub repo public (or Hugging Face Space)
- [ ] Live demo URL (Streamlit Cloud / Vercel / Railway)
- [ ] Hackathon submission form filled: GitHub link, demo link, 2-min demo video
- [ ] README.md with: architecture, setup instructions, limitations, credits
- [ ] PITCH.md with presentation outline (5–7 slides) + speaker notes
- [ ] All API keys removed from code (use .env)
- [ ] requirements.txt finalized and tested
- [ ] Demo script written: 5-minute walkthrough prepared
- [ ] Comprehension quiz data (if time): before/after scores from testers
- [ ] Ethical guardrails checklist complete (liability, bias, accuracy)
- [ ] Cost tracking report (total $ spent, breakdown by API)

---

## FINAL NOTES

**If Running Out of Time (Hour 20+):**

Priority order to cut without losing core value:
1. Keep P0 features (summarization, source citations, disclaimer)
2. Cut Hindi (Bhashini) — show as roadmap
3. Cut persona selector — focus on "this is what it means" not "for you specifically"
4. Cut comprehension quiz — rely on judges' own testing
5. Cut Haiku judge — explain you would verify in production; show the prompt

**If Ahead of Schedule (Hour 16–18):**

Stretch features in priority order:
1. Flashcard quiz ("5 questions to test your understanding")
2. Bias audit (systematic testing for fairness)
3. Grade-level breakdown (show original bill vs. summary)
4. Multi-bill comparison ("How does DPDP vs. Telecom Act regulate WhatsApp?")
5. Interactive timeline ("When does this take effect? What are the phases?")

**Mentorship Q&A Likely Questions:**

- *"How is this different from PRS?"* → "PRS is reference material for MPs. We're plain-language explainers for citizens. We add personas, interactivity, and vernacular. PRS is English PDFs; we're dynamic web + Hindi."
- *"What about accuracy?"* → "Every claim is cited. Haiku verifies. We flag uncertainty. Disclaimer is clear. We're building a tool, not replacing expertise."
- *"How do you scale to 22 languages?"* → "Bhashini can do it; we're demoing English + Hindi. Adding languages is config change, not product redesign."
- *"Isn't this AI-assisted legal advice?"* → "No. We explain law, not apply it to your facts. We never say 'you should do X.' We say 'the law says X.' The difference is crucial and defensible."

---

**GOOD LUCK. YOU'VE GOT THIS. 🚀**
