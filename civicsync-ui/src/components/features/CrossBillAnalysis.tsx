import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitBranch, Loader2, AlertCircle } from "lucide-react";
import { detectConflicts, fetchBills } from "@/lib/api";
import type { BillInfo } from "@/types/api";
import { cn } from "@/lib/utils";

const SUGGESTIONS: { a: string; b: string; topic: string; label: string }[] = [
  { a: "dpdp", b: "telecom", topic: "data sharing and subscriber privacy", label: "DPDP vs Telecommunications — data & privacy" },
  { a: "social_security", b: "dpdp", topic: "platform workers and data", label: "Code on Social Security vs DPDP — platform workers" },
  { a: "bns", b: "telecom", topic: "offences involving telecom networks", label: "BNS vs Telecommunications" },
];

export function CrossBillAnalysis() {
  const [bills, setBills] = useState<Record<string, BillInfo>>({});
  const [billA, setBillA] = useState("");
  const [billB, setBillB] = useState("");
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    fetchBills()
      .then((b) => {
        setBills(b);
        const keys = Object.keys(b);
        if (keys.length >= 2) {
          setBillA((prev) => prev || keys[0]);
          setBillB((prev) => prev || keys[1]);
        } else if (keys.length === 1) {
          setBillA(keys[0]);
        }
      })
      .catch(() => {});
  }, []);

  const run = async () => {
    if (!billA || !billB) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const r = await detectConflicts({ bill_a: billA, bill_b: billB, topic: topic.trim() });
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  };

  const conflicts = (data?.conflicts as Record<string, unknown>[] | undefined) ?? [];
  const overlaps = (data?.overlaps as Record<string, unknown>[] | undefined) ?? [];
  const gaps = (data?.gaps as (string | Record<string, unknown>)[] | undefined) ?? [];
  const gsum = data?.grounding_summary as { total?: number; grounded?: number; ungrounded?: number } | undefined;
  const bNameA = (data?.bill_a_name as string) ?? billA;
  const bNameB = (data?.bill_b_name as string) ?? billB;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-purple-400" />
          Cross-bill analysis
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Compare two loaded acts on a topic — conflicts, overlaps, and source-verified quotes.
        </p>
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
        <strong className="text-amber-100">Information notice</strong> — not legal advice. Always
        verify with Gazette text; overlaps may still require judicial interpretation.
      </div>

      <div className="glass-panel rounded-xl p-4 space-y-2 border-l-2 border-purple-500/40">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">How it works</p>
        <p className="text-xs text-zinc-400 leading-relaxed">
          We retrieve top sections from each act for your topic, then ask the model to surface
          genuine tensions and duplications. Each quoted line is checked against the retrieved
          chunk text.
        </p>
      </div>

      <div className="glass-panel rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              Bill A
            </label>
            <select
              value={billA}
              onChange={(e) => setBillA(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2.5"
            >
              {Object.entries(bills).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.display_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
              Bill B
            </label>
            <select
              value={billB}
              onChange={(e) => setBillB(e.target.value)}
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2.5"
            >
              {Object.entries(bills).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.display_name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
            Topic
          </label>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. data sharing · worker rights · definitions of personal data"
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              type="button"
              onClick={() => {
                setBillA(s.a);
                setBillB(s.b);
                setTopic(s.topic);
              }}
              className="text-[11px] rounded-full px-3 py-1.5 bg-zinc-800/80 text-zinc-400 border border-zinc-700 hover:border-purple-500/30"
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={run}
          disabled={loading || billA === billB || !billA || !billB}
          className={cn(
            "w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold",
            loading || billA === billB
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-white text-zinc-900 hover:bg-zinc-200"
          )}
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Detect conflicts & overlaps
        </button>
        {billA && billB && billA === billB && (
          <p className="text-xs text-rose-400">Choose two different bills.</p>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {data && (data.error as string | undefined) && !conflicts.length && !overlaps.length && (
        <p className="text-sm text-amber-300">{String(data.error)}</p>
      )}

      {data && gsum && typeof gsum.total === "number" && (
        <p className="text-xs text-zinc-500">
          Quote checks: {gsum.grounded ?? 0} / {gsum.total} conflict rows fully grounded
        </p>
      )}

      {data && (conflicts.length > 0 || overlaps.length > 0 || gaps.length > 0) && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <p className="text-xs text-zinc-500">
            <span className="text-zinc-300">{bNameA}</span>
            <span className="mx-2">vs</span>
            <span className="text-zinc-300">{bNameB}</span>
          </p>
          {conflicts.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-rose-300/90 mb-2">Conflicts & tensions</h3>
              <ul className="space-y-3">
                {conflicts.map((c, i) => (
                  <li key={i} className="glass-panel rounded-lg p-3 text-xs text-zinc-300 space-y-2">
                    <p className="font-medium text-zinc-100">
                      {String(c.title ?? "Conflict")}
                    </p>
                    {c.plain_english != null && c.plain_english !== undefined && (
                      <p className="text-zinc-400 leading-relaxed">{String(c.plain_english)}</p>
                    )}
                    {c.bill_a_quote != null && (
                      <p className="text-zinc-500 border-l-2 border-rose-500/40 pl-2">
                        {bNameA}: {String(c.bill_a_quote)}
                      </p>
                    )}
                    {c.bill_b_quote != null && (
                      <p className="text-zinc-500 border-l-2 border-blue-500/30 pl-2">
                        {bNameB}: {String(c.bill_b_quote)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {overlaps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-emerald-300/90 mb-2">Overlaps & alignment</h3>
              <ul className="space-y-2">
                {overlaps.map((o, i) => (
                  <li key={i} className="glass-panel rounded-lg p-3 text-xs text-zinc-300 space-y-1">
                    {o.title != null && o.title !== "" && (
                      <p className="font-medium text-emerald-200/90">{String(o.title)}</p>
                    )}
                    {o.plain_english != null && (
                      <p className="text-zinc-400">{String(o.plain_english)}</p>
                    )}
                    {!o.title && !o.plain_english && (
                      <span>{String(o.description ?? o.summary ?? JSON.stringify(o))}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-amber-300/90 mb-2">Gaps in coverage</h3>
              <ul className="list-disc pl-4 space-y-1 text-xs text-zinc-400">
                {gaps.map((g, i) => (
                  <li key={i}>{typeof g === "string" ? g : JSON.stringify(g)}</li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
