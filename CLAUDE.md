# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered legal explainer for Indian citizens — translates dense legislative PDFs into plain-language summaries with persona-specific impacts, source citations, ambiguity flagging, and Hindi translation. Built for the Anthropic Hackathon (Track 4: Governance & Collaboration).

Full spec: [docs/POLICY_EXPLAINER_PRD.md](docs/POLICY_EXPLAINER_PRD.md)  
Ready-to-use code patterns: [docs/CLAUDE_CODE_SKILLS.md](docs/CLAUDE_CODE_SKILLS.md)

## Commands

```bash
# Install dependencies (once requirements.txt is created)
pip install -r requirements.txt

# Run backend
uvicorn app.main:app --reload

# Run frontend
streamlit run frontend/streamlit_app.py
```

**Required `.env` variables:**
```
ANTHROPIC_API_KEY=
VOYAGEAI_API_KEY=
BHASHINI_USER_ID=
BHASHINI_API_KEY=
```

## Architecture

**Data flow:**
1. PDF text extracted via `pdfplumber`, chunked at Section boundaries (regex)
2. Hybrid retrieval: BM25 sparse (rank_bm25) + FAISS dense vectors (voyage-law-2 embeddings), fused via RRF — top chunks passed to LLM
3. Claude Sonnet 4.6 generates `BillSummary` JSON with Citations API enabled (character-level source grounding)
4. Claude Haiku 4.5 acts as faithfulness judge — scores each claim 0–5, flags anything below 4
5. Optional Bhashini ULCA NMT API call for English→Hindi translation (cached in-memory)
6. Streamlit UI: split-pane (summary left, source right), click-to-highlight citations, persona selector, Flesch-Kincaid grade badge

**Intended source layout:**
```
app/
  main.py          # FastAPI /summarize endpoint
  retrieval.py     # BM25 + Voyage + FAISS hybrid index
  llm_handler.py   # Sonnet summarization + Haiku verification
  schemas.py       # Pydantic models (BillSummary, SourceCitation, PersonaImpact, Ambiguity)
  prompts.py       # System prompts for both Sonnet and Haiku
frontend/
  streamlit_app.py
bills/             # 4 source PDFs (already present)
data/              # Cached chunks and pre-computed summaries (to be created)
```

## Key Pydantic Schemas

`SourceCitation` — claim, source_quote, source_section, confidence  
`Ambiguity` — clause, interpretation_a, interpretation_b, expert_note  
`PersonaImpact` — persona, impact, timeline, action_needed  
`BillSummary` — aggregates all above + tl_dr, grade_level, disclaimer, generated_at

## Tech Stack

| Component | Technology |
|---|---|
| Backend | FastAPI + Pydantic v2 |
| Frontend | Streamlit 1.40+ |
| Primary LLM | Claude Sonnet 4.6 (`claude-sonnet-4-6`) |
| Judge LLM | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| Embeddings | Voyage AI `voyage-law-2` |
| Vector store | FAISS (in-memory) |
| Sparse retrieval | rank_bm25 BM25Okapi |
| PDF parsing | pdfplumber |
| Readability | textstat (Flesch-Kincaid) |
| Translation | Bhashini ULCA NMT API (1000 req/day free) |

## Bills on Disk

- `bills/Digital Personal Data Protection Act 2023.pdf`
- `bills/Bharatiya Nyaya Sanhita 2023.pdf`
- `bills/Telecommunications Act 2023.pdf`
- `bills/Code on Social Security 2020.pdf`

## Constraints

- Retrieval must return top-5 BM25 + top-5 dense chunks before LLM call
- Haiku judge must flag claims with confidence < 4/5
- All LLM responses must use structured JSON output via Pydantic
- Bhashini translation is optional/cached — never block the summary on it
- Include a sticky legal disclaimer in every UI response
- System prompts for both Sonnet and Haiku are fully written in the PRD (copy from there)
