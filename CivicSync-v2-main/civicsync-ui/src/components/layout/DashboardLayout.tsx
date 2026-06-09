import { type ReactNode, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  BarChart3,
  Users,
  Shield,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  Activity,
  Scale,
  GitBranch,
  Library,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchHealth, type HealthResponse } from "@/lib/api";

interface DashboardLayoutProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: ReactNode;
  ethicsPanel: ReactNode;
}

const NAV_ITEMS = [
  {
    id: "deliberation",
    label: "Deliberation",
    icon: Brain,
    description: "Agent Team Workspace",
  },
  {
    id: "statebills",
    label: "State Bills",
    icon: Library,
    description: "Browse state legislation",
  },
  {
    id: "rights",
    label: "Rights",
    icon: Scale,
    description: "Rights checker",
  },
  {
    id: "crossbill",
    label: "Cross-bill",
    icon: GitBranch,
    description: "Conflicts & overlaps",
  },
  {
    id: "consensus",
    label: "Consensus",
    icon: Users,
    description: "Policy Opinion Map",
  },
  {
    id: "impact",
    label: "Impact",
    icon: BarChart3,
    description: "Personal Calculator",
  },
  {
    id: "sandbox",
    label: "Sandbox",
    icon: SlidersHorizontal,
    description: "Simulation Mode",
  },
];

export function DashboardLayout({
  activeTab,
  onTabChange,
  children,
  ethicsPanel,
}: DashboardLayoutProps) {
  const [ethicsOpen, setEthicsOpen] = useState(true);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    fetchHealth().then(setHealth).catch(() => {});
    const id = setInterval(() => {
      fetchHealth().then(setHealth).catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  const billCount = health?.bills_loaded?.length ?? 0;
  const backendOnline = health?.status === "ok";

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A]">
      {/* Left Navigation */}
      <nav className="w-16 flex-shrink-0 glass-panel-strong border-r border-zinc-800/50 flex flex-col items-center py-4 gap-1 z-20">
        {/* Logo */}
        <div className="mb-4 flex flex-col items-center gap-1">
          <div className="h-9 w-9 flex items-center justify-center overflow-hidden rounded-xl bg-zinc-900 shadow-lg border border-zinc-800">
            <img src="/civicsync_icon.png" alt="CivicSync Logo" className="h-full w-full object-cover" />
          </div>
        </div>
        
        {/* Nav Items */}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={cn(
                "group relative flex h-11 w-11 items-center justify-center rounded-xl transition-all duration-200",
                isActive
                  ? "bg-zinc-800 text-white shadow-inner"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50"
              )}
              aria-label={item.label}
            >
              <Icon className="h-4.5 w-4.5" />
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.5 rounded-r-full bg-blue-500"
                />
              )}
              {/* Tooltip */}
              <div className="absolute left-full ml-3 hidden group-hover:flex items-center z-50">
                <div className="glass-panel-strong rounded-lg px-3 py-2 shadow-xl">
                  <p className="text-xs font-semibold text-zinc-100 whitespace-nowrap">
                    {item.label}
                  </p>
                  <p className="text-[10px] text-zinc-500 whitespace-nowrap">
                    {item.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 flex-shrink-0 glass-panel-strong border-b border-zinc-800/50 flex items-center justify-between px-6 z-10">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-base font-bold tracking-tight text-zinc-100">
              CivicSync
            </h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-semibold uppercase tracking-wider">
              CBC Hackathon
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <div
                className={cn(
                  "h-2 w-2 rounded-full",
                  backendOnline
                    ? "bg-emerald-500 presence-pulse"
                    : "bg-zinc-600"
                )}
              />
              <span>
                {backendOnline
                  ? `${billCount} Bills · 5 Agents Ready`
                  : "Connecting to backend…"}
              </span>
            </div>
            <button
              onClick={() => setEthicsOpen(!ethicsOpen)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                ethicsOpen
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700"
              )}
            >
              <Shield className="h-3.5 w-3.5" />
              Ethics Safeguard
              {ethicsOpen ? (
                <ChevronRight className="h-3 w-3" />
              ) : (
                <ChevronLeft className="h-3 w-3" />
              )}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          {/* Workspace */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.25 }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Ethics Sidebar */}
          <AnimatePresence>
            {ethicsOpen && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="flex-shrink-0 overflow-hidden border-l border-zinc-800/50"
              >
                <div className="h-full w-[340px] overflow-y-auto p-4">
                  {ethicsPanel}
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
