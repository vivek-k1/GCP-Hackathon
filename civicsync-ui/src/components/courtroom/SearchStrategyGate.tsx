import { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { CodeTerminal } from "./CodeTerminal";
import type { CourtroomPlan } from "@/types/api";

export function SearchStrategyGate({
  plan,
  busy,
  onApprove,
}: {
  plan: CourtroomPlan;
  busy: boolean;
  onApprove: (queryDsl: Record<string, unknown>, index: string, runEsql: boolean) => void;
}) {
  const [index, setIndex] = useState(plan.target_index);
  const [dslText, setDslText] = useState(JSON.stringify(plan.query_dsl, null, 2));
  const [runEsql, setRunEsql] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  const approve = () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(dslText);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : "Invalid JSON");
      return;
    }
    onApprove(parsed, index.trim() || plan.target_index, runEsql);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
        <p className="text-xs font-semibold text-amber-200 flex items-center gap-1.5">
          <ShieldCheck className="h-4 w-4" /> Human-in-the-loop checkpoint
        </p>
        <p className="text-[11px] text-amber-200/80 mt-1 leading-relaxed">
          Gemini 3 compiled this Elasticsearch search strategy from your facts. Review and edit it,
          then explicitly approve before any tool call runs against the live cluster.
        </p>
      </div>

      <div className="glass-panel rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <p className="text-sm font-semibold text-zinc-200">Compiled search plan</p>
          <span className="ml-auto text-[10px] rounded-full px-2 py-0.5 bg-violet-500/15 text-violet-300 font-semibold">
            {plan.domain}
          </span>
        </div>

        {plan.search_rationale && (
          <p className="text-[11px] text-zinc-400 leading-relaxed">{plan.search_rationale}</p>
        )}

        {plan.legal_entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {plan.legal_entities.map((e, i) => (
              <span
                key={i}
                className="text-[10px] rounded-full px-2 py-0.5 bg-zinc-800/80 text-zinc-400 border border-zinc-700"
              >
                {e}
              </span>
            ))}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
            Target index / pattern
          </label>
          <input
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            disabled={busy}
            className="w-full rounded-lg bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-sm px-3 py-2 font-mono placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
            Elasticsearch Query DSL (editable)
          </label>
          <textarea
            value={dslText}
            onChange={(e) => setDslText(e.target.value)}
            disabled={busy}
            spellCheck={false}
            rows={12}
            className="w-full rounded-lg bg-[#0c0c0f] border border-zinc-800 text-emerald-200/90 text-[11px] px-3 py-2.5 font-mono focus:outline-none focus:border-emerald-500/40 resize-y"
          />
          {jsonError && (
            <p className="text-[11px] text-rose-300 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {jsonError}
            </p>
          )}
        </div>

        {plan.esql && <CodeTerminal title="ES|QL (analytical)" code={plan.esql} language="esql" />}

        <label className="flex items-center gap-2 text-[11px] text-zinc-400 cursor-pointer">
          <input
            type="checkbox"
            checked={runEsql}
            onChange={(e) => setRunEsql(e.target.checked)}
            disabled={busy}
            className="accent-emerald-500"
          />
          Also run the ES|QL analytical pass
        </label>

        <button
          onClick={approve}
          disabled={busy}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all",
            busy
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-emerald-400 text-zinc-950 hover:bg-emerald-300"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          {busy ? "Executing on live cluster…" : "Review & Approve Search Strategy"}
        </button>
      </div>
    </motion.div>
  );
}
