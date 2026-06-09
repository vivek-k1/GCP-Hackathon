import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Scale, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { JuryVerdict, SideScore } from "@/types/api";

const ACCUSER = "#f43f5e"; // rose / crimson
const DEFENSE = "#3b82f6"; // navy / blue

function lean(verdict: JuryVerdict): number {
  const a = verdict.accuser.s_jury;
  const d = verdict.defense.s_jury;
  const sum = a + d;
  if (sum <= 0) return 0.5;
  return a / sum; // 0 (defense) .. 1 (accuser)
}

function Needle({ value }: { value: number }) {
  // value 0..1 -> angle -90 (defense) .. +90 (accuser)
  const angle = (value - 0.5) * 180;
  return (
    <motion.line
      x1="100"
      y1="100"
      x2="100"
      y2="28"
      stroke="#fafafa"
      strokeWidth="3"
      strokeLinecap="round"
      style={{ transformOrigin: "100px 100px" }}
      initial={false}
      animate={{ rotate: angle }}
      transition={{ type: "spring", stiffness: 60, damping: 12 }}
    />
  );
}

function ComponentRow({
  label,
  weightPct,
  accuser,
  defense,
}: {
  label: string;
  weightPct: number;
  accuser: { score: number; rationale: string };
  defense: { score: number; rationale: string };
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-zinc-300">
          {label}
          <span className="ml-1.5 text-[9px] text-zinc-500">w={weightPct}%</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-8 text-right text-[10px] font-mono" style={{ color: ACCUSER }}>
          {(accuser.score * 100).toFixed(0)}
        </span>
        <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden flex">
          <div
            className="h-full rounded-l-full"
            style={{ width: `${accuser.score * 50}%`, background: ACCUSER }}
          />
          <div className="flex-1" />
          <div
            className="h-full rounded-r-full"
            style={{ width: `${defense.score * 50}%`, background: DEFENSE }}
          />
        </div>
        <span className="w-8 text-[10px] font-mono" style={{ color: DEFENSE }}>
          {(defense.score * 100).toFixed(0)}
        </span>
      </div>
    </div>
  );
}

function SideColumn({ title, color, score }: { title: string; color: string; score: SideScore }) {
  return (
    <div className="flex-1 space-y-1">
      <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>
        {title}
      </p>
      <p className="text-2xl font-bold font-display" style={{ color }}>
        {(score.s_jury * 100).toFixed(0)}
        <span className="text-xs text-zinc-500 font-normal">/100</span>
      </p>
    </div>
  );
}

export function JuryGauge({ verdict }: { verdict: JuryVerdict | null }) {
  const [open, setOpen] = useState(false);

  if (!verdict) {
    return (
      <div className="glass-panel rounded-xl p-5 text-center">
        <Scale className="h-6 w-6 text-zinc-600 mx-auto mb-2" />
        <p className="text-xs text-zinc-500">
          The jury gauge activates after the first argument is delivered.
        </p>
      </div>
    );
  }

  const l = lean(verdict);
  const leaningLabel =
    verdict.leaning === "accuser"
      ? "Leaning Prosecution"
      : verdict.leaning === "defense"
        ? "Leaning Defence"
        : "Finely balanced";
  const leaningColor =
    verdict.leaning === "accuser" ? ACCUSER : verdict.leaning === "defense" ? DEFENSE : "#a1a1aa";

  return (
    <div className="glass-panel-strong rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full p-5 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
            <Scale className="h-3.5 w-3.5" /> Jury Propensity · S<sub>jury</sub>
          </p>
          <ChevronDown
            className={cn("h-4 w-4 text-zinc-500 transition-transform", open && "rotate-180")}
          />
        </div>

        <div className="relative flex justify-center">
          <svg viewBox="0 0 200 112" className="w-full max-w-[260px]">
            {/* defence half */}
            <path d="M 12 100 A 88 88 0 0 1 100 12" fill="none" stroke={DEFENSE} strokeWidth="10" strokeOpacity="0.35" strokeLinecap="round" />
            {/* accuser half */}
            <path d="M 100 12 A 88 88 0 0 1 188 100" fill="none" stroke={ACCUSER} strokeWidth="10" strokeOpacity="0.35" strokeLinecap="round" />
            <Needle value={l} />
            <circle cx="100" cy="100" r="6" fill="#fafafa" />
          </svg>
        </div>

        <p
          className="text-center text-sm font-semibold mt-1"
          style={{ color: leaningColor }}
        >
          {leaningLabel}
        </p>

        <div className="flex items-center gap-4 mt-3">
          <SideColumn title="Prosecution" color={ACCUSER} score={verdict.accuser} />
          <div className="h-10 w-px bg-zinc-800" />
          <SideColumn title="Defence" color={DEFENSE} score={verdict.defense} />
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-zinc-800/60"
          >
            <div className="p-5 space-y-4">
              <p className="text-[11px] text-zinc-400 leading-relaxed">{verdict.rationale}</p>

              <div className="space-y-3">
                <ComponentRow
                  label="Statutory alignment"
                  weightPct={Math.round(verdict.weights.statute * 100)}
                  accuser={verdict.accuser.statute}
                  defense={verdict.defense.statute}
                />
                <ComponentRow
                  label="Precedent strength"
                  weightPct={Math.round(verdict.weights.precedent * 100)}
                  accuser={verdict.accuser.precedent}
                  defense={verdict.defense.precedent}
                />
                <ComponentRow
                  label="Factual grounding"
                  weightPct={Math.round(verdict.weights.factual * 100)}
                  accuser={verdict.accuser.factual}
                  defense={verdict.defense.factual}
                />
              </div>

              <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-3">
                <p className="text-[9px] uppercase tracking-wider text-zinc-500 mb-1 font-mono">
                  Scoring formula
                </p>
                <p className="text-[10px] font-mono text-zinc-400">
                  S<sub>jury</sub> = 0.4·P<sub>statute</sub> + 0.4·P<sub>precedent</sub> + 0.2·P
                  <sub>factual</sub>
                </p>
              </div>

              {verdict.hallucination_flags.length > 0 ? (
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 space-y-1">
                  <p className="text-[10px] uppercase tracking-wider text-rose-300 font-semibold">
                    Anti-hallucination flags
                  </p>
                  {verdict.hallucination_flags.map((f, i) => (
                    <p key={i} className="text-[11px] text-rose-200/90">
                      • {f}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  No unsupported citations detected this round.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
