import type {
  BillInfo,
  BillResponse,
  AgentResult,
  SonnetSummary,
  ReaderOverallPayload,
  AnalyzeResponse,
  RetrieveResponse,
  CourtroomTurn,
  JuryVerdict,
  CourtroomSide,
  LivePlanResponse,
  ExecuteSearchResponse,
  InfraStatus,
} from "@/types/api";

const BASE = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/+$/, "")
  : "/api";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ── Health & Status ──────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  bills_loaded: string[];
  cost_summary: {
    total_calls: number;
    total_cost_usd: number;
    budget_remaining_usd: number;
    sonnet_calls: number;
    haiku_calls: number;
  };
  endpoints?: Record<string, string>;
}

export function fetchHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/health");
}

// ── Bills ────────────────────────────────────────────────────────────────

export function fetchBills(): Promise<Record<string, BillInfo>> {
  return request<Record<string, BillInfo>>("/bills");
}

// ── Summarize ────────────────────────────────────────────────────────────

export function summarizeBill(params: {
  bill: string;
  query: string;
  persona?: string;
  top_k?: number;
}): Promise<BillResponse> {
  const qs = new URLSearchParams({
    bill: params.bill,
    query: params.query,
  });
  if (params.persona) qs.set("persona", params.persona);
  if (params.top_k) qs.set("top_k", String(params.top_k));

  return request<BillResponse>(`/summarize?${qs}`, { method: "POST" });
}

// ── Verdict Agents (SSE stream) ──────────────────────────────────────────

export interface VerdictSSEEvent {
  type: "summary" | "agent" | "overall" | "done";
  data?: SonnetSummary | AgentResult | ReaderOverallPayload;
}

export function streamVerdictAgents(
  params: { bill: string; query: string; top_k?: number; persona?: string },
  callbacks: {
    onSummary: (summary: SonnetSummary) => void;
    onAgent: (result: AgentResult) => void;
    onOverall?: (payload: ReaderOverallPayload) => void;
    onDone: () => void;
    onError: (err: Error) => void;
  }
): AbortController {
  const controller = new AbortController();

  const qs = new URLSearchParams({
    bill: params.bill,
    query: params.query,
  });
  if (params.top_k) qs.set("top_k", String(params.top_k));
  if (params.persona) qs.set("persona", params.persona);

  fetch(`${BASE}/verdict-agents?${qs}`, {
    method: "POST",
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          try {
            const event: VerdictSSEEvent = JSON.parse(json);
            if (event.type === "summary") {
              callbacks.onSummary(event.data as SonnetSummary);
            } else if (event.type === "agent") {
              callbacks.onAgent(event.data as AgentResult);
            } else if (event.type === "overall") {
              callbacks.onOverall?.(event.data as ReaderOverallPayload);
            } else if (event.type === "done") {
              callbacks.onDone();
            }
          } catch {
            // skip malformed events
          }
        }
      }

      callbacks.onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        callbacks.onError(err);
      }
    });

  return controller;
}

// ── Rights Checker ───────────────────────────────────────────────────────

export function checkRights(situation: string): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ situation });
  return request<Record<string, unknown>>(`/check-rights?${qs}`, {
    method: "POST",
  });
}

// ── Conflict Detector ────────────────────────────────────────────────────

export function detectConflicts(params: {
  bill_a: string;
  bill_b: string;
  topic?: string;
}): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({
    bill_a: params.bill_a,
    bill_b: params.bill_b,
  });
  if (params.topic) qs.set("topic", params.topic);
  return request<Record<string, unknown>>(`/detect-conflicts?${qs}`, {
    method: "POST",
  });
}

// ── Cost ─────────────────────────────────────────────────────────────────

export function fetchCost() {
  return request<HealthResponse["cost_summary"]>("/cost");
}

// ── State bills (PRS dataset CSV) ────────────────────────────────────────

export interface StateBillsMeta {
  total_count: number;
  states: string[];
  year_from_default: number;
  year_to_default: number;
  dataset_present: boolean;
  source_note: string;
}

export interface StateBillRow {
  bill: string;
  state: string;
  date: string;
  legislature?: string;
  year?: number;
  [key: string]: unknown;
}

export function fetchStateBillsMeta(): Promise<StateBillsMeta> {
  return request<StateBillsMeta>("/state-bills/meta");
}

