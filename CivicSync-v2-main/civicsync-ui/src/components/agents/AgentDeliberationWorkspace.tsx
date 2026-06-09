import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Play,
  RotateCcw,
  Zap,
  AlertCircle,
  Search,
  Sparkles,
} from "lucide-react";
import { AgentThinkingCard } from "./AgentThinkingCard";
import { BillUploadZone } from "./BillUploadZone";
import { useAgentStream } from "@/hooks/useAgentStream";
import { fetchBills } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { BillInfo, OverallStructured } from "@/types/api";

function StructuredOverallAnswer({
  structured,
  queryLabel,
  personaLabel,
}: {
  structured: OverallStructured;
  queryLabel: string;
  personaLabel: string;
}) {
  const outlook = structured.outlook?.trim();

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="h-4 w-4 text-emerald-300" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-display text-sm font-semibold text-zinc-100">
            Your answer
          </h3>
          <p className="text-[11px] text-zinc-500 leading-relaxed">
            <span className="text-zinc-400">Question:</span>{" "}
            <span className="text-zinc-300">{queryLabel || "—"}</span>
            <span className="mx-1.5 text-zinc-600">·</span>
            <span className="text-zinc-400">Reader:</span>{" "}
            <span className="text-zinc-300">{personaLabel}</span>
          </p>
        </div>
      </div>

      <div className="border-t border-zinc-800/80 pt-4 space-y-5">
        <h4 className="font-display text-base font-bold text-zinc-100 leading-snug tracking-tight">
          {structured.title}
        </h4>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/90 mb-1.5">
            Direct answer
          </p>
          <p className="text-sm text-zinc-200 leading-relaxed">{structured.takeaway}</p>
        </div>

        {structured.sections.map((sec, i) => (
          <section key={i} className="space-y-2">
            <h5 className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
              {sec.title}
            </h5>
            {sec.body?.trim() ? (
              <p className="text-sm text-zinc-300 leading-relaxed">{sec.body.trim()}</p>
            ) : null}
            {sec.bullets && sec.bullets.length > 0 ? (
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-zinc-300 leading-relaxed marker:text-zinc-600">
                {sec.bullets
                  .map((b) => String(b).trim())
                  .filter(Boolean)
                  .map((line, j) => (
                    <li key={j}>{line}</li>
                  ))}
              </ul>
            ) : null}
          </section>
        ))}

        {outlook ? (
          <div className="rounded-lg border border-zinc-700/60 bg-zinc-900/40 px-3 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">
              What to keep in mind
            </p>
            <p className="text-xs text-zinc-400 leading-relaxed">{outlook}</p>
          </div>
        ) : null}
      </div>
    </>
  );
}

const READER_PERSONAS: { value: string; label: string }[] = [
  { value: "", label: "From your question only" },
  { value: "General User", label: "General user" },
  { value: "Student", label: "Student" },
  { value: "Gig Worker", label: "Gig worker" },
  { value: "Farmer", label: "Farmer" },
  { value: "Small Business Owner", label: "Small business" },
  { value: "Tenant", label: "Tenant" },
];

interface AgentDeliberationWorkspaceProps {
  className?: string;
  onSummaryReady?: (summary: unknown, agents: unknown[]) => void;
}

