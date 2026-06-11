import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertCircle,
  Database,
  FileDown,
  FileText,
  Gavel,
  Loader2,
  RotateCcw,
  Sparkles,
  Table2,
} from "lucide-react";
import { useCourtroomLive } from "@/hooks/useCourtroomLive";
import { cn } from "@/lib/utils";
import type { CaseExportData } from "@/utils/PdfExporter";
import { ElasticDiagnostics } from "./ElasticDiagnostics";
import { SearchStrategyGate } from "./SearchStrategyGate";
import { CodeTerminal } from "./CodeTerminal";
import { JuryGauge } from "./JuryGauge";
import { EvidenceDock } from "./EvidenceDock";
import { TranscriptFeed } from "./TranscriptFeed";
import { ArgumentPortal } from "./ArgumentPortal";

const SAMPLE_CASES = [
  "A ride-hailing app shared my phone number and live location with third-party advertisers without my consent, despite their privacy policy promising otherwise.",
  "My employer terminated me without notice or severance after I reported unsafe working conditions; I had a 4-year permanent contract.",
  "My landlord is trying to evict me from my flat with 3 days notice though I've paid rent on time for 5 years.",
  "A refrigerator I bought caught fire within a week from a manufacturing defect, damaging my kitchen; the company refuses to compensate me.",
];

const DOMAIN_CLASS: Record<string, string> = {
  Criminal: "bg-rose-500/15 text-rose-300",
  Civil: "bg-blue-500/15 text-blue-300",
  Consumer: "bg-emerald-500/15 text-emerald-300",
  Labor: "bg-amber-500/15 text-amber-300",
  Constitutional: "bg-violet-500/15 text-violet-300",
  Other: "bg-zinc-700/40 text-zinc-300",
};