export function fetchStateBills(params: {
  state?: string;
  yearFrom?: number;
  yearTo?: number;
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  rows: StateBillRow[];
  total: number;
  limit: number;
  offset: number;
  message?: string;
}> {
  const qs = new URLSearchParams();
  if (params.state) qs.set("state", params.state);
  if (params.yearFrom != null) qs.set("year_from", String(params.yearFrom));
  if (params.yearTo != null) qs.set("year_to", String(params.yearTo));
  if (params.q) qs.set("q", params.q);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  return request(`/state-bills?${qs.toString()}`);
}

// ── Upload bill (PDF) ────────────────────────────────────────────────────

export interface UploadBillResponse {
  bill_key: string;
  display_name: string;
  num_sections: number;
}

export async function uploadBill(file: File): Promise<UploadBillResponse> {
  const form = new FormData();
  form.append("file", file);
  let res: Response;
  try {
    res = await fetch(`${BASE}/upload-bill`, { method: "POST", body: form });
  } catch (e) {
    if (e instanceof TypeError || (e instanceof Error && e.message === "Failed to fetch")) {
      throw new Error(
        "Cannot reach the API. Start FastAPI on the port in civicsync-ui/vite.config.ts (e.g. " +
          "python -m uvicorn app.main:app --host 127.0.0.1 --port 8005) and keep the Vite dev server running."
      );
    }
    throw e instanceof Error ? e : new Error("Network error");
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    if (res.status === 404) {
      throw new Error(
        "Upload API not found (404). Restart the backend from the project root so the latest code is loaded, including POST /upload-bill."
      );
    }
    const d = body.detail;
    const msg = typeof d === "string" ? d : res.statusText;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json() as Promise<UploadBillResponse>;
}

export async function deleteUploadedBill(billKey: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/upload-bill/${encodeURIComponent(billKey)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(body.detail ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ ok: boolean }>;
}

// ── Courtroom Simulation (PA-MA-RAG) ─────────────────────────────────────

export function analyzeCase(caseFacts: string): Promise<AnalyzeResponse> {
  return request<AnalyzeResponse>("/case/analyze", {
    method: "POST",
    body: JSON.stringify({ case_facts: caseFacts }),
  });
}

export function retrievePrecedents(params: {
  session_id: string;
  court?: string;
  max_results?: number;
}): Promise<RetrieveResponse> {
  return request<RetrieveResponse>("/kanoon/retrieve", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function fetchJuryVerdict(sessionId: string): Promise<JuryVerdict> {
  const qs = new URLSearchParams({ session_id: sessionId });
  return request<JuryVerdict>(`/courtroom/jury-verdict?${qs}`);
}

export interface SimulateTurnEvent {
  type: "turn_meta" | "delta" | "turn" | "verdict" | "done" | "error";
  side?: CourtroomSide;
  speaker?: string;
  role_label?: string;
  text?: string;
  message?: string;
  data?: CourtroomTurn | JuryVerdict;
}

export interface SimulateTurnCallbacks {
  onTurnMeta?: (meta: { side: CourtroomSide; role_label: string }) => void;
  onDelta?: (side: CourtroomSide, text: string) => void;
  onTurn?: (turn: CourtroomTurn) => void;
  onVerdict?: (verdict: JuryVerdict) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/** Shared SSE reader for courtroom turn streams (Claude + live Gemini pipelines). */
function streamCourtroomTurn(
  path: string,
  params: { session_id: string; side: CourtroomSide; manual_argument?: string },
  callbacks: SimulateTurnCallbacks
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal: controller.signal,
  })
    .then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (!json) continue;
          try {
            const ev: SimulateTurnEvent = JSON.parse(json);
            switch (ev.type) {
              case "turn_meta":
                callbacks.onTurnMeta?.({
                  side: ev.side as CourtroomSide,
                  role_label: ev.role_label ?? "",
                });
                break;
              case "delta":
                callbacks.onDelta?.(ev.side as CourtroomSide, ev.text ?? "");
                break;
              case "turn":
                callbacks.onTurn?.(ev.data as CourtroomTurn);
                break;
              case "verdict":
                callbacks.onVerdict?.(ev.data as JuryVerdict);
                break;
              case "error":
                callbacks.onError(new Error(ev.message ?? "Simulation error"));
                break;
              case "done":
                callbacks.onDone();
                break;
            }
          } catch {
            // skip malformed events
          }
        }
      }
      callbacks.onDone();
    })
    .catch((err) => {
      if (err.name !== "AbortError") callbacks.onError(err);
    });

  return controller;
}

/** Claude/Indian-Kanoon courtroom turn stream. */
export function streamSimulateTurn(
  params: { session_id: string; side: CourtroomSide; manual_argument?: string },
  callbacks: SimulateTurnCallbacks
): AbortController {
  return streamCourtroomTurn("/courtroom/simulate-turn", params, callbacks);
}

// ── Live courtroom: Gemini 3 + Elasticsearch MCP ─────────────────────────────

export function fetchInfraStatus(): Promise<InfraStatus> {
  return request<InfraStatus>("/courtroom/live/infra-status");
}

export function planCaseLive(caseFacts: string): Promise<LivePlanResponse> {
  return request<LivePlanResponse>("/courtroom/live/plan", {
    method: "POST",
    body: JSON.stringify({ case_facts: caseFacts }),
  });
}

export function executeSearchLive(params: {
  session_id: string;
  query_dsl?: Record<string, unknown>;
  index?: string;
  run_esql?: boolean;
}): Promise<ExecuteSearchResponse> {
  return request<ExecuteSearchResponse>("/courtroom/live/execute-search", {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export function fetchLiveJuryVerdict(sessionId: string): Promise<JuryVerdict> {
  const qs = new URLSearchParams({ session_id: sessionId });
  return request<JuryVerdict>(`/courtroom/live/jury-verdict?${qs}`);
}

/** Live Gemini courtroom turn stream (Elastic-grounded). */
export function streamSimulateTurnLive(
  params: { session_id: string; side: CourtroomSide; manual_argument?: string },
  callbacks: SimulateTurnCallbacks
): AbortController {
  return streamCourtroomTurn("/courtroom/live/simulate-turn", params, callbacks);
}
