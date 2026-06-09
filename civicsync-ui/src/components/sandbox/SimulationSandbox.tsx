import { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  SlidersHorizontal,
  Play,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Zap,
  Pause,
} from "lucide-react";
import { cn, getAgentColor } from "@/lib/utils";
import { summarizeBill } from "@/lib/api";
import type { AgentId, BillInfo } from "@/types/api";
import { fetchBills } from "@/lib/api";

interface PolicySlider {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  defaultValue: number;
  value: number;
  unit: string;
  description: string;
}

interface AgentReaction {
  agentId: AgentId;
  label: string;
  icon: string;
  reaction: string;
  sentiment: "positive" | "negative" | "neutral";
  delta: string;
  isUpdating: boolean;
}

const DEFAULT_SLIDERS: PolicySlider[] = [
  {
    id: "tax_rate",
    label: "Tax Rate Adjustment",
    min: -5,
    max: 5,
    step: 0.5,
    defaultValue: 0,
    value: 0,
    unit: "%",
    description: "Change in effective tax rate for MSMEs",
  },
  {
    id: "compliance_window",
    label: "Compliance Window",
    min: 30,
    max: 365,
    step: 15,
    defaultValue: 90,
    value: 90,
    unit: "days",
    description: "Time given for enterprises to comply",
  },
  {
    id: "digital_mandate",
    label: "Digital Filing Mandate",
    min: 0,
    max: 100,
    step: 10,
    defaultValue: 50,
    value: 50,
    unit: "% coverage",
    description: "Percentage of transactions requiring digital filing",
  },
  {
    id: "penalty_cap",
    label: "Maximum Penalty",
    min: 10000,
    max: 500000,
    step: 10000,
    defaultValue: 100000,
    value: 100000,
    unit: "₹",
    description: "Maximum fine for non-compliance",
  },
];

function generateReactions(sliders: PolicySlider[]): AgentReaction[] {
  const taxDelta = sliders[0].value - sliders[0].defaultValue;
  const complianceDays = sliders[1].value;
  const digitalPct = sliders[2].value;
  const penaltyCap = sliders[3].value;

  return [
    {
      agentId: "economist",
      label: "Economist",
      icon: "📊",
      reaction:
        taxDelta > 0
          ? `+${taxDelta}% tax rate increases government revenue by ₹${(taxDelta * 2400).toFixed(0)} Cr but may reduce MSME formation by ${(taxDelta * 3).toFixed(0)}%.`
          : taxDelta < 0
          ? `${taxDelta}% tax cut stimulates ${(Math.abs(taxDelta) * 1.8).toFixed(0)}% MSME growth but creates ₹${(Math.abs(taxDelta) * 2400).toFixed(0)} Cr revenue gap.`
          : "No change to baseline fiscal projections. Current tax equilibrium maintained.",
      sentiment: taxDelta <= 0 ? "positive" : taxDelta > 2 ? "negative" : "neutral",
      delta:
        taxDelta !== 0
          ? `${taxDelta > 0 ? "+" : ""}${taxDelta}% tax impact`
          : "No change",
      isUpdating: false,
    },
    {
      agentId: "social_worker",
      label: "Social Advocate",
      icon: "🤝",
      reaction:
        complianceDays >= 180
          ? `${complianceDays}-day window is generous. Gives NGOs time to onboard informal sector workers. Strong support for vulnerable groups.`
          : complianceDays >= 90
          ? `${complianceDays}-day window is adequate for organized sector but tight for rural informal workers. Recommend parallel outreach.`
          : `WARNING: ${complianceDays}-day window is too short. Vulnerable groups — migrants, daily wage workers — will not have time to comply.`,
      sentiment:
        complianceDays >= 180
          ? "positive"
          : complianceDays >= 90
          ? "neutral"
          : "negative",
      delta: `${complianceDays} day window`,
      isUpdating: false,
    },
    {
      agentId: "rural_specialist",
      label: "Rural Specialist",
      icon: "🌾",
      reaction:
        digitalPct <= 30
          ? `${digitalPct}% digital mandate is achievable. Rural offices can handle remaining ${100 - digitalPct}% on paper. Inclusion preserved.`
          : digitalPct <= 60
          ? `${digitalPct}% digital mandate creates a two-tier system. Rural CSCs will be overwhelmed. Need ₹${(digitalPct * 8).toFixed(0)} Cr for rural digital infrastructure.`
          : `CRITICAL: ${digitalPct}% digital mandate excludes estimated 43% of rural population. This is a digital divide accelerator.`,
      sentiment:
        digitalPct <= 30 ? "positive" : digitalPct <= 60 ? "neutral" : "negative",
      delta: `${digitalPct}% digital coverage`,
      isUpdating: false,
    },
  ];
}

