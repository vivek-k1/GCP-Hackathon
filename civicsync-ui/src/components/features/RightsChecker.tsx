import { useState } from "react";
import { motion } from "framer-motion";
import { Scale, Loader2, AlertCircle, CheckCircle2, BookOpen } from "lucide-react";
import { checkRights } from "@/lib/api";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "My employer fired me without giving me one month's notice",
  "A food delivery app shared my location with advertisers without permission",
  "My landlord wants to evict me even though I paid all my rent",
  "The telecom company disconnected my SIM without warning",
];

interface RightItem {
  right?: string;
  what_this_means?: string;
  summary?: string;
  source_section?: string;
  source_quote?: string;
  grounded?: boolean;
  [key: string]: unknown;
}

export function RightsChecker() {
  const [situation, setSituation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  const run = async () => {
    if (!situation.trim()) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await checkRights(situation.trim());
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const rights = (data?.your_rights as RightItem[] | undefined) ?? [];
  const duties = (data?.your_duties as RightItem[] | undefined) ?? [];
  const billsSearched = (data?.bills_searched as string[] | undefined) ?? [];
  const ground = data?.grounding_summary as Record<string, number> | undefined;
  const silent = data?.what_law_does_not_cover as string | undefined;
  const disclaimer =
    (data?.disclaimer as string) ||
    "This is information only, not legal advice. Verify with official text.";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <Scale className="h-5 w-5 text-cyan-400" />
          Rights Checker
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Describe your situation in plain language — we retrieve relevant sections and list
          source-grounded rights.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
        <strong className="text-amber-100">Information notice</strong> — not legal advice.
        AI output must be checked against the official Gazette. For urgent legal matters, consult
        a qualified advocate.
      </div>

      <div className="glass-panel rounded-xl p-4 space-y-2 border-l-2 border-blue-500/50">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
          How it works
        </p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          We match your situation to applicable central acts, retrieve the most relevant sections
          (BM25 + optional dense search), and ask the model to extract rights with mandatory
          short quotes. Each quote is checked against the retrieved text before display.
        </p>
      </div>

      <div className="glass-panel rounded-xl p-4 space-y-3">
        <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block">
          Your situation
        </label>
        <textarea
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          rows={5}
          placeholder="e.g. My employer has not paid salary for two months and terminated me without notice."
          className="w-full rounded-lg bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-cyan-500/40 min-h-[120px]"
        />
        <p className="text-[10px] text-zinc-600">Try these situations:</p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSituation(s)}
              className="text-left text-[11px] rounded-full px-3 py-1.5 bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:border-cyan-500/30 hover:text-zinc-200 transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || !situation.trim()}
          className={cn(
            "w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-all",
            loading || !situation.trim()
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-white text-zinc-900 hover:bg-zinc-200"
          )}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Check my rights
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {data && (data.error as string | undefined) && !rights.length && (
        <div className="text-sm text-amber-400">{String(data.error)}</div>
      )}

      {data && billsSearched.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <BookOpen className="h-3.5 w-3.5" />
          <span>
            <span className="text-zinc-400">Bills searched:</span> {billsSearched.join(" · ")}
          </span>
        </div>
      )}

      {ground && (
        <p className="text-xs text-zinc-500">
          Grounding: {ground.grounded_rights ?? 0} / {ground.total_rights ?? 0} rights verified
          against source text
        </p>
      )}

      {rights.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <h3 className="text-sm font-semibold text-zinc-200">Your rights</h3>
          {rights.map((r, i) => (
            <div key={i} className="glass-panel-strong rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm text-zinc-100 font-medium">
                  {String(r.right ?? (r.title as string | undefined) ?? "Right")}
                </p>
                {r.grounded !== undefined && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-2 py-0.5",
                      r.grounded ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-300"
                    )}
                  >
                    {r.grounded ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                    {r.grounded ? "Quote verified" : "Verify quote"}
                  </span>
                )}
              </div>
              {r.what_this_means != null && String(r.what_this_means).length > 0 && (
                <p className="text-xs text-zinc-300 leading-relaxed">{String(r.what_this_means)}</p>
              )}
              {r.summary != null && !r.what_this_means && (
                <p className="text-xs text-zinc-400 leading-relaxed">{String(r.summary)}</p>
              )}
              {r.source_section && (
                <p className="text-[10px] text-cyan-500/90">{r.source_section}</p>
              )}
              {r.source_quote && (
                <blockquote className="text-xs text-zinc-500 border-l-2 border-zinc-600 pl-3 italic">
                  “{String(r.source_quote)}”
                </blockquote>
              )}
            </div>
          ))}
        </motion.div>
      )}

      {duties.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-zinc-200">Your duties</h3>
          {duties.map((d, i) => (
            <div key={i} className="glass-panel rounded-lg p-3 text-xs text-zinc-400">
              {d.summary || JSON.stringify(d)}
            </div>
          ))}
        </div>
      )}

      {silent && (
        <p className="text-xs text-zinc-500 border border-zinc-800 rounded-lg p-3">
          {silent}
        </p>
      )}

      {data && (
        <p className="text-[10px] text-zinc-600 max-w-prose leading-relaxed">{disclaimer}</p>
      )}
    </div>
  );
}
