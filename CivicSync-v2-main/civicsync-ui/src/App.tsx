import { useState, useCallback } from "react";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { AgentDeliberationWorkspace } from "@/components/agents/AgentDeliberationWorkspace";
import { PolicyConsensusMap } from "@/components/consensus/PolicyConsensusMap";
import { PersonalImpactCalculator } from "@/components/impact/PersonalImpactCalculator";
import { EthicalAuditPanel } from "@/components/ethics/EthicalAuditPanel";
import { SimulationSandbox } from "@/components/sandbox/SimulationSandbox";
import { StateBillsBrowser } from "@/components/features/StateBillsBrowser";
import { RightsChecker } from "@/components/features/RightsChecker";
import { CrossBillAnalysis } from "@/components/features/CrossBillAnalysis";
import type { SonnetSummary, AgentResult, BillResponse } from "@/types/api";

export default function App() {
  const [activeTab, setActiveTab] = useState("deliberation");
  const [lastSummary, setLastSummary] = useState<SonnetSummary | null>(null);
  const [lastAgentResults, setLastAgentResults] = useState<AgentResult[]>([]);
  const [lastBillResponse, setLastBillResponse] = useState<BillResponse | null>(null);

  const handleSummaryReady = useCallback(
    (summary: unknown, agents: unknown[]) => {
      setLastSummary(summary as SonnetSummary);
      setLastAgentResults(agents.filter(Boolean) as AgentResult[]);
    },
    []
  );

  return (
    <DashboardLayout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      ethicsPanel={
        <EthicalAuditPanel
          billResponse={lastBillResponse}
          agentResults={lastAgentResults}
        />
      }
    >
      {activeTab === "deliberation" && (
        <AgentDeliberationWorkspace onSummaryReady={handleSummaryReady} />
      )}
      {activeTab === "statebills" && <StateBillsBrowser />}
      {activeTab === "rights" && <RightsChecker />}
      {activeTab === "crossbill" && <CrossBillAnalysis />}
      {activeTab === "consensus" && (
        <PolicyConsensusMap agentResults={lastAgentResults} />
      )}
      {activeTab === "impact" && (
        <PersonalImpactCalculator
          summary={lastSummary}
          agentResults={lastAgentResults}
        />
      )}
      {activeTab === "sandbox" && <SimulationSandbox />}
    </DashboardLayout>
  );
}