export function SimulationSandbox({ className }: { className?: string }) {
  const [sliders, setSliders] = useState<PolicySlider[]>(DEFAULT_SLIDERS);
  const [reactions, setReactions] = useState<AgentReaction[]>(
    generateReactions(DEFAULT_SLIDERS)
  );
  const [isSimulating, setIsSimulating] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bills, setBills] = useState<Record<string, BillInfo>>({});
  const [selectedBill, setSelectedBill] = useState("");
  const [sandboxQuery, setSandboxQuery] = useState("What is the impact of this reform?");

  useEffect(() => {
    fetchBills().then((data) => {
      setBills(data);
      const keys = Object.keys(data);
      if (keys.length > 0) setSelectedBill(keys[0]);
    }).catch(() => {});
  }, []);

  const handleSliderChange = useCallback(
    (id: string, value: number) => {
      const updated = sliders.map((s) =>
        s.id === id ? { ...s, value } : s
      );
      setSliders(updated);

      setReactions((prev) =>
        prev.map((r) => ({ ...r, isUpdating: true }))
      );

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        setReactions(
          generateReactions(updated).map((r) => ({
            ...r,
            isUpdating: false,
          }))
        );
      }, 600);
    },
    [sliders]
  );

  const runSimulation = useCallback(async () => {
    setIsSimulating(true);
    setReactions((prev) => prev.map((r) => ({ ...r, isUpdating: true })));

    if (selectedBill && sandboxQuery.trim()) {
      try {
        const queryWithSliders = `${sandboxQuery} (Context: tax adjustment ${sliders[0].value}%, compliance window ${sliders[1].value} days, digital mandate ${sliders[2].value}%, penalty cap ₹${sliders[3].value})`;
        const resp = await summarizeBill({
          bill: selectedBill,
          query: queryWithSliders,
        });
        const summaryText = resp.summary.tl_dr;
        setReactions((prev) =>
          prev.map((r, i) => ({
            ...r,
            isUpdating: false,
            reaction: i === 0
              ? `API analysis: ${summaryText}. Fiscal note: Tax adjustment of ${sliders[0].value}% modeled.`
              : i === 1
              ? `Policy impact on vulnerable groups: ${resp.summary.purpose}. Compliance window: ${sliders[1].value} days.`
              : `Rural impact: ${resp.summary.persona_impacts?.[0]?.concrete_impact ?? "Digital mandate at " + sliders[2].value + "% may affect rural populations."}`,
          }))
        );
      } catch {
        setReactions(
          generateReactions(sliders).map((r) => ({ ...r, isUpdating: false }))
        );
      }
    } else {
      setTimeout(() => {
        setReactions(
          generateReactions(sliders).map((r) => ({ ...r, isUpdating: false }))
        );
      }, 800);
    }

    setIsSimulating(false);
  }, [sliders, selectedBill, sandboxQuery]);

  const resetSliders = useCallback(() => {
    setSliders(DEFAULT_SLIDERS);
    setReactions(generateReactions(DEFAULT_SLIDERS));
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            <SlidersHorizontal className="h-5 w-5 text-purple-400" />
            Simulation Sandbox
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tweak policy parameters and watch all agents update their reasoning
            in real-time
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={resetSliders}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 border border-zinc-800 hover:border-zinc-700 transition-all"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </button>
          <button
            onClick={runSimulation}
            disabled={isSimulating}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-all",
              isSimulating
                ? "bg-purple-900/30 text-purple-400 cursor-not-allowed"
                : "bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:shadow-lg hover:shadow-purple-500/20"
            )}
          >
            {isSimulating ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {isSimulating ? "Simulating..." : "Run Simulation"}
          </button>
        </div>
      </div>

      {/* Bill + Query Selector */}
      <div className="glass-panel rounded-xl p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
            Legislation
          </label>
          <select
            value={selectedBill}
            onChange={(e) => setSelectedBill(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2 focus:outline-none focus:border-purple-500/50"
          >
            {Object.entries(bills).map(([key, info]) => (
              <option key={key} value={key}>
                {info.display_name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
            Base Question
          </label>
          <input
            type="text"
            value={sandboxQuery}
            onChange={(e) => setSandboxQuery(e.target.value)}
            className="w-full rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs px-3 py-2 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/50"
            placeholder="e.g. What is the impact of this reform?"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Policy Sliders */}
        <div className="glass-panel rounded-xl p-5 space-y-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-300">
            <Zap className="h-4 w-4 text-purple-400" />
            Policy Parameters
          </div>

          {sliders.map((slider) => {
            const isModified = slider.value !== slider.defaultValue;
            return (
              <div key={slider.id} className="space-y-2">
                <div className="flex justify-between items-baseline">
                  <label className="text-xs text-zinc-300 font-medium">
                    {slider.label}
                  </label>
                  <span
                    className={cn(
                      "text-sm font-display font-bold",
                      isModified ? "text-purple-400" : "text-zinc-400"
                    )}
                  >
                    {slider.unit === "₹"
                      ? `₹${slider.value.toLocaleString()}`
                      : `${slider.value}${slider.unit}`}
                  </span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={slider.value}
                  onChange={(e) =>
                    handleSliderChange(slider.id, Number(e.target.value))
                  }
                  className="w-full accent-purple-500 h-1.5"
                />
                <div className="flex justify-between text-[9px] text-zinc-600">
                  <span>
                    {slider.unit === "₹"
                      ? `₹${slider.min.toLocaleString()}`
                      : `${slider.min}${slider.unit}`}
                  </span>
                  <span className="text-zinc-500">{slider.description}</span>
                  <span>
                    {slider.unit === "₹"
                      ? `₹${slider.max.toLocaleString()}`
                      : `${slider.max}${slider.unit}`}
                  </span>
                </div>
                {isModified && (
                  <div className="flex items-center gap-1 text-[10px] text-purple-400">
                    <div className="h-1 w-1 rounded-full bg-purple-400" />
                    Modified from default (
                    {slider.unit === "₹"
                      ? `₹${slider.defaultValue.toLocaleString()}`
                      : `${slider.defaultValue}${slider.unit}`}
                    )
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Agent Reactions */}
        <div className="space-y-3">
          <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">
            Live Agent Reactions
          </div>

          <AnimatePresence mode="popLayout">
            {reactions.map((reaction) => (
              <motion.div
                key={reaction.agentId}
                layout
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                className={cn(
                  "glass-panel rounded-xl p-4 transition-all duration-300",
                  reaction.isUpdating && "opacity-60"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <span className="text-lg">{reaction.icon}</span>
                      {reaction.isUpdating && (
                        <motion.div
                          className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-purple-400"
                          animate={{ scale: [1, 1.3, 1] }}
                          transition={{ duration: 0.6, repeat: Infinity }}
                        />
                      )}
                    </div>
                    <span
                      className="text-xs font-semibold"
                      style={{ color: getAgentColor(reaction.agentId) }}
                    >
                      {reaction.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {reaction.sentiment === "positive" ? (
                      <TrendingUp className="h-3 w-3 text-emerald-400" />
                    ) : reaction.sentiment === "negative" ? (
                      <TrendingDown className="h-3 w-3 text-rose-400" />
                    ) : null}
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-2 py-0.5 rounded-full",
                        reaction.sentiment === "positive"
                          ? "bg-emerald-500/10 text-emerald-400"
                          : reaction.sentiment === "negative"
                          ? "bg-rose-500/10 text-rose-400"
                          : "bg-zinc-800 text-zinc-400"
                      )}
                    >
                      {reaction.delta}
                    </span>
                  </div>
                </div>

                {reaction.isUpdating ? (
                  <div className="space-y-1.5">
                    <div className="shimmer h-3 w-full rounded" />
                    <div className="shimmer h-3 w-4/5 rounded" />
                  </div>
                ) : (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-zinc-400 leading-relaxed"
                  >
                    {reaction.reaction}
                  </motion.p>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