export function LiveCourtroom() {
  const c = useCourtroomLive();
  const [facts, setFacts] = useState("");
  const [exporting, setExporting] = useState<null | "full" | "scorecard">(null);

  const citedDocids = useMemo(() => {
    const s = new Set<string>();
    for (const t of c.transcript) {
      for (const cit of t.citations || []) {
        if (cit.docid && cit.grounded) s.add(cit.docid);
      }
    }
    return s;
  }, [c.transcript]);

  const buildExportData = (): CaseExportData => ({
    sessionId: c.sessionId,
    caseFacts: facts.trim() || c.analysis?.summary || "",
    analysis: c.analysis,
    plan: c.plan,
    precedents: c.precedents,
    diagnostics: c.diagnostics,
    transcript: c.transcript,
    verdict: c.verdict,
    engine: c.infra?.claude?.configured
      ? `${c.infra.gemini?.model ?? "Gemini"} · Claude fallback`
      : c.infra?.gemini?.model,
  });

  const handleExport = async (kind: "full" | "scorecard") => {
    if (exporting) return;
    setExporting(kind);
    try {
      // Lazy-load jsPDF + html2canvas only when the user actually exports.
      const { exportCaseReport, exportScorecard } = await import("@/utils/PdfExporter");
      const data = buildExportData();
      if (kind === "full") await exportCaseReport(data);
      else await exportScorecard(data);
    } catch {
      // Toast is surfaced inside the exporter; swallow to keep the UI responsive.
    } finally {
      setExporting(null);
    }
  };

  // Report needs at least a compiled plan; scorecard needs a returned verdict.
  const canExportReport = !!c.plan || c.transcript.length > 0;
  const canExportScorecard = !!c.verdict;

  const exportControls = (canExportReport || canExportScorecard) && (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => handleExport("full")}
        disabled={!canExportReport || exporting !== null}
        title="Download the complete case summary & trial report (PDF, generated locally)"
        className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white rounded-lg px-3 py-1.5 border border-zinc-700 hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {exporting === "full" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileDown className="h-3.5 w-3.5" />
        )}
        Trial report
      </button>
      <button
        type="button"
        onClick={() => handleExport("scorecard")}
        disabled={!canExportScorecard || exporting !== null}
        title="Download the litigation strategy & jury scorecard (PDF, generated locally)"
        className="flex items-center gap-1.5 text-xs text-zinc-300 hover:text-white rounded-lg px-3 py-1.5 border border-zinc-700 hover:border-blue-500/40 hover:bg-blue-500/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {exporting === "scorecard" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Table2 className="h-3.5 w-3.5" />
        )}
        Scorecard
      </button>
    </div>
  );

  const header = (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Gavel className="h-5 w-5 text-amber-400" />
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100">
          Live Courtroom
        </h2>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold uppercase tracking-wider">
          Gemini 3 · Elastic MCP
        </span>
        {c.analysis && (
          <span
            className={cn(
              "text-[10px] font-semibold rounded-full px-2 py-0.5",
              DOMAIN_CLASS[c.analysis.domain] ?? DOMAIN_CLASS.Other
            )}
          >
            {c.analysis.domain}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {exportControls}
        {c.phase !== "intake" && (
          <button
            onClick={() => {
              c.reset();
              setFacts("");
            }}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 rounded-lg px-3 py-1.5 border border-zinc-700 hover:border-zinc-600 transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> New case
          </button>
        )}
      </div>
    </div>
  );

  const errorBanner = c.error && (
    <div className="flex items-start gap-2 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3 text-sm text-rose-300">
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      {c.error}
    </div>
  );

  // ── Intake ─────────────────────────────────────────────────────────────
  if (c.phase === "intake" || c.phase === "planning") {
    return (
      <div className="space-y-4 max-w-3xl mx-auto">
        {header}
        {errorBanner}
        <div className="text-center space-y-2 pt-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mx-auto">
            <Database className="h-7 w-7 text-emerald-400" />
          </div>
          <p className="text-sm text-zinc-400 max-w-xl mx-auto leading-relaxed">
            Gemini 3 acts as Lead Court Coordinator: it extracts legal entities, compiles an
            Elasticsearch Query DSL, retrieves real precedents through the Elastic MCP server,
            then dispatches adversarial AI attorneys before a quantitative jury.
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
            disabled={c.busy}
            placeholder="Describe what happened, who is involved, and what you want — in plain language."
            className="w-full rounded-lg bg-zinc-900/80 border border-zinc-700 text-zinc-200 text-sm px-3 py-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/40 min-h-[140px]"
          />
          <div className="grid sm:grid-cols-2 gap-2">
            {SAMPLE_CASES.map((s, i) => (
              <button
                key={i}
                type="button"
                disabled={c.busy}
                onClick={() => setFacts(s)}
                className="text-left text-[11px] leading-snug rounded-lg px-3 py-2 bg-zinc-800/60 text-zinc-400 border border-zinc-700/70 hover:border-emerald-500/30 hover:text-zinc-200 transition-colors disabled:opacity-50"
              >
                {s.length > 110 ? `${s.slice(0, 110)}…` : s}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => facts.trim().length >= 30 && c.startPlan(facts.trim())}
            disabled={c.busy || facts.trim().length < 30}
            className={cn(
              "w-full flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold transition-all",
              c.busy || facts.trim().length < 30
                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                : "bg-emerald-400 text-zinc-950 hover:bg-emerald-300"
            )}
          >
            {c.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {c.busy ? "Gemini is planning the search…" : "Analyze & compile search plan"}
          </button>
        </div>

        <ElasticDiagnostics infra={c.infra} diagnostics={null} />

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-200/90">
          <strong className="text-amber-100">Educational simulation</strong> — procedural
          preparation, not legal advice or representation. Live data is retrieved from your
          Elasticsearch cluster via the Agent Builder MCP server.
        </div>
      </div>
    );
  }

  // ── Plan review (HITL gate) ──────────────────────────────────────────────
  if ((c.phase === "plan_review" || c.phase === "searching") && c.plan) {
    return (
      <div className="space-y-4">
        {header}
        {errorBanner}
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)] gap-4 items-start">
          <SearchStrategyGate plan={c.plan} busy={c.busy} onApprove={c.approveAndSearch} />
          <ElasticDiagnostics infra={c.infra} diagnostics={c.diagnostics} />
        </div>
      </div>
    );
  }

  // ── Arena (ready / simulating) ───────────────────────────────────────────
  return (
    <div className="space-y-4">
      {header}
      {errorBanner}
      <div className="grid lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-4 items-start">
        <div className="space-y-4">
          <JuryGauge verdict={c.verdict} />
          <ElasticDiagnostics infra={c.infra} diagnostics={c.diagnostics} />

          {c.analysis && (
            <div className="glass-panel rounded-xl p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Case brief
              </p>
              <p className="text-xs text-zinc-300 leading-relaxed">{c.analysis.summary}</p>
              {c.analysis.governing_acts.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.analysis.governing_acts.map((a, i) => (
                    <span
                      key={i}
                      className="text-[10px] rounded-full px-2 py-0.5 bg-zinc-800/80 text-zinc-400 border border-zinc-700"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <EvidenceDock
            precedents={c.precedents}
            citedDocids={citedDocids}
            sourceLabel="Elasticsearch · live"
            live={!!c.infra?.elastic?.connected}
            emptyHint="No documents returned by the Elasticsearch search."
          />

          {c.diagnostics && (
            <CodeTerminal
              title="Executed Query DSL"
              code={JSON.stringify(c.diagnostics.query_dsl, null, 2)}
              language="json"
            />
          )}
        </div>

        <div className="space-y-4">
          <div className="glass-panel rounded-xl p-4 min-h-[320px] max-h-[60vh] overflow-y-auto">
            <TranscriptFeed transcript={c.transcript} streaming={c.streaming} />
          </div>
          <ArgumentPortal
            busy={c.busy}
            onSubmitManual={(side, arg) => c.simulateTurn(side, arg)}
            onAutomate={(side) => c.simulateTurn(side)}
          />
        </div>
      </div>

      {c.verdict?.disclaimer && (
        <p className="text-[10px] text-zinc-600 max-w-prose leading-relaxed">
          {c.verdict.disclaimer}
        </p>
      )}
    </div>
  );
}
