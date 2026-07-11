/**
 * AI OS — Acceptance Test típusok (AI-1.8).
 *
 * Statikus, LLM-mentes ellenőrzések: az agent + tool + jogosultsági
 * konfiguráció megfelel-e a dokumentált szerepköröknek.
 *
 * Cél: minden CI-futáskor bizonyítani, hogy egy refaktor nem törte el
 * a szerepkör-határokat (pl. Timothy hirtelen dokumentumokhoz jut,
 * George megkapja a memory_write-ot, Michael elveszti az ads.google
 * domaint). NEM futtat LLM-et, nem hív külső API-t, determinisztikus.
 *
 * Bővíthető végrehajtható LLM-tesztekkel későbbi sprintben, ugyanezen
 * fixture-fájlok fölé építve.
 */

export type AgentAcceptance = {
  agent: string;
  role_summary: string;

  required_domains?: string[];
  forbidden_domains?: string[];
  required_tools?: string[];
  forbidden_tools?: string[];
  required_prompt_phrases?: string[];

  /** Csak `is_orchestrator` agentnél. Pontosan ezek a célok engedélyezettek. */
  expected_handoff_targets?: string[];

  business_scenarios?: BusinessScenario[];
};

export type BusinessScenario = {
  id: string;
  title: string;
  user_prompt: string;
  expected_tools: string[];
  required_data_sources?: string[];
  expected_behavior?: string;
  notes?: string;
};

export type AcceptanceIssue = {
  agent: string;
  severity: "error" | "warn";
  message: string;
  scenario?: string;
};

export type AcceptanceReport = {
  ok: boolean;
  totals: {
    agents: number;
    scenarios: number;
    errors: number;
    warnings: number;
  };
  issues: AcceptanceIssue[];
};
