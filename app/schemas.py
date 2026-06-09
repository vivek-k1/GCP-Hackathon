from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


class KeyProvision(BaseModel):
    provision: str
    source_section: str
    concrete_example: str


class Ambiguity(BaseModel):
    ambiguous_text: str
    interpretation_1: str
    interpretation_2: Optional[str] = None
    expert_note: str


class PersonaImpact(BaseModel):
    persona: str
    concrete_impact: str
    timeline: Optional[str] = None
    no_recommendation_only_info: Optional[str] = None


class SonnetSummary(BaseModel):
    """Matches the exact JSON schema returned by Claude Sonnet 4.6."""
    tl_dr: str
    purpose: str
    key_provisions: List[KeyProvision] = []
    ambiguities: List[Ambiguity] = []
    persona_impacts: List[PersonaImpact] = []
    grade_level: float = 8.0
    common_misconceptions: List[str] = []

    @field_validator("grade_level", mode="before")
    @classmethod
    def clamp_grade(cls, v):
        try:
            return max(1.0, min(18.0, float(v)))
        except (TypeError, ValueError):
            return 8.0


class HaikuClaimScore(BaseModel):
    claim: str
    source_text: str
    score: float
    reasoning: str


class HaikuJudgement(BaseModel):
    """Matches the exact JSON schema returned by Claude Haiku 4.5 judge."""
    claims_scored: List[HaikuClaimScore] = []
    overall_faithfulness_score: float = 5.0
    red_flags: List[str] = []
    approval: bool = True
    requires_human_review: bool = False


class BillResponse(BaseModel):
    """Complete API response for a bill summarization request."""
    bill: str
    bill_display_name: str
    section: str
    source_text: str
    summary: SonnetSummary
    faithfulness_score: float
    requires_review: bool
    red_flags: List[str]
    tokens_used: dict
    generated_at: str
    disclaimer: str


# ── Courtroom Simulation (PA-MA-RAG) ────────────────────────────────────────


class LegalIssue(BaseModel):
    issue: str
    governing_law: str = ""
    kanoon_query: str = ""


class CaseAnalysis(BaseModel):
    """Output of the Senior Lawyer Agent (domain classification + issue spotting)."""
    domain: str  # Civil | Criminal | Consumer | Labor | Constitutional | Other
    domain_confidence: float = 0.5
    summary: str = ""
    issues: List[LegalIssue] = []
    governing_acts: List[str] = []
    suggested_court: str = "supremecourt"


class Precedent(BaseModel):
    docid: str
    title: str
    court: str = ""
    headline: str = ""
    url: str = ""
    weight: float = 0.5
    date: str = ""
    snippet: str = ""


class Citation(BaseModel):
    docid: str = ""
    label: str = ""           # e.g. "K.S. Puttaswamy v. Union of India"
    statute_section: str = "" # e.g. "Article 21" / "Section 138"
    quote: str = ""
    url: str = ""
    grounded: Optional[bool] = None  # set by jury validator


class CourtroomTurn(BaseModel):
    turn_id: int
    side: str                 # accuser | defense | judge
    speaker: str              # "user" | "ai" | "judge"
    role_label: str = ""
    argument: str = ""
    citations: List[Citation] = []
    timestamp: str = ""


class JuryComponent(BaseModel):
    score: float = 0.0        # 0-1
    rationale: str = ""


class SideScore(BaseModel):
    statute: JuryComponent = JuryComponent()
    precedent: JuryComponent = JuryComponent()
    factual: JuryComponent = JuryComponent()
    s_jury: float = 0.0       # weighted composite 0-1


class JuryVerdict(BaseModel):
    accuser: SideScore = SideScore()
    defense: SideScore = SideScore()
    leaning: str = "balanced"   # accuser | defense | balanced
    margin: float = 0.0
    rationale: str = ""
    hallucination_flags: List[str] = []
    weights: dict = {"statute": 0.4, "precedent": 0.4, "factual": 0.2}
    disclaimer: str = ""
