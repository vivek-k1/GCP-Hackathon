import { useCallback, useEffect, useRef, useState } from "react";
import {
  planCaseLive,
  executeSearchLive,
  streamSimulateTurnLive,
  fetchInfraStatus,
} from "@/lib/api";
import type {
  CaseAnalysis,
  CourtroomPlan,
  CourtroomSide,
  CourtroomTurn,
  ElasticDiagnostics,
  InfraStatus,
  JuryVerdict,
  Precedent,
} from "@/types/api";
import type { StreamingTurn } from "@/hooks/useCourtroom";

export type LivePhase =
  | "intake"
  | "planning"
  | "plan_review"
  | "searching"
  | "ready"
  | "simulating";

export function useCourtroomLive() {
  const [phase, setPhase] = useState<LivePhase>("intake");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CaseAnalysis | null>(null);
  const [plan, setPlan] = useState<CourtroomPlan | null>(null);
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [diagnostics, setDiagnostics] = useState<ElasticDiagnostics | null>(null);
  const [transcript, setTranscript] = useState<CourtroomTurn[]>([]);
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  const [verdict, setVerdict] = useState<JuryVerdict | null>(null);
  const [infra, setInfra] = useState<InfraStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const refreshInfra = useCallback(() => {
    fetchInfraStatus()
      .then(setInfra)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshInfra();
    const id = setInterval(refreshInfra, 20_000);
    return () => clearInterval(id);
  }, [refreshInfra]);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("intake");
    setSessionId(null);
    setAnalysis(null);
    setPlan(null);
    setPrecedents([]);
    setDiagnostics(null);
    setTranscript([]);
    setStreaming(null);
    setVerdict(null);
    setError(null);
    setBusy(false);
  }, []);

  /** Phase 1: Gemini compiles the search strategy (no Elastic call yet). */
  const startPlan = useCallback(async (facts: string) => {
    setError(null);
    setBusy(true);
    setPhase("planning");
    setTranscript([]);
    setVerdict(null);
    setPrecedents([]);
    setDiagnostics(null);
    try {
      const r = await planCaseLive(facts);
      setSessionId(r.session_id);
      setAnalysis(r.analysis);
      setPlan(r.plan);
      setPhase("plan_review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gemini planning failed");
      setPhase("intake");
    } finally {
      setBusy(false);
    }
  }, []);

  /** Phase 2 (after human approval): live Elasticsearch MCP execution. */
  const approveAndSearch = useCallback(
    async (queryDsl?: Record<string, unknown>, index?: string, runEsql?: boolean) => {
      if (!sessionId) return;
      setError(null);
      setBusy(true);
      setPhase("searching");
      try {
        const r = await executeSearchLive({
          session_id: sessionId,
          query_dsl: queryDsl,
          index,
          run_esql: runEsql,
        });
        setPrecedents(r.precedents);
        setDiagnostics(r.diagnostics);
        setPhase("ready");
        refreshInfra();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Elasticsearch MCP search failed");
        setPhase("plan_review");
      } finally {
        setBusy(false);
      }
    },
    [sessionId, refreshInfra]
  );

  /** Phase 3: stream a Gemini attorney turn (Elastic-grounded). */
  const simulateTurn = useCallback(
    (side: CourtroomSide, manualArgument?: string) => {
      if (!sessionId || busy) return;
      setError(null);
      setBusy(true);
      setPhase("simulating");
      abortRef.current?.abort();
      abortRef.current = streamSimulateTurnLive(
        { session_id: sessionId, side, manual_argument: manualArgument },
        {
          onTurnMeta: (meta) =>
            setStreaming({ side: meta.side, roleLabel: meta.role_label, text: "" }),
          onDelta: (s, text) =>
            setStreaming((prev) =>
              prev ? { ...prev, text: prev.text + text } : { side: s, roleLabel: "", text }
            ),
          onTurn: (turn) => {
            setStreaming(null);
            setTranscript((prev) => [...prev, turn]);
          },
          onVerdict: (v) => setVerdict(v),
          onDone: () => {
            setStreaming(null);
            setBusy(false);
            setPhase("ready");
          },
          onError: (err) => {
            setStreaming(null);
            setBusy(false);
            setPhase("ready");
            setError(err.message);
          },
        }
      );
    },
    [sessionId, busy]
  );

  return {
    phase,
    sessionId,
    analysis,
    plan,
    precedents,
    diagnostics,
    transcript,
    streaming,
    verdict,
    infra,
    error,
    busy,
    startPlan,
    approveAndSearch,
    simulateTurn,
    refreshInfra,
    reset,
  };
}
