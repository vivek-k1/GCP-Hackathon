export interface KeyProvision {
  provision: string;
  source_section: string;
  concrete_example: string;
}

export interface Ambiguity {
  ambiguous_text: string;
  interpretation_1: string;
  interpretation_2?: string;
  expert_note: string;
}

export interface PersonaImpact {
  persona: string;
  concrete_impact: string;
  timeline?: string;
  no_recommendation_only_info?: string;
  applies?: boolean;
}

/** One section in the overall structured answer (after agent deliberation) */
export interface OverallSection {
  title: string;
  body?: string;
  bullets?: string[];
}

export interface OverallStructured {
  title: string;
  takeaway: string;
  sections: OverallSection[];
  /** Optional closing note on uncertainty or what to watch */
  outlook?: string;
}

/** Final SSE payload after all five agents — tailored to question + persona */
export interface ReaderOverallPayload {
  /** When the model returns validated JSON */
  structured?: OverallStructured;
  /** Fallback plain text if JSON failed or legacy API */
  text?: string;
}

export interface SonnetSummary {
  tl_dr: string;
  purpose: string;
  key_provisions: KeyProvision[];
  ambiguities: Ambiguity[];
  persona_impacts: PersonaImpact[];
  grade_level: number;
  common_misconceptions: string[];
}

export interface HaikuClaimScore {
  claim: string;
  source_text: string;
  score: number;
  reasoning: string;
}

export interface BillResponse {
  bill: string;
  bill_display_name: string;
  section: string;
  source_text: string;
  summary: SonnetSummary;
  faithfulness_score: number;
  requires_review: boolean;
  red_flags: string[];
  tokens_used: Record<string, { input_tokens: number; output_tokens: number }>;
  generated_at: string;
  disclaimer: string;
}

export interface BillInfo {
  display_name: string;
  num_sections: number;
  /** Set for user-uploaded PDFs */
  uploaded?: boolean;
  /** e.g. Central, or "Uploaded" */
  tag?: string;
}

export type AgentId =
  | "economist"
  | "social_worker"
  | "rural_specialist"
  | "legal_expert"
  | "citizen";

export type AgentVerdict =
  | "positive" | "mixed" | "concern"
  | "protective" | "exclusionary"
  | "robust" | "needs_clarification" | "legally_risky"
  | "business_friendly" | "neutral" | "burdensome"
  | "good_news" | "bad_news"
  | "error";

export interface AgentResult {
  agent_id: AgentId;
  agent_label: string;
  agent_description: string;
  verdict: AgentVerdict;
  headline: string;
  confidence: number;

  positives?: string[];
  concerns?: string[];
  most_affected_sector?: string;
  fiscal_note?: string;

  who_is_protected?: string[];
  who_is_excluded?: string[];
  implementation_gap?: string;
  grassroots_note?: string;

  strengths?: string[];
  gaps?: string[];
  likely_litigation?: string;
  constitutional_note?: string;

  compliance_cost?: string;
  who_benefits?: string[];
  who_struggles?: string[];
  ease_of_doing_business?: string;
  msme_note?: string;

  what_changes_for_me?: string[];
  what_stays_same?: string;
  biggest_question?: string;
  trust_level?: string;

  error?: string;
  _usage?: { input_tokens: number; output_tokens: number };
}

export type AgentStreamStatus = "idle" | "thinking" | "streaming" | "complete" | "error";

export interface AgentStreamState {
  agentId: AgentId;
  status: AgentStreamStatus;
  text: string;
  result: AgentResult | null;
  startTime: number | null;
  elapsedMs: number;
}

export interface DemographicProfile {
  income: number;
  location: "urban" | "semi-urban" | "rural";
  householdSize: number;
  occupation: string;
  age: number;
  state: string;
}

export interface ImpactMetric {
  label: string;
  before: number;
  after: number;
  unit: string;
  delta: number;
  sentiment: "positive" | "negative" | "neutral";
}

export interface RedTeamCheck {
  id: string;
  check: string;
  status: "passed" | "flagged" | "pending";
  detail: string;
  timestamp: string;
}

export interface EthicalAuditState {
  guardrailStatus: "active" | "warning" | "breach";
  redTeamLog: RedTeamCheck[];
  citationVerifications: {
    claim: string;
    verified: boolean;
    sourceQuote: string;
    sourceSection: string;
  }[];
  vsdFrameworkActive: boolean;
}

export interface ConsensusCluster {
  id: string;
  label: string;
  x: number;
  y: number;
  agentId: AgentId;
  agentLabel: string;
  verdict: AgentVerdict;
  confidence: number;
  consensusPoints: string[];
}
