# RECOMMENDED CLAUDE CODE SKILLS FOR POLICY EXPLAINER BUILD

Create these as reusable skills in your Claude Code environment. Each skill is a focused prompt template + code pattern that you can call throughout your hackathon build.

---

## SKILL 1: Legal Text Chunking (bill_structure_parser)

**Purpose**: Detect and split Indian bill text at logical boundaries (Section, Subsection, Clause, Proviso) without breaking provisos from their parents.

**Trigger**: Use when you need to split a raw bill text into chunks for retrieval/summarization.

**Prompt Template**:
```
You are an expert at parsing Indian legislative text. Given raw bill text, identify logical chunks at the Section level (not sub-sections, which should stay with their parent).

Indian bills follow this structure:
- Section N.     <Main section text>
  (1) <subsection>
    (a) <clause>
      Provided that, <proviso>

RULES:
1. Never split a Section from its subsections; never split a subsection from its clauses; never split a clause from its provisos
2. Each chunk = one Section (all its content)
3. Detect structure via regex: ^\d+\.\s+[A-Z]
4. Return JSON array: {section: "1", text: "...", has_provisos: bool, subsections: int}

Input: [raw text]
Output: JSON array of chunks with metadata
```

**Code Pattern**:
```python
import re
from typing import list

def chunk_by_section(raw_text: str) -> list[dict]:
    sections = []
    pattern = r'^(\d+)\.\s+([A-Z].*?)(?=^\d+\.\s+[A-Z]|$)'
    matches = re.finditer(pattern, raw_text, re.MULTILINE | re.DOTALL)
    
    for match in matches:
        section_num = match.group(1)
        section_text = match.group(2).strip()
        has_provisos = "Provided that" in section_text or "provided that" in section_text
        
        sections.append({
            "section": f"Section {section_num}",
            "text": section_text,
            "has_provisos": has_provisos,
            "token_count": len(section_text.split())
        })
    
    return sections
```

---

## SKILL 2: Hybrid Retrieval Fusion (retrieve_fused_sections)

**Purpose**: Combine BM25 sparse retrieval + Dense embeddings (voyage-law-2) using Reciprocal Rank Fusion. Returns top-K most relevant bill sections for a query.

**Trigger**: Use when user asks a question about a bill; retrieve relevant sections before summarization.

**Code Pattern**:
```python
from rank_bm25 import BM25Okapi
import numpy as np
import voyageai

def fused_retrieve(query: str, sections: list[dict], top_k: int = 5) -> list[tuple]:
    """
    Returns list of (section_name, relevance_score) tuples, best first.
    """
    
    # BM25 Sparse Retrieval
    corpus = [s["text"] for s in sections]
    tokenized = [doc.split() for doc in corpus]
    bm25 = BM25Okapi(tokenized)
    bm25_scores = bm25.get_scores(query.split())
    bm25_ranks = sorted(enumerate(bm25_scores), key=lambda x: x[1], reverse=True)
    
    # Dense Retrieval (Voyage AI)
    client = voyageai.Client()
    query_embedding = client.embed(query, model="voyage-law-2")["data"][0]["embedding"]
    
    dense_scores = []
    for s in sections:
        doc_embedding = client.embed(s["text"], model="voyage-law-2")["data"][0]["embedding"]
        cosine_sim = np.dot(query_embedding, doc_embedding) / (
            np.linalg.norm(query_embedding) * np.linalg.norm(doc_embedding)
        )
        dense_scores.append(cosine_sim)
    
    dense_ranks = sorted(enumerate(dense_scores), key=lambda x: x[1], reverse=True)
    
    # Reciprocal Rank Fusion
    rrf_scores = {}
    for rank, (idx, score) in enumerate(bm25_ranks[:top_k * 2]):
        rrf_scores[idx] = rrf_scores.get(idx, 0) + 1 / (rank + 60)
    
    for rank, (idx, score) in enumerate(dense_ranks[:top_k * 2]):
        rrf_scores[idx] = rrf_scores.get(idx, 0) + 1 / (rank + 60)
    
    # Return top-K
    sorted_results = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
    return [(sections[idx]["section"], score) for idx, score in sorted_results]
```

