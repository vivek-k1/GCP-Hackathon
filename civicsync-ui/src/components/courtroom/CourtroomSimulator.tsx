import { useMemo } from "react";
import { AlertCircle, FileText, RotateCcw, Scale, Sparkles } from "lucide-react";
import { useCourtroom } from "@/hooks/useCourtroom";
import { CaseIntake } from "./CaseIntake";
import { JuryGauge } from "./JuryGauge";
import { EvidenceDock } from "./EvidenceDock";
import { TranscriptFeed } from "./TranscriptFeed";
import { ArgumentPortal } from "./ArgumentPortal";

const DOMAIN_CLASS: Record<string, string> = {
  Criminal: "bg-rose-500/15 text-rose-300",
  Civil: "bg-blue-500/15 text-blue-300",
  Consumer: "bg-emerald-500/15 text-emerald-300",
  Labor: "bg-amber-500/15 text-amber-300",
  Constitutional: "bg-violet-500/15 text-violet-300",
  Other: "bg-zinc-700/40 text-zinc-300",
};

export function CourtroomSimulator() {
  const court = useCourtroom();
  const {
    phase,
    analysis,
    precedents,
    kanoonLive,
    transcript,
    streaming,
    verdict,
    error,
    busy,
    startCase,
    simulateTurn,
    reset,
    sessionId,
  } = court;

  const citedDocids = useMemo(() => {
    const s = new Set<string>();
    for (const t of transcript) {
      for (const c of t.citations || []) {
        if (c.docid && c.grounded) s.add(c.docid);
      }
    }
    return s;
  }, [transcript]);

  const showIntake = !sessionId && phase !== "analyzing" && phase !== "retrieving";

  if (showIntake) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300 max-w-3xl mx-auto">
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        <CaseIntake phase={phase} busy={busy} onStart={startCase} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-amber-400" />
          <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100">
            Courtroom in Session
          </h2>
          {analysis && (
            <span
              className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${
                DOMAIN_CLASS[analysis.domain] ?? DOMAIN_CLASS.Other
              }`}
            >
              {analysis.domain}
            </span>
          )}
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 border border-zinc-700 hover:border-zinc-600 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" /> New case
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
          {error}
        </div>
      )}

      {(phase === "analyzing" || phase === "retrieving") && (
        <div className="flex items-center gap-2 text-xs text-amber-300/90">
          <Sparkles className="h-3.5 w-3.5 animate-pulse" />
          {phase === "analyzing"
            ? "Senior counsel is spotting legal issues…"
            : "Retriever agent is pulling precedents from Indian Kanoon…"}
        </div>
      )}

      <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4 items-start">
        {/* Left: case details, jury, precedents */}
        <div className="space-y-4">
          <JuryGauge verdict={verdict} />

          {analysis && (
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Case brief
              </p>
              <p className="text-xs text-zinc-300 leading-relaxed">{analysis.summary}</p>

              {analysis.governing_acts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {analysis.governing_acts.map((a, i) => (
                    <span
                      key={i}
                      className="text-[10px] rounded-full px-2 py-0.5 bg-zinc-800/80 text-zinc-400 border border-zinc-700"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}

              {analysis.issues.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider">Issues spotted</p>
                  {analysis.issues.map((iss, i) => (
                    <div key={i} className="text-[11px] text-zinc-400 flex gap-1.5">
                      <span className="text-amber-500/70 font-mono">{i + 1}.</span>
                      <span>
                        {iss.issue}
                        {iss.governing_law ? (
                          <span className="text-zinc-600"> — {iss.governing_law}</span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <EvidenceDock
            precedents={precedents}
            kanoonLive={kanoonLive}
            citedDocids={citedDocids}
          />
        </div>

        {/* Right: live courtroom */}
        <div className="space-y-4">
          <div className="glass-panel rounded-xl p-4 min-h-[320px] max-h-[60vh] overflow-y-auto">
            <TranscriptFeed transcript={transcript} streaming={streaming} />
          </div>
          <ArgumentPortal
            busy={busy}
            onSubmitManual={(side, arg) => simulateTurn(side, arg)}
            onAutomate={(side) => simulateTurn(side)}
          />
        </div>
      </div>

      {verdict?.disclaimer && (
        <p className="text-[10px] text-zinc-600 max-w-prose leading-relaxed">{verdict.disclaimer}</p>
      )}
    </div>
  );
}
