import { motion } from "framer-motion";
import { Activity, Database, Cpu, Gauge, ServerCog, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ElasticDiagnostics as Diag, InfraStatus } from "@/types/api";

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={cn(
        "h-2 w-2 rounded-full",
        ok ? "bg-emerald-500 presence-pulse" : "bg-rose-500"
      )}
    />
  );
}

export function ElasticDiagnostics({
  infra,
  diagnostics,
}: {
  infra: InfraStatus | null;
  diagnostics: Diag | null;
}) {
  const elastic = infra?.elastic;
  const gemini = infra?.gemini;
  const claude = infra?.claude;
  const connected = !!elastic?.connected;

  return (
    <div className="glass-panel-strong rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold flex items-center gap-1.5">
          <ServerCog className="h-3.5 w-3.5" /> Elasticsearch Diagnostics
        </p>
        <Activity className="h-3.5 w-3.5 text-zinc-600" />
      </div>

      {/* MCP connection badge */}
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 border",
          connected
            ? "bg-emerald-500/10 border-emerald-500/25"
            : "bg-rose-500/10 border-rose-500/25"
        )}
      >
        {connected ? (
          <Wifi className="h-4 w-4 text-emerald-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-rose-400" />
        )}
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-xs font-semibold",
              connected ? "text-emerald-300" : "text-rose-300"
            )}
          >
            {connected ? "Elasticsearch MCP Connected" : "Elasticsearch MCP Offline"}
          </p>
          <p className="text-[10px] text-zinc-500 truncate font-mono">
            {elastic?.endpoint ?? "—"}
          </p>
        </div>
        {elastic?.latency_ms != null && (
          <span className="text-[10px] font-mono text-zinc-400 flex items-center gap-0.5">
            <Gauge className="h-3 w-3" />
            {elastic.latency_ms}ms
          </span>
        )}
      </div>

      {elastic?.error && (
        <p className="text-[11px] text-rose-300/90 leading-relaxed break-words">
          {elastic.error}
        </p>
      )}

      {/* Tiles */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-2.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
            <StatusDot ok={connected} /> Protocol
          </p>
          <p className="text-[11px] text-zinc-300 font-mono mt-0.5">
            {elastic?.protocol_version ?? "—"}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-2.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
            <Cpu className="h-2.5 w-2.5" /> Gemini
          </p>
          <p
            className={cn(
              "text-[11px] font-mono mt-0.5 truncate",
              gemini?.configured ? "text-zinc-300" : "text-rose-300"
            )}
          >
            {gemini?.configured
              ? `${gemini.model}${gemini.use_pro ? " · pro" : " · fast"}`
              : "not configured"}
          </p>
        </div>
        <div className="rounded-lg bg-zinc-900/60 border border-zinc-800 p-2.5">
          <p className="text-[9px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
            <Cpu className="h-2.5 w-2.5" /> Claude fallback
          </p>
          <p
            className={cn(
              "text-[11px] font-mono mt-0.5 truncate",
              claude?.configured ? "text-zinc-300" : "text-amber-300/80"
            )}
          >
            {claude?.configured ? claude.model : "not configured"}
          </p>
        </div>
      </div>

      {/* Tool inventory */}
      {elastic?.tools && elastic.tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {elastic.tools.map((t) => (
            <span
              key={t}
              className="text-[9px] font-mono rounded-full px-2 py-0.5 bg-zinc-800/80 text-zinc-400 border border-zinc-700"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* Live query step timings (after a search) */}
      {diagnostics && diagnostics.steps.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="space-y-1.5 pt-1"
        >
          <p className="text-[9px] uppercase tracking-wider text-zinc-600 flex items-center gap-1">
            <Database className="h-2.5 w-2.5" /> MCP tool calls · last run
          </p>
          {diagnostics.steps.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-[11px] font-mono text-zinc-400"
            >
              <span className="text-emerald-400/80">{s.tool}</span>
              <span className="flex items-center gap-2 text-zinc-500">
                {s.count != null && <span>{s.count} idx</span>}
                {s.field_count != null && <span>{s.field_count} fields</span>}
                {s.hit_count != null && <span>{s.hit_count} hits</span>}
                <span className="text-zinc-300">{s.ms}ms</span>
              </span>
            </div>
          ))}
          {diagnostics.total_ms != null && (
            <div className="flex items-center justify-between text-[11px] font-mono pt-1 border-t border-zinc-800">
              <span className="text-zinc-500">total</span>
              <span className="text-amber-300">{diagnostics.total_ms}ms</span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
