import { useState } from "react";
import { motion } from "framer-motion";
import { Gavel, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CourtroomPhase } from "@/hooks/useCourtroom";

const SAMPLE_CASES = [
  "My landlord is trying to evict me from my Mumbai flat with only 3 days notice, even though I have paid rent on time for 5 years. He says he wants the flat for his son.",
  "My employer terminated me without notice or severance after I reported unsafe working conditions. I had worked there for 4 years on a permanent contract.",
  "A ride-hailing app shared my phone number and live location with third-party advertisers without my consent. I never agreed to this in their privacy policy.",
  "I bought a refrigerator that caught fire within a week due to a manufacturing defect, damaging my kitchen. The company refuses to compensate me.",
];

const PHASE_LABEL: Record<CourtroomPhase, string> = {
  intake: "",
  analyzing: "Senior Counsel is reading your case & spotting legal issues…",
  retrieving: "Retriever Agent is pulling precedents from Indian Kanoon…",
  ready: "",
  simulating: "",
};

export function CaseIntake({
  phase,
  busy,
  onStart,
}: {
  phase: CourtroomPhase;
  busy: boolean;
  onStart: (facts: string) => void;
}) {
  const [facts, setFacts] = useState("");

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 mx-auto">
          <Gavel className="h-7 w-7 text-amber-400" />
        </div>
        <h2 className="font-display text-2xl font-bold tracking-tight text-zinc-100">
          Courtroom Simulator
        </h2>
        <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed">
          Describe your dispute. A senior advocate classifies it, real precedents are
          retrieved from Indian Kanoon, and two AI attorneys battle it out before a
          quantitative jury — so you can test your argument before you ever step into a court.
        </p>
      </div>

      <div className="glass-panel rounded-xl p-5 space-y-4">
        <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">
          Your case facts
        </label>
        <textarea
          value={facts}
          onChange={(e) => setFacts(e.target.value)}
          rows={6}
          placeholder="Describe what happened, who is involved, and what you want — in plain language."
          className="w-full rounded-lg bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/40 min-h-[140px]"
          disabled={busy}
        />

        <div className="space-y-2">
          <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Try a scenario</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {SAMPLE_CASES.map((s, i) => (
              <button
                key={i}
                type="button"
                disabled={busy}
                onClick={() => setFacts(s)}
                className="text-left text-[11px] leading-snug rounded-lg px-3 py-2 bg-zinc-800/60 text-zinc-400 border border-zinc-700/70 hover:border-amber-500/30 hover:text-zinc-200 transition-colors disabled:opacity-50"
              >
                {s.length > 110 ? `${s.slice(0, 110)}…` : s}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={() => facts.trim().length >= 30 && onStart(facts.trim())}
          disabled={busy || facts.trim().length < 30}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all",
            busy || facts.trim().length < 30
              ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
              : "bg-amber-400 text-zinc-950 hover:bg-amber-300"
          )}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Preparing courtroom…" : "Convene the court"}
        </button>

        {busy && PHASE_LABEL[phase] && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-xs text-amber-300/90 text-center"
          >
            {PHASE_LABEL[phase]}
          </motion.p>
        )}
      </div>

      <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
        <strong className="text-amber-100">Educational simulation</strong> — this is procedural
        preparation, not legal advice or representation. Verify every citation and consult a
        qualified advocate for any real matter.
      </div>
    </div>
  );
}
