import { useCallback, useRef, useState } from "react";
import {
  analyzeCase,
  retrievePrecedents,
  streamSimulateTurn,
} from "@/lib/api";
import type {
  CaseAnalysis,
  CourtroomSide,
  CourtroomTurn,
  JuryVerdict,
  Precedent,
} from "@/types/api";

export type CourtroomPhase =
  | "intake"
  | "analyzing"
  | "retrieving"
  | "ready"
  | "simulating";

export interface StreamingTurn {
  side: CourtroomSide;
  roleLabel: string;
  text: string;
}

export function useCourtroom() {
  const [phase, setPhase] = useState<CourtroomPhase>("intake");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CaseAnalysis | null>(null);
  const [precedents, setPrecedents] = useState<Precedent[]>([]);
  const [kanoonLive, setKanoonLive] = useState(false);
  const [transcript, setTranscript] = useState<CourtroomTurn[]>([]);
  const [streaming, setStreaming] = useState<StreamingTurn | null>(null);
  const [verdict, setVerdict] = useState<JuryVerdict | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setPhase("intake");
    setSessionId(null);
    setAnalysis(null);
    setPrecedents([]);
    setKanoonLive(false);
    setTranscript([]);
    setStreaming(null);
    setVerdict(null);
    setError(null);
    setBusy(false);
  }, []);

  /** Senior lawyer analysis + Kanoon retrieval in one flow. */
  const startCase = useCallback(async (facts: string) => {
    setError(null);
    setBusy(true);
    setTranscript([]);
    setVerdict(null);
    setStreaming(null);
    try {
      setPhase("analyzing");
      const a = await analyzeCase(facts);
      setSessionId(a.session_id);
      setAnalysis(a.analysis);

      setPhase("retrieving");
      const r = await retrievePrecedents({ session_id: a.session_id });
      setPrecedents(r.precedents);
      setKanoonLive(r.kanoon_live);
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Case setup failed");
      setPhase("intake");
    } finally {
      setBusy(false);
    }
  }, []);

  const simulateTurn = useCallback(
    (side: CourtroomSide, manualArgument?: string) => {
      if (!sessionId || busy) return;
      setError(null);
      setBusy(true);
      setPhase("simulating");

      abortRef.current?.abort();
      abortRef.current = streamSimulateTurn(
        { session_id: sessionId, side, manual_argument: manualArgument },
        {
          onTurnMeta: (meta) =>
            setStreaming({ side: meta.side, roleLabel: meta.role_label, text: "" }),
          onDelta: (s, text) =>
            setStreaming((prev) =>
              prev ? { ...prev, text: prev.text + text } : { side: s, roleLabel: "", text }
            ),
          onTurn: (turn) => {
            // user turns arrive with no streaming; AI turns finalize the stream
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
  };
}
