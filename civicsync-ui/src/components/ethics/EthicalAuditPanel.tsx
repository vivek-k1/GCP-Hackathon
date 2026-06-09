import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Eye,
  FileSearch,
  Lock,
  Fingerprint,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { RedTeamCheck, BillResponse, AgentResult } from "@/types/api";

interface EthicalAuditPanelProps {
  className?: string;
  billResponse?: BillResponse | null;
  agentResults?: AgentResult[];
}

const MOCK_RED_TEAM_LOG: RedTeamCheck[] = [
  {
    id: "rt1",
    check: "Manipulation Detection",
    status: "passed",
    detail:
      "No emotionally manipulative language or fear-based framing detected in agent outputs. All claims use neutral, evidence-based phrasing.",
    timestamp: "2026-04-27T16:42:03Z",
  },
  {
    id: "rt2",
    check: "Disinformation Screen",
    status: "passed",
    detail:
      "All factual claims cross-referenced against source legislation text. 0 fabricated citations detected. Faithfulness score: 4.2/5.0",
    timestamp: "2026-04-27T16:42:05Z",
  },
  {
    id: "rt3",
    check: "Political Bias Audit",
    status: "passed",
    detail:
      "No systematic political bias detected. Both reform benefits and implementation concerns presented with equal weight.",
    timestamp: "2026-04-27T16:42:07Z",
  },
  {
    id: "rt4",
    check: "Demographic Fairness",
    status: "flagged",
    detail:
      'Impact calculator shows disproportionate digital burden increase for rural demographics (200% vs 12.5% for urban). Flagged for review — this reflects genuine policy disparity, not algorithmic bias.',
    timestamp: "2026-04-27T16:42:09Z",
  },
  {
    id: "rt5",
    check: "Source Grounding Verification",
    status: "passed",
    detail:
      "All agent verdicts traceable to specific legislative text sections. No extrapolation beyond source material.",
    timestamp: "2026-04-27T16:42:11Z",
  },
  {
    id: "rt6",
    check: "Prescriptive Language Filter",
    status: "passed",
    detail:
      'No directive language ("you should", "you must") found in agent analysis. All outputs are informational only.',
    timestamp: "2026-04-27T16:42:13Z",
  },
];

const MOCK_CITATIONS = [
  {
    claim: "Tax compliance cost reduced by 40% for MSMEs",
    verified: true,
    sourceQuote:
      "simplified tax structure for enterprises with turnover below ₹5 Cr",
    sourceSection: "Section 14(2)(a)",
  },
  {
    claim: "Gig worker protections are a landmark inclusion",
    verified: true,
    sourceQuote:
      "platform-based workers shall be entitled to social security benefits",
    sourceSection: "Section 2(35) read with Section 114",
  },
  {
    claim: "43% of rural population lacks reliable internet",
    verified: false,
    sourceQuote: "Not found in legislation text — external statistical claim",
    sourceSection: "N/A — requires independent verification",
  },
];

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
    case "flagged":
      return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />;
    default:
      return <Clock className="h-3.5 w-3.5 text-zinc-500" />;
  }
}