export function AgentDeliberationWorkspace({
  className,
  onSummaryReady,
}: AgentDeliberationWorkspaceProps) {
  const { agents, isRunning, summary, overallPayload, error, startDeliberation, reset } =
    useAgentStream();

  const [bills, setBills] = useState<Record<string, BillInfo>>({});
  const [selectedBill, setSelectedBill] = useState("");
  const [query, setQuery] = useState("");
  const [readerPersona, setReaderPersona] = useState("");
  const [billError, setBillError] = useState<string | null>(null);

  useEffect(() => {
    fetchBills()
      .then((data) => {
        setBills(data);
        const keys = Object.keys(data);
        if (keys.length > 0 && !selectedBill) {
          setSelectedBill(keys[0]);
        }
      })
      .catch((err) => setBillError(err.message));
  }, []);

  const handleBillsUpdated = useCallback(
    (next: Record<string, BillInfo>, selectKey?: string) => {
      setBills(next);
      setBillError(null);
      if (selectKey !== undefined) {
        if (selectKey && next[selectKey]) {
          setSelectedBill(selectKey);
        } else {
          const keys = Object.keys(next);
          setSelectedBill(keys[0] ?? "");
        }
      }
    },
    []
  );

  useEffect(() => {
    if (summary && !isRunning && onSummaryReady) {
      onSummaryReady(
        summary,
        agents.filter((a) => a.result).map((a) => a.result)
      );
    }
  }, [summary, isRunning]);

  const completedCount = agents.filter((a) => a.status === "complete").length;
  const totalAgents = agents.length;
  const personaLabel =
    READER_PERSONAS.find((o) => o.value === readerPersona)?.label ??
    (readerPersona.trim() || "From your question only");

  const handleStart = () => {
    if (!selectedBill || !query.trim()) return;
    const p = readerPersona.trim();
    startDeliberation(selectedBill, query.trim(), p || undefined);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100">
          Agent Deliberation Workspace
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Your question and optional reader persona steer Sonnet + all five agents (not just search).
        </p>
      </div>

      {/* Legislation, query, upload (Streamlit-style) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 glass-panel rounded-xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {/* Bill dropdown */}
          <div className="md:col-span-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              Legislation
            </label>
            <select
              value={selectedBill}
              onChange={(e) => setSelectedBill(e.target.value)}
              disabled={isRunning}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2.5 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
            >
              {billError ? (
                <option>Failed to load bills</option>
              ) : Object.keys(bills).length === 0 ? (
                <option>Loading…</option>
              ) : (
                Object.entries(bills).map(([key, info]) => (
                  <option key={key} value={key}>
                    {info.display_name} ({info.num_sections} sections)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="md:col-span-1">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              Reader persona
            </label>
            <select
              value={readerPersona}
              onChange={(e) => setReaderPersona(e.target.value)}
              disabled={isRunning}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2.5 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
            >
              {READER_PERSONAS.map((o) => (
                <option key={o.value || "default"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Query input */}
          <div className="md:col-span-2">
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              Your question
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
                placeholder="e.g. Impact on students, consent for campus apps"
                disabled={isRunning}
                className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs pl-9 pr-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-blue-500/50 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="md:col-span-1 flex items-end gap-2">
            <button
              onClick={handleStart}
              disabled={isRunning || !selectedBill || !query.trim()}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold transition-all",
                isRunning || !query.trim()
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-white text-zinc-900 hover:bg-zinc-200 shadow-lg shadow-white/10"
              )}
            >
              <Play className="h-3 w-3" />
              Simulate
            </button>
            {completedCount > 0 && !isRunning && (
              <button
                onClick={reset}
                className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-all"
              >
                <RotateCcw className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        </div>

        <div className="glass-panel rounded-xl p-4 flex flex-col">
          <BillUploadZone
            disabled={isRunning}
            bills={bills}
            onBillsUpdated={handleBillsUpdated}
          />
          <div className="mt-4 pt-3 border-t border-zinc-800/80 text-[10px] text-zinc-500 space-y-1">
            <p>
              Bills loaded:{" "}
              <span className="text-zinc-300 font-medium">{Object.keys(bills).length}</span>
            </p>
            {selectedBill && bills[selectedBill] && (
              <>
                <p>
                  Sections:{" "}
                  <span className="text-zinc-300 font-medium">
                    {bills[selectedBill].num_sections}
                  </span>
                </p>
                <p>
                  Type:{" "}
                  <span className="text-zinc-300 font-medium">
                    {bills[selectedBill].uploaded
                      ? "Uploaded"
                      : (bills[selectedBill].tag ?? "Central")}
                  </span>
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-xs text-rose-400">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Progress Bar */}
      {isRunning && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-blue-400">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Zap className="h-3 w-3" />
              </motion.div>
              <span>
                {completedCount}/{totalAgents} agents complete
              </span>
            </div>
          </div>
          <div className="h-1 rounded-full bg-zinc-800 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500"
              initial={{ width: "0%" }}
              animate={{ width: `${(completedCount / totalAgents) * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
        </div>
      )}

      {/* Multi-column Agent Grid */}
      {agents.some((a) => a.status !== "idle") && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {agents.map((stream) => (
            <AgentThinkingCard key={stream.agentId} stream={stream} />
          ))}
        </div>
      )}

      {/* Synthesis wait — all agents done, final answer still generating */}
      {completedCount === totalAgents &&
        totalAgents > 0 &&
        isRunning &&
        !overallPayload && (
          <div className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-900/40 px-4 py-4 text-xs text-zinc-400">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            >
              <Sparkles className="h-4 w-4 text-amber-400/90" />
            </motion.div>
            <p>
              Composing your overall answer from all five perspectives (this may
              take a few seconds)…
            </p>
          </div>
        )}

      {/* Persona-tailored overall answer — after agent cards */}
      {overallPayload && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="glass-panel-strong rounded-xl p-5 space-y-4 border border-emerald-500/15"
        >
          {overallPayload.structured ? (
            <StructuredOverallAnswer
              structured={overallPayload.structured}
              queryLabel={query.trim() || "—"}
              personaLabel={personaLabel}
            />
          ) : (
            <>
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500/30 to-cyan-500/20 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-emerald-300" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-display text-sm font-semibold text-zinc-100">
                    Your answer
                  </h3>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    <span className="text-zinc-400">Question:</span>{" "}
                    <span className="text-zinc-300">{query.trim() || "—"}</span>
                    <span className="mx-1.5 text-zinc-600">·</span>
                    <span className="text-zinc-400">Reader:</span>{" "}
                    <span className="text-zinc-300">{personaLabel}</span>
                  </p>
                </div>
              </div>
              <div className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap border-t border-zinc-800/80 pt-4">
                {overallPayload.text ?? ""}
              </div>
            </>
          )}
        </motion.div>
      )}

      {/* Compact snapshot + expert verdict tags after a full run */}
      {completedCount === totalAgents && completedCount > 0 && !isRunning && summary && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="glass-panel rounded-xl p-5 space-y-3"
        >
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded-full bg-gradient-to-br from-blue-500/80 to-purple-500/50 flex items-center justify-center">
              <span className="text-xs">🎯</span>
            </div>
            <h3 className="font-display text-sm font-semibold text-zinc-100">
              Bill snapshot
            </h3>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-zinc-200 font-medium leading-relaxed">
              {summary.tl_dr}
            </p>
            {summary.purpose && (
              <p className="text-xs text-zinc-500 leading-relaxed">
                {summary.purpose}
              </p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap pt-1">
            {agents
              .filter((a) => a.result)
              .map((a) => (
                <span
                  key={a.agentId}
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                    a.result?.verdict === "positive" ||
                      a.result?.verdict === "protective" ||
                      a.result?.verdict === "good_news" ||
                      a.result?.verdict === "robust" ||
                      a.result?.verdict === "business_friendly"
                      ? "bg-emerald-500/10 text-emerald-400"
                      : a.result?.verdict === "concern" ||
                        a.result?.verdict === "exclusionary" ||
                        a.result?.verdict === "bad_news" ||
                        a.result?.verdict === "legally_risky" ||
                        a.result?.verdict === "burdensome"
                      ? "bg-rose-500/10 text-rose-400"
                      : "bg-amber-500/10 text-amber-400"
                  )}
                >
                  {a.result?.agent_label}: {a.result?.verdict?.replace(/_/g, " ")}
                </span>
              ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}
