import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  Calculator,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  MapPin,
  Users,
  Briefcase,
  IndianRupee,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  DemographicProfile,
  ImpactMetric,
  SonnetSummary,
  AgentResult,
} from "@/types/api";

function computeImpactMetrics(profile: DemographicProfile): ImpactMetric[] {
  const isRural = profile.location === "rural";
  const isLowIncome = profile.income < 500000;
  const isLargeHousehold = profile.householdSize > 4;

  return [
    {
      label: "Tax Compliance Cost",
      before: isRural ? 12000 : 8000,
      after: isRural ? 7500 : 4200,
      unit: "₹/year",
      delta: isRural ? -37.5 : -47.5,
      sentiment: "positive",
    },
    {
      label: "Social Security Access",
      before: isLowIncome ? 15 : 65,
      after: isLowIncome ? 58 : 78,
      unit: "% coverage",
      delta: isLowIncome ? 286 : 20,
      sentiment: "positive",
    },
    {
      label: "Digital Filing Burden",
      before: isRural ? 2 : 8,
      after: isRural ? 6 : 9,
      unit: "hours/quarter",
      delta: isRural ? 200 : 12.5,
      sentiment: isRural ? "negative" : "neutral",
    },
    {
      label: "Data Privacy Score",
      before: 32,
      after: 71,
      unit: "/100",
      delta: 121.9,
      sentiment: "positive",
    },
    {
      label: "Grievance Resolution",
      before: isRural ? 180 : 45,
      after: isRural ? 90 : 30,
      unit: "days avg",
      delta: isRural ? -50 : -33.3,
      sentiment: "positive",
    },
    {
      label: "Compliance Penalty Risk",
      before: isLargeHousehold ? 25000 : 15000,
      after: isLargeHousehold ? 35000 : 22000,
      unit: "₹ max fine",
      delta: isLargeHousehold ? 40 : 46.7,
      sentiment: "negative",
    },
  ];
}

const OCCUPATION_OPTIONS = [
  "Salaried Employee",
  "Self-Employed",
  "Gig Worker",
  "Farmer",
  "Student",
  "Small Business Owner",
  "Retired",
];

const STATE_OPTIONS = [
  "Maharashtra",
  "Karnataka",
  "Tamil Nadu",
  "Delhi",
  "Uttar Pradesh",
  "Gujarat",
  "Rajasthan",
  "Madhya Pradesh",
  "West Bengal",
  "Bihar",
];

interface PersonalImpactCalculatorProps {
  className?: string;
  summary?: SonnetSummary | null;
  agentResults?: AgentResult[];
}