---

## SKILL 3: Sonnet 4.6 with Citations API (claude_summarize_with_citations)

**Purpose**: Call Claude Sonnet 4.6 with Citations API enabled. Returns summary + source spans + character indices.

**Trigger**: Use when you need to summarize a bill section and ground every claim in source text.

**Code Pattern**:
```python
import anthropic
import json

def summarize_with_citations(bill_text: str, section_name: str) -> dict:
    """
    Returns {summary: BillSummary, citations: [...], citations_raw: {...}}
    """
    
    client = anthropic.Anthropic()
    
    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=2000,
        temperature=0,
        system="""[Insert the Sonnet 4.6 system prompt from PRD Part 4 here]""",
        messages=[
            {
                "role": "user",
                "content": f"""
Summarize this section of Indian legislation:

BILL TEXT:
{bill_text}

SECTION NAME: {section_name}

Return ONLY valid JSON, no preamble.
                """
            }
        ]
    )
    
    # Extract Citations API data (if enabled)
    citations_data = []
    if hasattr(response, 'citations'):
        for citation in response.citations:
            citations_data.append({
                "text": citation.text,
                "start_index": citation.start_index,
                "end_index": citation.end_index,
                "document_index": citation.document_index
            })
    
    summary_json = json.loads(response.content[0].text)
    
    return {
        "summary": summary_json,
        "citations_raw": citations_data,
        "model": "claude-sonnet-4-6",
        "usage": {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens
        }
    }
```

---

## SKILL 4: Haiku Judge (verify_faithfulness)

**Purpose**: Use Claude Haiku 4.5 to score the faithfulness of a Sonnet summary against source text. Flag hallucinations.

**Trigger**: Use after every Sonnet summarization to verify accuracy before displaying to user.

**Code Pattern**:
```python
import anthropic
import json

def verify_with_haiku(original_text: str, summary_json: dict) -> dict:
    """
    Scores each claim in summary against source. Returns overall faithfulness score.
    """
    
    client = anthropic.Anthropic()
    
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1500,
        temperature=0,
        system="""[Insert Haiku Judge prompt from PRD Part 4 here]""",
        messages=[
            {
                "role": "user",
                "content": f"""
ORIGINAL BILL TEXT:
{original_text}

SUMMARY TO VERIFY:
{json.dumps(summary_json, indent=2)}

Verify faithfulness of each claim. Output only JSON.
                """
            }
        ]
    )
    
    judge_output = json.loads(response.content[0].text)
    
    # Add flag: if overall score < 4.0, mark for human review
    judge_output["requires_human_review"] = judge_output["overall_faithfulness_score"] < 4.0
    
    return judge_output
```

---

## SKILL 5: Bhashini NMT Pipeline (translate_to_hindi)

**Purpose**: Translate English summary to Hindi using Bhashini's free NMT API. Cache translations to avoid repeated API calls.

**Trigger**: Use when user toggles to Hindi view.

**Code Pattern**:
```python
import requests
import json

# Cache translations in memory to avoid repeated API calls
_translation_cache = {}

def translate_to_hindi(english_text: str, cache: dict = _translation_cache) -> str:
    """
    Translates English text to Hindi via Bhashini ULCA API.
    Caches to avoid repeated calls. Free tier: 1000 req/day.
    """
    
    cache_key = hash(english_text) % ((sys.maxsize + 1) * 2)
    
    if cache_key in cache:
        return cache[cache_key]
    
    # Get Bhashini auth token
    auth_response = requests.post(
        "https://meity-auth.ulcacontrib.org/oauth2/token",
        json={
            "grant_type": "client_credentials",
            "client_id": os.getenv("BHASHINI_USER_ID"),
            "client_secret": os.getenv("BHASHINI_API_KEY")
        }
    )
    
    token = auth_response.json()["access_token"]
    
    # Call NMT
    nmt_response = requests.post(
        "https://meity-nlp.ulcacontrib.org/nlp/v1/translation",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "input": [{"source": english_text}],
            "config": {
                "language": {
                    "sourceLanguage": "en",
                    "targetLanguage": "hi"
                }
            }
        }
    )
    
    hindi_text = nmt_response.json()["output"][0]["target"]
    cache[cache_key] = hindi_text
    
    return hindi_text
```

