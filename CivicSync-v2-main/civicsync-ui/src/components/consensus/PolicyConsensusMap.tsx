import { useState, useMemo } from "react";
import { Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import { motion, AnimatePresence } from "framer-motion";
import { Info, Maximize2, Users } from "lucide-react";
import { cn, getAgentColor, getAgentColorHex, hexToRgba } from "@/lib/utils";
import type { ConsensusCluster, AgentResult, AgentId } from "@/types/api";

ChartJS.register(LinearScale, PointElement, ChartTooltip, Legend);

function deriveClusterFromAgent(r: AgentResult): ConsensusCluster {
  const verdictToY: Record<string, number> = {
    positive: 0.7, protective: 0.6, robust: 0.5, business_friendly: 0.6,
    good_news: 0.65, mixed: 0.1, needs_clarification: -0.2, neutral: 0.0,
    concern: -0.5, exclusionary: -0.6, legally_risky: -0.4,
    burdensome: -0.3, bad_news: -0.5, error: 0,
  };
  const agentToX: Record<string, number> = {
    economist: 0.6, social_worker: -0.4, rural_specialist: -0.6,
    legal_expert: 0.3, citizen: 0.1, industry_rep: 0.5,
  };

  const positives = r.positives ?? r.strengths ?? r.who_is_protected ?? r.what_changes_for_me ?? [];
  const concerns = r.concerns ?? r.gaps ?? r.who_is_excluded ?? [];

  return {
    id: r.agent_id,
    label: `${r.agent_label} Perspective`,
    x: agentToX[r.agent_id] ?? 0,
    y: verdictToY[r.verdict] ?? 0,
    agentId: r.agent_id as AgentId,
    agentLabel: r.agent_label,
    verdict: r.verdict,
    confidence: r.confidence ?? 0.5,
    consensusPoints: [
      r.headline,
      ...positives.slice(0, 1),
      ...concerns.slice(0, 1),
      r.fiscal_note ?? r.implementation_gap ?? r.constitutional_note ?? r.biggest_question ?? "",
    ].filter(Boolean),
  };
}

const MOCK_CLUSTERS: ConsensusCluster[] = [
  {
    id: "c1",
    label: "Fiscal Responsibility Group",
    x: 0.7,
    y: 0.8,
    agentId: "economist",
    agentLabel: "Economist",
    verdict: "mixed",
    confidence: 0.87,
    consensusPoints: [
      "Tax simplification benefits MSMEs but creates short-term fiscal gap",
      "Revenue neutrality should be achieved by Y3 through base expansion",
      "Inflationary risks require monitoring via independent committee",
    ],
  },
  {
    id: "c2",
    label: "Social Protection Advocates",
    x: -0.4,
    y: 0.6,
    agentId: "social_worker",
    agentLabel: "Social Advocate",
    verdict: "protective",
    confidence: 0.91,
    consensusPoints: [
      "Gig worker protections are a landmark inclusion",
      "Enforcement mechanism needs dedicated state-level bodies",
      "Self-employed artisans remain outside coverage — gap to address",
    ],
  },
  {
    id: "c3",
    label: "Digital Inclusion Skeptics",
    x: -0.6,
    y: -0.3,
    agentId: "rural_specialist",
    agentLabel: "Rural Specialist",
    verdict: "concern",
    confidence: 0.78,
    consensusPoints: [
      "43% of rural population lacks reliable internet for digital compliance",
      "Panchayat-level redressal is positive but underfunded",
      "Timeline expectations incompatible with ground reality in tribal areas",
    ],
  },
  {
    id: "c4",
    label: "Constitutional Rigor Group",
    x: 0.3,
    y: -0.5,
    agentId: "legal_expert",
    agentLabel: "Legal Expert",
    verdict: "needs_clarification",
    confidence: 0.82,
    consensusPoints: [
      "Key definitions like 'reasonable' invite subjective enforcement",
      "No sunset clause for emergency provisions — constitutional concern",
      "Data protection vs RTI tension will reach Supreme Court",
    ],
  },
  {
    id: "c5",
    label: "Citizen Empowerment",
    x: 0.1,
    y: 0.3,
    agentId: "citizen",
    agentLabel: "Common Citizen",
    verdict: "good_news",
    confidence: 0.93,
    consensusPoints: [
      "Right to data deletion is a tangible, enforceable right",
      "Plain-language requirement for privacy notices is citizen-friendly",
      "Enforcement credibility remains the biggest unknown",
    ],
  },
];

interface PolicyConsensusMapProps {
  className?: string;
  agentResults?: AgentResult[];
}

export function PolicyConsensusMap({
  className,
  agentResults,
}: PolicyConsensusMapProps) {
  const [selectedCluster, setSelectedCluster] =
    useState<ConsensusCluster | null>(null);

  const clusters = useMemo(() => {
    if (agentResults && agentResults.length > 0) {
      return agentResults.map(deriveClusterFromAgent);
    }
    return MOCK_CLUSTERS;
  }, [agentResults]);

  const chartData = useMemo(() => {
    return {
      datasets: clusters.map((cluster) => {
        const stroke = getAgentColorHex(cluster.agentId);
        return {
          label: cluster.agentLabel,
          data: [
            {
              x: cluster.x,
              y: cluster.y,
              r: cluster.confidence * 18 + 6,
            },
          ],
          backgroundColor: hexToRgba(stroke, 0.28),
          borderColor: stroke,
          borderWidth: 2,
          pointRadius: cluster.confidence * 18 + 6,
          pointHoverRadius: cluster.confidence * 18 + 10,
          pointHitRadius: 20,
          pointBackgroundColor: hexToRgba(stroke, 0.35),
          pointBorderColor: stroke,
        };
      }),
    };
  }, [clusters]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          min: -1,
          max: 1,
          grid: { color: "rgba(63, 63, 70, 0.3)" },
          ticks: { color: "#71717a", font: { size: 10 } },
          title: {
            display: true,
            text: "← Protective · Restrictive →",
            color: "#71717a",
            font: { size: 10, family: "Inter" },
          },
        },
        y: {
          min: -1,
          max: 1,
          grid: { color: "rgba(63, 63, 70, 0.3)" },
          ticks: { color: "#71717a", font: { size: 10 } },
          title: {
            display: true,
            text: "← Concern · Support →",
            color: "#71717a",
            font: { size: 10, family: "Inter" },
          },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(24, 24, 27, 0.95)",
          borderColor: "rgba(63, 63, 70, 0.5)",
          borderWidth: 1,
          titleColor: "#fafafa",
          bodyColor: "#a1a1aa",
          titleFont: { family: "DM Sans", weight: "bold" as const, size: 12 },
          bodyFont: { family: "Inter", size: 11 },
          padding: 12,
          cornerRadius: 8,
          callbacks: {
            title: (items: { datasetIndex: number }[]) => {
              const idx = items[0]?.datasetIndex;
              return idx !== undefined ? clusters[idx]?.label ?? "" : "";
            },
            label: (item: { datasetIndex: number }) => {
              const cluster = clusters[item.datasetIndex];
              return `${cluster.agentLabel} · ${Math.round(cluster.confidence * 100)}% confidence`;
            },
          },
        },
      },
      onClick: (_: unknown, elements: { datasetIndex: number }[]) => {
        if (elements.length > 0) {
          setSelectedCluster(clusters[elements[0].datasetIndex]);
        }
      },
    }),
    [clusters]
  );

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100">
          Policy Consensus Map
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
          <Info className="h-3 w-3" />
          vTaiwan/Pol.is-style opinion landscape — click clusters to explore
          consensus points
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Chart */}
        <div className="xl:col-span-2 glass-panel rounded-xl p-4">
          <div className="relative h-[420px]">
            <Scatter data={chartData} options={chartOptions} />

            {/* Quadrant Labels */}
            <div className="absolute top-3 right-3 text-[10px] text-zinc-600 font-medium">
              Pro-Reform · Supportive
            </div>
            <div className="absolute bottom-3 left-3 text-[10px] text-zinc-600 font-medium">
              Protective · Skeptical
            </div>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-zinc-800">
            {clusters.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCluster(c)}
                className={cn(
                  "flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-all",
                  selectedCluster?.id === c.id
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                <div
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: getAgentColor(c.agentId) }}
                />
                {c.agentLabel}
              </button>
            ))}
          </div>
        </div>

        {/* Selected Cluster Detail */}
        <div className="xl:col-span-1">
          <AnimatePresence mode="wait">
            {selectedCluster ? (
              <motion.div
                key={selectedCluster.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="glass-panel rounded-xl p-5 space-y-4"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: getAgentColor(
                        selectedCluster.agentId
                      ),
                    }}
                  />
                  <h3 className="font-display text-sm font-semibold text-zinc-100">
                    {selectedCluster.label}
                  </h3>
                </div>

                <div className="flex gap-2">
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{
                      backgroundColor: `${getAgentColor(selectedCluster.agentId)}15`,
                      color: getAgentColor(selectedCluster.agentId),
                    }}
                  >
                    {selectedCluster.agentLabel}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400">
                    {Math.round(selectedCluster.confidence * 100)}% confidence
                  </span>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
                    Points of Rough Consensus
                  </p>
                  {selectedCluster.consensusPoints.map((point, i) => (
                    <div
                      key={i}
                      className="flex gap-2.5 items-start text-xs text-zinc-300"
                    >
                      <Maximize2 className="h-3 w-3 text-zinc-600 mt-0.5 flex-shrink-0" />
                      <span className="leading-relaxed">{point}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="glass-panel rounded-xl p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]"
              >
                <Users className="h-8 w-8 text-zinc-700 mb-3" />
                <p className="text-sm text-zinc-500 font-medium">
                  Click a cluster on the map
                </p>
                <p className="text-xs text-zinc-600 mt-1">
                  View synthesized consensus points from the Lead Coordinator
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