export function PersonalImpactCalculator({
  className,
  summary,
  agentResults,
}: PersonalImpactCalculatorProps) {
  const [profile, setProfile] = useState<DemographicProfile>({
    income: 600000,
    location: "urban",
    householdSize: 4,
    occupation: "Salaried Employee",
    age: 32,
    state: "Maharashtra",
  });
  const [showResults, setShowResults] = useState(false);

  const metrics = useMemo(() => computeImpactMetrics(profile), [profile]);

  const chartData = metrics.map((m) => ({
    name: m.label,
    Before: m.before,
    After: m.after,
  }));

  const isRural = profile.location === "rural";

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div>
        <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100">
          Personal Impact Calculator
        </h2>
        <p className="text-xs text-zinc-500 mt-0.5">
          Enter your demographics to see how this policy reform affects you
          specifically
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Demographics Form */}
        <div className="xl:col-span-2 glass-panel rounded-xl p-5 space-y-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Calculator className="h-4 w-4 text-blue-400" />
            Your Profile
          </div>

          {/* Income */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <IndianRupee className="h-3 w-3" />
              Annual Income
            </label>
            <input
              type="range"
              min={100000}
              max={5000000}
              step={100000}
              value={profile.income}
              onChange={(e) =>
                setProfile({ ...profile, income: Number(e.target.value) })
              }
              className="w-full accent-blue-500 h-1.5"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>₹1L</span>
              <span className="text-zinc-300 font-semibold">
                ₹{(profile.income / 100000).toFixed(1)}L
              </span>
              <span>₹50L</span>
            </div>
          </div>

          {/* Location */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <MapPin className="h-3 w-3" />
              Location Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["urban", "semi-urban", "rural"] as const).map((loc) => (
                <button
                  key={loc}
                  onClick={() => setProfile({ ...profile, location: loc })}
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs font-medium capitalize transition-all",
                    profile.location === loc
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300"
                  )}
                >
                  {loc}
                </button>
              ))}
            </div>
          </div>

          {/* Household Size */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Users className="h-3 w-3" />
              Household Size
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  onClick={() =>
                    setProfile({ ...profile, householdSize: n })
                  }
                  className={cn(
                    "h-8 w-8 rounded-md text-xs font-medium transition-all",
                    profile.householdSize === n
                      ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                      : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Occupation */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold flex items-center gap-1.5">
              <Briefcase className="h-3 w-3" />
              Occupation
            </label>
            <select
              value={profile.occupation}
              onChange={(e) =>
                setProfile({ ...profile, occupation: e.target.value })
              }
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-3 py-2 focus:outline-none focus:border-blue-500/50"
            >
              {OCCUPATION_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          {/* State */}
          <div className="space-y-1.5">
            <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
              State
            </label>
            <select
              value={profile.state}
              onChange={(e) =>
                setProfile({ ...profile, state: e.target.value })
              }
              className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs px-3 py-2 focus:outline-none focus:border-blue-500/50"
            >
              {STATE_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Calculate Button */}
          <button
            onClick={() => setShowResults(true)}
            className="w-full rounded-lg bg-white text-zinc-900 py-2.5 text-sm font-bold hover:bg-zinc-200 transition-all shadow-lg shadow-white/10"
          >
            Calculate My Impact
          </button>
        </div>

        {/* Results */}
        <div className="xl:col-span-3 space-y-4">
          <AnimatePresence>
            {showResults && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Adaptive Banner — real data when available */}
                {isRural && (() => {
                  const ruralAgent = agentResults?.find(
                    (a) => a.agent_id === "rural_specialist"
                  );
                  return (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      className="glass-panel rounded-xl p-4 border-l-4 border-amber-500"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg">🌾</span>
                        <p className="text-sm font-semibold text-amber-400">
                          Rural Specialist Report — Prioritized for You
                        </p>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">
                        {ruralAgent?.headline ??
                          "Based on your rural demographic, the Rural Specialist Agent's analysis has been promoted."}
                      </p>
                      {ruralAgent?.concerns?.map((c, i) => (
                        <p key={i} className="text-xs text-amber-400/80 mt-1 flex gap-1.5">
                          <span>⚠</span> {c}
                        </p>
                      ))}
                    </motion.div>
                  );
                })()}

                {/* Real persona impacts from API */}
                {summary?.persona_impacts && summary.persona_impacts.length > 0 && (
                  <div className="glass-panel rounded-xl p-4 space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                      AI-Generated Persona Impacts
                    </h3>
                    {summary.persona_impacts.map((imp, i) => (
                      <div key={i} className="flex gap-2 items-start text-xs">
                        <span className="text-blue-400 mt-0.5 font-bold">
                          {imp.persona}:
                        </span>
                        <span className="text-zinc-300 leading-relaxed">
                          {imp.concrete_impact}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Before/After Chart */}
                <div className="glass-panel rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-zinc-200 mb-4">
                    Before vs. After Reform Impact
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={chartData}
                      barGap={4}
                      barCategoryGap="20%"
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(63,63,70,0.3)"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        axisLine={{ stroke: "#27272a" }}
                        angle={-20}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis
                        tick={{ fill: "#71717a", fontSize: 10 }}
                        axisLine={{ stroke: "#27272a" }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "rgba(24,24,27,0.95)",
                          border: "1px solid rgba(63,63,70,0.5)",
                          borderRadius: 8,
                          color: "#fafafa",
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="Before" fill="#3f3f46" radius={[4, 4, 0, 0]}>
                        {chartData.map((_, i) => (
                          <Cell key={i} fill="#3f3f46" />
                        ))}
                      </Bar>
                      <Bar dataKey="After" radius={[4, 4, 0, 0]}>
                        {chartData.map((_, i) => (
                          <Cell
                            key={i}
                            fill={
                              metrics[i].sentiment === "positive"
                                ? "#10b981"
                                : metrics[i].sentiment === "negative"
                                ? "#f43f5e"
                                : "#3b82f6"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Metric Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {metrics.map((metric) => (
                    <motion.div
                      key={metric.label}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="glass-panel rounded-xl p-4 space-y-2"
                    >
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">
                        {metric.label}
                      </p>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-display font-bold text-zinc-100">
                          {typeof metric.after === "number" &&
                          metric.unit.includes("₹")
                            ? `₹${metric.after.toLocaleString()}`
                            : metric.after}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          {metric.unit}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "flex items-center gap-1 text-xs font-medium",
                          metric.sentiment === "positive"
                            ? "text-emerald-400"
                            : metric.sentiment === "negative"
                            ? "text-rose-400"
                            : "text-zinc-400"
                        )}
                      >
                        {metric.sentiment === "positive" ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : metric.sentiment === "negative" ? (
                          <ArrowDownRight className="h-3 w-3" />
                        ) : (
                          <Minus className="h-3 w-3" />
                        )}
                        {Math.abs(metric.delta).toFixed(0)}% change
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!showResults && (
            <div className="glass-panel rounded-xl p-12 flex flex-col items-center justify-center text-center">
              <Calculator className="h-10 w-10 text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500 font-medium">
                Fill in your profile and click Calculate
              </p>
              <p className="text-xs text-zinc-600 mt-1">
                The dashboard will adapt based on your demographic —
                prioritizing the most relevant agent analysis
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