---

## SKILL 6: Grade Level & Readability (compute_reading_metrics)

**Purpose**: Calculate Flesch-Kincaid grade level. Target Grade 6–8 for zero-knowledge audiences.

**Trigger**: Use after generating summary to verify plain-language quality.

**Code Pattern**:
```python
import textstat

def compute_reading_metrics(text: str) -> dict:
    """
    Returns reading difficulty metrics. Target Grade 6-8.
    """
    
    return {
        "flesch_kincaid_grade": textstat.flesch_kincaid_grade(text),
        "flesch_reading_ease": textstat.flesch_reading_ease(text),
        "gunning_fog_index": textstat.gunning_fog(text),
        "automated_readability_index": textstat.automated_readability_index(text),
        "reading_time_minutes": textstat.reading_time(text),
        "is_target_grade": 6 <= textstat.flesch_kincaid_grade(text) <= 8,
        "recommendation": (
            "Grade level is too high; simplify vocabulary" 
            if textstat.flesch_kincaid_grade(text) > 8 
            else "Grade level is appropriate"
        )
    }
```

---

## SKILL 7: Persona-Based Filtering (filter_by_persona)

**Purpose**: Given user's persona and bill summary, return only the impact statements relevant to that persona.

**Trigger**: Use when user selects a persona from dropdown (Gig Worker, Farmer, etc.).

**Code Pattern**:
```python
def filter_impact_by_persona(summary: dict, selected_persona: str) -> dict:
    """
    Filters persona_impacts to only those matching selected_persona.
    Falls back to generic impact if no exact match.
    """
    
    filtered_summary = summary.copy()
    
    matching_impacts = [
        impact for impact in summary["persona_impacts"]
        if impact["persona"].lower() == selected_persona.lower()
    ]
    
    # If exact match, use it; otherwise show all and highlight the closest match
    if matching_impacts:
        filtered_summary["persona_impacts"] = matching_impacts
        filtered_summary["persona_matched"] = True
    else:
        # Fallback: keep all but reorder to put closest match first
        filtered_summary["persona_matched"] = False
        filtered_summary["persona_impacts"] = summary["persona_impacts"]
    
    return filtered_summary
```

---

## SKILL 8: Disclaimer & Legal Coverage (generate_disclaimer_banner)

**Purpose**: Generate standardized PRS-style disclaimer. Ensure it appears on every page without alarming users.

**Trigger**: Use on every summary display.

**Code Pattern**:
```python
def generate_disclaimer_banner(bill_name: str, section: str = None) -> str:
    """
    Returns HTML/Markdown for PRS-standard disclaimer.
    """
    
    generated_date = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    
    disclaimer = f"""
**⚠️ Information Notice (Not Legal Advice)**

This is an AI-generated summary of {bill_name}{f', Section {section}' if section else ''}. 

- **What this is**: Plain-language explanation of the law as written.
- **What this is NOT**: Legal advice, legal interpretation, or recommendation for action.
- **Why**: Only enrolled advocates can provide legal advice under Bar Council of India Rule 36.
- **Verification**: The original bill text is shown alongside. Always verify against the official Gazette text.
- **Accuracy**: This summary was generated on {generated_date} and may contain errors. Haiku verification suggests confidence level in citations above.

**Always consult a qualified lawyer before taking action based on legislation.**

Source: {bill_name} (India Code / Parliament of India)
"""
    
    return disclaimer
```

