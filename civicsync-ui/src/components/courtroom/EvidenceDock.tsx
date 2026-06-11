import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookMarked, ChevronDown, ExternalLink, Landmark, Quote } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Precedent } from "@/types/api";

function tierLabel(weight: number): { label: string; cls: string } {
  if (weight >= 0.95) return { label: "Supreme Court", cls: "bg-amber-500/15 text-amber-300" };
  if (weight >= 0.65) return { label: "High Court", cls: "bg-blue-500/15 text-blue-300" };
  if (weight >= 0.45) return { label: "Tribunal", cls: "bg-violet-500/15 text-violet-300" };
  return { label: "District / Other", cls: "bg-zinc-700/40 text-zinc-300" };
}

function PrecedentCard({
  precedent,
  cited,
}: {
  precedent: Precedent;
  cited: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tier = tierLabel(precedent.weight);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 text-left flex items-start gap-2"
      >
        <Landmark className="h-3.5 w-3.5 text-zinc-500 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[12px] font-medium text-zinc-200 leading-snug">{precedent.title}</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span className={cn("text-[9px] font-semibold rounded-full px-1.5 py-0.5", tier.cls)}>
              {tier.label}
            </span>
            {cited && (
              <span className="text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                Cited · grounded
              </span>
            )}
            {precedent.date && (
              <span className="text-[9px] text-zinc-600">{precedent.date}</span>
            )}
          </div>
        </div>
        <ChevronDown
          className={cn("h-3.5 w-3.5 text-zinc-600 transition-transform flex-shrink-0", open && "rotate-180")}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 pt-1 space-y-2">
              <p className="text-[11px] text-zinc-500">{precedent.court}</p>
              {precedent.snippet && (
                <div className="flex gap-1.5">
                  <Quote className="h-3 w-3 text-zinc-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[11px] text-zinc-400 leading-relaxed italic">
                    {precedent.snippet}
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-mono text-zinc-600">docid {precedent.docid}</span>
                {precedent.url && (
                  <a
                    href={precedent.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300"
                  >
                    Open on Indian Kanoon <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function EvidenceDock({
  precedents,
  kanoonLive,
  citedDocids,
  sourceLabel,
  live,
  emptyHint,
}: {
  precedents: Precedent[];
  citedDocids: Set<string>;
  /** Legacy Kanoon pipeline flag */
  kanoonLive?: boolean;
  /** Source-agnostic badge label (e.g. "Elasticsearch · live") */
  sourceLabel?: string;
  /** Whether the source is live (controls badge colour) */
  live?: boolean;
  emptyHint?: string;
}) {
  const isLive = live ?? kanoonLive ?? false;
  const badge = sourceLabel ?? (kanoonLive ? "Indian Kanoon · live" : "Demo corpus");

  return (
    <div className="glass-panel rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
          <BookMarked className="h-3.5 w-3.5" /> Evidence & Precedent Dock
        </p>
        <span
          className={cn(
            "text-[9px] font-semibold rounded-full px-2 py-0.5",
            isLive ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
          )}
        >
          {badge}
        </span>
      </div>

      {precedents.length === 0 ? (
        <p className="text-xs text-zinc-600">{emptyHint ?? "No precedents retrieved yet."}</p>
      ) : (
        <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {precedents.map((p, i) => (
            <PrecedentCard key={p.docid || i} precedent={p} cited={citedDocids.has(p.docid)} />
          ))}
        </div>
      )}

      {kanoonLive === false && sourceLabel === undefined && (
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Set <code className="text-zinc-500">INDIAN_KANOON_API_TOKEN</code> on the backend to pull
          live verdicts. The demo corpus uses paraphrased landmark judgments for simulation only.
        </p>
      )}
    </div>
  );
}
