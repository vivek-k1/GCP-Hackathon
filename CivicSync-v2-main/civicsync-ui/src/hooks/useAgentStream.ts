import { useState, useCallback, useRef } from "react";
import type {
  AgentStreamState,
  AgentResult,
  AgentId,
  SonnetSummary,
  ReaderOverallPayload,
} from "@/types/api";
import { streamVerdictAgents } from "@/lib/api";

const KNOWN_AGENTS: AgentId[] = [
  "economist",
  "social_worker",
  "legal_expert",
  "citizen",
  "rural_specialist",
];

function createInitialState(): AgentStreamState[] {
  return KNOWN_AGENTS.map((id) => ({
    agentId: id,
    status: "idle",
    text: "",
    result: null,
    startTime: null,
    elapsedMs: 0,
  }));
}

export function useAgentStream() {
  const [agents, setAgents] = useState<AgentStreamState[]>(createInitialState());
  const [isRunning, setIsRunning] = useState(false);
  const [summary, setSummary] = useState<SonnetSummary | null>(null);
  const [overallPayload, setOverallPayload] = useState<ReaderOverallPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startDeliberation = useCallback(
    (billKey: string, query: string, persona?: string) => {
      if (abortRef.current) abortRef.current.abort();
      if (timerRef.current) clearInterval(timerRef.current);

      setError(null);
      setIsRunning(true);
      setSummary(null);
      setOverallPayload(null);

      const startTime = Date.now();

      setAgents(
        KNOWN_AGENTS.map((id) => ({
          agentId: id,
          status: "thinking",
          text: "",
          result: null,
          startTime,
          elapsedMs: 0,
        }))
      );

      timerRef.current = setInterval(() => {
        setAgents((prev) =>
          prev.map((s) =>
            s.status === "thinking" || s.status === "streaming"
              ? { ...s, elapsedMs: Date.now() - startTime }
              : s
          )
        );
      }, 200);

      const completedIds = new Set<string>();

      abortRef.current = streamVerdictAgents(
        { bill: billKey, query, persona: persona || undefined },
        {
          onSummary: (s) => {
            setSummary(s);
          },

          onAgent: (result: AgentResult) => {
            const id = result.agent_id;
            completedIds.add(id);

            setAgents((prev) =>
              prev.map((s) => {
                if (s.agentId === id) {
                  return {
                    ...s,
                    status: "complete",
                    text: result.headline ?? "",
                    result,
                    elapsedMs: Date.now() - startTime,
                  };
                }
                if (!completedIds.has(s.agentId) && s.status === "thinking") {
                  return { ...s, status: "thinking", elapsedMs: Date.now() - startTime };
                }
                return s;
              })
            );
          },

          onOverall: (payload) => {
            setOverallPayload(payload);
          },

          onDone: () => {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(false);
            setAgents((prev) =>
              prev.map((s) =>
                s.status !== "complete"
                  ? { ...s, status: "complete", elapsedMs: Date.now() - startTime }
                  : s
              )
            );
          },

          onError: (err) => {
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRunning(false);
            setError(err.message);
            setAgents((prev) =>
              prev.map((s) =>
                s.status !== "complete" ? { ...s, status: "error" } : s
              )
            );
          },
        }
      );
    },
    []
  );

  const reset = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setAgents(createInitialState());
    setIsRunning(false);
    setSummary(null);
    setOverallPayload(null);
    setError(null);
  }, []);

  return {
    agents,
    isRunning,
    summary,
    overallPayload,
    error,
    startDeliberation,
    reset,
  };
}