---

## SKILL 9: Ambiguity Detection (detect_conditional_language)

**Purpose**: Automatically flag clauses with conditional language (unless, provided that, subject to, shall not) as potentially ambiguous. Prompt Sonnet to provide competing interpretations.

**Trigger**: Use during summarization to identify clauses needing extra scrutiny.

**Code Pattern**:
```python
import re

def detect_conditional_language(text: str) -> list[str]:
    """
    Returns list of sentences containing conditional language.
    """
    
    patterns = [
        r"unless\s+",
        r"provided that",
        r"subject to",
        r"shall not",
        r"notwithstanding",
        r"notwithstanding anything contained",
        r"except where",
        r"only if"
    ]
    
    sentences = text.split(".")
    flagged = []
    
    for sentence in sentences:
        for pattern in patterns:
            if re.search(pattern, sentence, re.IGNORECASE):
                flagged.append(sentence.strip())
                break
    
    return flagged

# Use this to instruct Sonnet:
# ambiguous_clauses = detect_conditional_language(bill_text)
# system_prompt += f"\n\nFLAGGED AMBIGUOUS CLAUSES (needs competing interpretations):\n" + "\n".join(ambiguous_clauses)
```

---

## SKILL 10: Cost Tracking & Budget (monitor_api_spend)

**Purpose**: Track Claude API usage in real-time. Alert if approaching $20 ceiling for 24-hour demo.

**Trigger**: After every API call, log token usage.

**Code Pattern**:
```python
class CostTracker:
    def __init__(self, budget_usd: float = 20.0):
        self.budget = budget_usd
        self.calls = []
        self.total_input_tokens = 0
        self.total_output_tokens = 0
    
    def log_call(self, model: str, input_tokens: int, output_tokens: int):
        """Log a single API call and compute cost."""
        
        # Pricing as of April 2026
        pricing = {
            "claude-sonnet-4-6": {"input": 3 / 1e6, "output": 15 / 1e6},
            "claude-haiku-4-5-20251001": {"input": 0.25 / 1e6, "output": 1.25 / 1e6},
        }
        
        rate = pricing.get(model, pricing["claude-sonnet-4-6"])
        cost = (input_tokens * rate["input"]) + (output_tokens * rate["output"])
        
        self.calls.append({
            "model": model,
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "cost_usd": cost,
            "timestamp": datetime.now()
        })
        
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        
        total_cost = sum(c["cost_usd"] for c in self.calls)
        
        if total_cost > self.budget * 0.8:
            print(f"⚠️ WARNING: API spending is {total_cost:.2f} USD ({total_cost/self.budget*100:.0f}% of budget)")
        
        return {
            "cost_usd": cost,
            "total_spent_usd": total_cost,
            "budget_remaining_usd": self.budget - total_cost,
            "pct_of_budget": (total_cost / self.budget) * 100
        }
    
    def summary(self) -> dict:
        total_cost = sum(c["cost_usd"] for c in self.calls)
        return {
            "total_calls": len(self.calls),
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "total_cost_usd": total_cost,
            "budget_remaining_usd": self.budget - total_cost,
            "calls_breakdown": {
                "sonnet_calls": len([c for c in self.calls if "sonnet" in c["model"]]),
                "haiku_calls": len([c for c in self.calls if "haiku" in c["model"]])
            }
        }

# Usage:
tracker = CostTracker(budget_usd=20.0)
# After every API call:
# tracker.log_call("claude-sonnet-4-6", response.usage.input_tokens, response.usage.output_tokens)
```

---

## SKILL 11: Markdown-to-JSON Summary Formatter (standardize_output)

**Purpose**: Ensure all summaries conform to the BillSummary JSON schema. Validate and normalize before display.

