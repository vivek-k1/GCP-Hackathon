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