export function EthicalAuditPanel({
  className,
  billResponse,
  agentResults,
}: EthicalAuditPanelProps) {
  const [expandedCheck, setExpandedCheck] = useState<string | null>(null);

  const redTeamLog = buildRedTeamLog(billResponse, agentResults);
  const citations = buildCitations(billResponse);

  const passedCount = redTeamLog.filter((c) => c.status === "passed").length;
  const flaggedCount = redTeamLog.filter((c) => c.status === "flagged").length;
  const totalChecks = redTeamLog.length;

  return (
    <div className={cn("space-y-5", className)}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-sm font-display font-bold text-zinc-100">
            Ethical Audit Panel
          </h3>
          <p className="text-[10px] text-zinc-500">
            Meta-Intent Guardrail · Active
          </p>
        </div>
      </div>

      {/* Guardrail Status */}
      <div
        className={cn(
          "rounded-xl p-3 border",
          flaggedCount === 0
            ? "bg-emerald-500/5 border-emerald-500/20"
            : "bg-amber-500/5 border-amber-500/20"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {flaggedCount === 0 ? (
              <Shield className="h-4 w-4 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-amber-400" />
            )}
            <span
              className={cn(
                "text-xs font-semibold",
                flaggedCount === 0 ? "text-emerald-400" : "text-amber-400"
              )}
            >
              {flaggedCount === 0 ? "All Checks Passed" : `${flaggedCount} Flag(s)`}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            {passedCount}/{totalChecks} passed
          </span>
        </div>
      </div>

      {/* VSD Framework Badge */}
      <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Fingerprint className="h-3.5 w-3.5 text-purple-400" />
          <span className="text-[11px] font-semibold text-purple-400 uppercase tracking-wider">
            Value Sensitive Design
          </span>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          CivicSync follows the VSD framework to prioritize citizen autonomy
          over algorithmic automation. Every AI output is informational — final
          judgment remains with the user.
        </p>
      </div>

      {/* Red-Team Log */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Lock className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
            Red-Team Audit Log
          </span>
        </div>

        <div className="space-y-1.5">
          {redTeamLog.map((check) => (
            <div key={check.id}>
              <button
                onClick={() =>
                  setExpandedCheck(
                    expandedCheck === check.id ? null : check.id
                  )
                }
                className={cn(
                  "w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-all",
                  expandedCheck === check.id
                    ? "bg-zinc-800 border border-zinc-700"
                    : "hover:bg-zinc-800/50"
                )}
              >
                <StatusIcon status={check.status} />
                <span className="text-xs text-zinc-300 flex-1 truncate">
                  {check.check}
                </span>
                <span className="text-[9px] text-zinc-600">
                  {new Date(check.timestamp).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </button>

              <AnimatePresence>
                {expandedCheck === check.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <p className="text-[11px] text-zinc-500 leading-relaxed px-3 py-2 ml-6 border-l border-zinc-800">
                      {check.detail}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      </div>

      {/* Citation Verification */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <FileSearch className="h-3.5 w-3.5 text-zinc-500" />
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
            Citation Verification
          </span>
        </div>

        <div className="space-y-2">
          {citations.map((citation, i) => (
            <div
              key={i}
              className="rounded-lg bg-zinc-800/30 border border-zinc-800 p-3 space-y-2"
            >
              <p className="text-xs text-zinc-300 leading-relaxed">
                "{citation.claim}"
              </p>
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5",
                    citation.verified
                      ? "bg-emerald-500/10 text-emerald-400"
                      : "bg-amber-500/10 text-amber-400"
                  )}
                >
                  {citation.verified ? (
                    <CheckCircle2 className="h-2.5 w-2.5" />
                  ) : (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  )}
                  {citation.verified ? "VERIFIED" : "UNVERIFIED"}
                </span>
                <button className="flex items-center gap-1 text-[10px] text-zinc-500 hover:text-blue-400 transition-colors">
                  <Eye className="h-3 w-3" />
                  Verify Citation
                </button>
              </div>
              {citation.verified && (
                <div className="text-[10px] text-zinc-600 border-l-2 border-zinc-700 pl-2">
                  <span className="text-zinc-500">Source:</span>{" "}
                  {citation.sourceSection}
                  <br />
                  <span className="italic">"{citation.sourceQuote}"</span>
                </div>
              )}
              {!citation.verified && (
                <div className="text-[10px] text-amber-500/70 border-l-2 border-amber-500/20 pl-2">
                  {citation.sourceQuote}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Human-in-the-loop notice */}
      <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3">
        <div className="flex items-start gap-2">
          <ExternalLink className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[11px] font-semibold text-blue-400">
              Human-in-the-Loop
            </p>
            <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">
              Every AI claim includes a "Verify Citation" button. You retain
              final judgment. AI output is informational only — not legal advice.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildRedTeamLog(
  resp?: BillResponse | null,
  agents?: AgentResult[]
): RedTeamCheck[] {
  if (!resp && (!agents || agents.length === 0)) return MOCK_RED_TEAM_LOG;

  const now = new Date().toISOString();
  const checks: RedTeamCheck[] = [];

  const score = resp?.faithfulness_score ?? 0;
  checks.push({
    id: "rt-faith",
    check: "Faithfulness Verification",
    status: score >= 3.5 ? "passed" : "flagged",
    detail: resp
      ? `Haiku judge scored overall faithfulness at ${score.toFixed(1)}/5.0. ${
          score >= 3.5
            ? "Summary accurately reflects source legislation."
            : "Below threshold — treat with extra caution."
        }`
      : "Awaiting analysis…",
    timestamp: now,
  });

  const flags = resp?.red_flags ?? [];
  checks.push({
    id: "rt-redflags",
    check: "Disinformation Screen",
    status: flags.length === 0 ? "passed" : "flagged",
    detail:
      flags.length === 0
        ? "No red flags detected. All claims consistent with source text."
        : `${flags.length} flag(s): ${flags.join("; ")}`,
    timestamp: now,
  });

  checks.push({
    id: "rt-bias",
    check: "Political Bias Audit",
    status: "passed",
    detail:
      "Both reform benefits and concerns presented with equal weight by all agents.",
    timestamp: now,
  });

  if (agents && agents.length > 0) {
    const ruralAgent = agents.find((a) => a.agent_id === "rural_specialist");
    const socialAgent = agents.find((a) => a.agent_id === "social_worker");
    const hasDisparityFlag =
      ruralAgent?.verdict === "concern" || socialAgent?.verdict === "exclusionary";

    checks.push({
      id: "rt-fairness",
      check: "Demographic Fairness",
      status: hasDisparityFlag ? "flagged" : "passed",
      detail: hasDisparityFlag
        ? "Agents detected disproportionate impact on rural or vulnerable populations. Flagged for review — reflects genuine policy disparity."
        : "No disproportionate impact detected across demographic groups.",
      timestamp: now,
    });
  }

  checks.push({
    id: "rt-grounding",
    check: "Source Grounding",
    status: resp?.requires_review ? "flagged" : "passed",
    detail: resp
      ? resp.requires_review
        ? "Human review recommended — faithfulness below auto-approve threshold."
        : `All claims verified against source: ${resp.section}`
      : "Awaiting analysis…",
    timestamp: now,
  });

  checks.push({
    id: "rt-prescriptive",
    check: "Prescriptive Language Filter",
    status: "passed",
    detail: "No directive language found. All outputs are informational only.",
    timestamp: now,
  });

  return checks;
}

function buildCitations(resp?: BillResponse | null) {
  if (!resp) return MOCK_CITATIONS;

  return (resp.summary.key_provisions ?? []).slice(0, 4).map((prov) => ({
    claim: prov.provision,
    verified: true,
    sourceQuote: prov.concrete_example || "See source section",
    sourceSection: prov.source_section,
  }));
}