**Trigger**: After Sonnet generates summary; before storing or displaying.

**Code Pattern**:
```python
from pydantic import BaseModel, ValidationError

class SourceCitation(BaseModel):
    provision: str
    source_section: str
    concrete_example: str

class BillSummary(BaseModel):
    tl_dr: str
    purpose: str
    key_provisions: list[SourceCitation]
    grade_level: float
    ambiguities: list[dict] = []
    persona_impacts: list[dict] = []

def standardize_summary(raw_json: dict) -> BillSummary:
    """Validates and normalizes summary to schema."""
    
    try:
        summary = BillSummary(**raw_json)
        return summary
    except ValidationError as e:
        print(f"Schema validation failed: {e}")
        # Attempt repair: fill missing fields with defaults
        raw_json.setdefault("ambiguities", [])
        raw_json.setdefault("persona_impacts", [])
        return BillSummary(**raw_json)
```

---

## SKILL 12: Interactive Source Highlighting (link_claims_to_source)

**Purpose**: For each claim in summary, compute exact character span in bill text. Return mapping for UI to highlight on click.

**Trigger**: After summary + citations are generated; before sending to frontend.

**Code Pattern**:
```python
def link_claims_to_source(summary: dict, bill_text: str, citations_api_data: list) -> dict:
    """
    Returns summary with added 'source_span' field on each claim.
    Maps claim → (start_char, end_char) in bill_text for UI highlighting.
    """
    
    enhanced_summary = summary.copy()
    
    for i, provision in enumerate(enhanced_summary.get("key_provisions", [])):
        # Find source quote in bill text
        source_quote = provision.get("source_quote", "")
        
        if source_quote and source_quote in bill_text:
            start = bill_text.find(source_quote)
            end = start + len(source_quote)
            
            enhanced_summary["key_provisions"][i]["source_span"] = {
                "start_char": start,
                "end_char": end,
                "text": source_quote
            }
    
    return enhanced_summary
```

---

## Implementation Priority

Add these skills in this order (based on dependency and criticality):

1. **Skill 1** (bill_structure_parser) — First step; without it, no chunking
2. **Skill 3** (claude_summarize_with_citations) — Core value; essential
3. **Skill 4** (verify_faithfulness) — Accuracy guardrail; prevents hallucinations
4. **Skill 2** (retrieve_fused_sections) — Search; enable before summarization
5. **Skill 6** (compute_reading_metrics) — QA metric; validates plain language
6. **Skill 10** (monitor_api_spend) — Budget tracking; run alongside everything
7. **Skill 7** (filter_by_persona) — UI feature; mid-priority
8. **Skill 5** (translate_to_hindi) — Localization; lower priority if time-constrained
9. **Skill 8** (generate_disclaimer_banner) — Legal coverage; essential before launch
10. **Skill 9** (detect_conditional_language) — Advanced accuracy; nice-to-have
11. **Skill 11** (standardize_output) — Data validation; ensure consistency
12. **Skill 12** (link_claims_to_source) — UI feature; frontend integration

---

## How to Add These to Claude Code

In your `claude_code.json` or skills configuration:

```json
{
  "skills": [
    {
      "name": "bill_structure_parser",
      "description": "Chunk Indian bills at Section boundaries without breaking provisos",
      "trigger_keywords": ["chunk", "split", "section", "structure"],
      "code_file": "/app/skills/bill_chunker.py"
    },
    {
      "name": "hybrid_retrieval",
      "description": "BM25 + Dense + RRF fusion for section retrieval",
      "trigger_keywords": ["retrieve", "search", "query", "section"],
      "code_file": "/app/skills/retrieval.py"
    },
    ...
  ]
}
```

Each skill is a `.py` file importable from your main code: `from app.skills.bill_chunker import chunk_by_section`

---

**THAT'S YOUR COMPLETE TECHNICAL PLAYBOOK. NOW BUILD IT. 🚀**
