import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatConfidence(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function getVerdictColor(verdict: string): string {
  const map: Record<string, string> = {
    positive: "text-emerald-400",
    protective: "text-emerald-400",
    robust: "text-emerald-400",
    business_friendly: "text-emerald-400",
    good_news: "text-emerald-400",
    mixed: "text-amber-400",
    needs_clarification: "text-amber-400",
    neutral: "text-zinc-400",
    concern: "text-rose-400",
    exclusionary: "text-rose-400",
    legally_risky: "text-rose-400",
    burdensome: "text-rose-400",
    bad_news: "text-rose-400",
    error: "text-zinc-500",
  };
  return map[verdict] ?? "text-zinc-400";
}

/** Hex values aligned with `@theme` in `index.css` — use for Canvas/Chart.js where `var()` cannot be alpha-suffixed. */
const AGENT_COLOR_HEX: Record<string, string> = {
  economist: "#3b82f6",
  social_worker: "#10b981",
  rural_specialist: "#f59e0b",
  legal_expert: "#8b5cf6",
  citizen: "#06b6d4",
};

export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getAgentColorHex(agentId: string): string {
  return AGENT_COLOR_HEX[agentId] ?? "#3b82f6";
}

export function getAgentColor(agentId: string): string {
  const map: Record<string, string> = {
    economist: "var(--color-agent-economist)",
    social_worker: "var(--color-agent-social)",
    rural_specialist: "var(--color-agent-rural)",
    legal_expert: "var(--color-agent-legal)",
    citizen: "var(--color-agent-citizen)",
  };
  return map[agentId] ?? "var(--color-accent-blue)";
}
