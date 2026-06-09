import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { useTypewriter } from "@/hooks/useTypewriter";
import { cn, formatConfidence, getAgentColor } from "@/lib/utils";
import type { AgentStreamState } from "@/types/api";

interface AgentThinkingCardProps {
  stream: AgentStreamState;
  className?: string;
}

const AGENT_AVATARS: Record<string, { icon: string; label: string }> = {
  economist: { icon: "📊", label: "Economist" },
  social_worker: { icon: "🤝", label: "Social Advocate" },
  rural_specialist: { icon: "🌾", label: "Rural Specialist" },
  legal_expert: { icon: "⚖️", label: "Legal Expert" },
  citizen: { icon: "👤", label: "Common Citizen" },
};

const STATUS_MESSAGES: Record<string, string[]> = {
  thinking: [
    "Analyzing legislative framework...",
    "Cross-referencing policy data...",
    "Evaluating stakeholder impact...",
    "Synthesizing multi-source evidence...",
  ],
  streaming: ["Composing analysis..."],
};

function ThinkingAnimation() {
  return (
    <div className="flex items-center gap-1.5">
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-blue-400"
          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.2,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

function PresenceIndicator({
  status,
  color,
}: {
  status: string;
  color: string;
}) {
  const isActive = status === "thinking" || status === "streaming";
  return (
    <div className="relative">
      <div
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {isActive && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ backgroundColor: color }}
          animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
        />
      )}
    </div>
  );
}

export function AgentThinkingCard({
  stream,
  className,
}: AgentThinkingCardProps) {
  const { agentId, status, text, result, elapsedMs } = stream;
  const config = AGENT_AVATARS[agentId] ?? { icon: "🤖", label: agentId };
  const agentColor = getAgentColor(agentId);

  const { displayed, isTyping } = useTypewriter({
    text: status === "streaming" || status === "complete" ? text : "",
    speed: 20,
    enabled: status === "streaming",
  });

  const showText = status === "complete" ? text : displayed;
  const statusMsg =
    STATUS_MESSAGES[status]?.[
      Math.floor((elapsedMs / 800) % (STATUS_MESSAGES[status]?.length ?? 1))
    ] ?? "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "glass-panel rounded-xl p-5 flex flex-col gap-3 relative overflow-hidden",
        status === "thinking" && "glow-blue",
        status === "complete" &&
          result?.verdict &&
          ["positive", "protective", "robust", "good_news", "business_friendly"].includes(
            result.verdict
          ) &&
          "glow-emerald",
        status === "complete" &&
          result?.verdict &&
          ["concern", "exclusionary", "legally_risky", "bad_news", "burdensome"].includes(
            result.verdict
          ) &&
          "glow-amber",
        className
      )}
    >
      {/* Agent Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="text-2xl" role="img" aria-label={config.label}>
              {config.icon}
            </span>
            <div className="absolute -bottom-0.5 -right-0.5">
              <PresenceIndicator status={status} color={agentColor} />
            </div>
          </div>
          <div>
            <h3
              className="font-display text-sm font-semibold tracking-tight"
              style={{ color: agentColor }}
            >
              {config.label}
            </h3>
            <p className="text-[11px] text-zinc-500">
              {status === "idle" && "Waiting for instruction..."}
              {status === "thinking" && statusMsg}
              {status === "streaming" && "Composing analysis..."}
              {status === "complete" && `Done in ${(elapsedMs / 1000).toFixed(1)}s`}
              {status === "error" && "Analysis failed"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status === "thinking" && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          )}
          {status === "streaming" && <ThinkingAnimation />}
          {status === "complete" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          )}
          {status === "error" && (
            <AlertTriangle className="h-4 w-4 text-rose-400" />
          )}
        </div>
      </div>

      {/* Confidence Badge */}
      <AnimatePresence>
        {result && status === "complete" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-2 flex-wrap"
          >
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: `color-mix(in srgb, ${agentColor} 15%, transparent)`,
                color: agentColor,
              }}
            >
              {formatConfidence(result.confidence)} Confidence
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                result.verdict === "positive" || result.verdict === "protective" || result.verdict === "robust" || result.verdict === "good_news"
                  ? "bg-emerald-500/10 text-emerald-400"
                  : result.verdict === "concern" || result.verdict === "exclusionary" || result.verdict === "legally_risky" || result.verdict === "bad_news"
                  ? "bg-rose-500/10 text-rose-400"
                  : "bg-amber-500/10 text-amber-400"
              )}
            >
              {result.verdict.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streaming Text / Thinking Skeleton */}
      <div className="min-h-[60px]">
        {status === "thinking" && (
          <div className="space-y-2">
            <div className="shimmer h-4 w-full rounded" />
            <div className="shimmer h-4 w-4/5 rounded" />
            <div className="shimmer h-4 w-3/5 rounded" />
          </div>
        )}

        {(status === "streaming" || status === "complete") && (
          <div>
            <p
              className={cn(
                "text-sm leading-relaxed text-zinc-200",
                isTyping && "typing-cursor"
              )}
            >
              {showText}
            </p>
          </div>
        )}
      </div>

      {/* Detailed Analysis (on complete) */}
      <AnimatePresence>
        {status === "complete" && result && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="space-y-3 overflow-hidden"
          >
            {/* Positives */}
            {(result.positives ?? result.strengths ?? result.who_is_protected ?? result.what_changes_for_me)?.map(
              (item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-emerald-400 text-xs mt-0.5">✓</span>
                  <span className="text-xs text-zinc-300">{item}</span>
                </div>
              )
            )}

            {/* Concerns */}
            {(result.concerns ?? result.gaps ?? result.who_is_excluded)?.map(
              (item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-amber-400 text-xs mt-0.5">⚠</span>
                  <span className="text-xs text-zinc-400">{item}</span>
                </div>
              )
            )}

            {/* Key insights */}
            {result.fiscal_note && (
              <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-3">
                <span className="text-zinc-400 font-medium">Fiscal: </span>
                {result.fiscal_note}
              </p>
            )}
            {result.implementation_gap && (
              <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-3">
                <span className="text-zinc-400 font-medium">Gap: </span>
                {result.implementation_gap}
              </p>
            )}
            {result.constitutional_note && (
              <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-3">
                <span className="text-zinc-400 font-medium">Constitutional: </span>
                {result.constitutional_note}
              </p>
            )}

            {/* Source Attribution */}
            <button className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors group mt-1">
              <ExternalLink className="h-3 w-3 group-hover:text-blue-400" />
              View source section in legislation
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom glow accent */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${agentColor}, transparent)`,
          opacity: status === "thinking" || status === "streaming" ? 0.6 : 0.2,
        }}
      />
    </motion.div>
  );
}
