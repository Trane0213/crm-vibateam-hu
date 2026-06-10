/**
 * AI Service réteg — KÖZPONTI ARCHITEKTÚRA, NINCS OPENAI HÍVÁS.
 *
 * Ez a fájl kizárólag az agentek típusait, jogosultságait és a hozzáférhető
 * CRM erőforrások listáját definiálja. Prompt rendszer, LLM kliens és chat
 * felület még nem készült.
 *
 * Egy későbbi körben ide kerül:
 *  - OpenAI gateway kliens (Lovable AI Gateway-en keresztül)
 *  - prompt sablonok agentenként
 *  - tool-calling adapterek a CRM resource-okra
 *  - agent futtató (run loop) + audit log
 */

export type AgentId = "crm" | "sales" | "pm";

/** A CRM minden erőforrása, amit agentek olvashatnak/írhatnak. */
export type CrmResource =
  | "companies"
  | "contacts"
  | "leads"
  | "projects"
  | "quotes"
  | "followups"
  | "tasks"
  | "emails"
  | "phone_calls"
  | "meetings"
  | "project_documents"
  | "project_notes";

export type AgentCapability = "read" | "write";

export type AgentDefinition = {
  id: AgentId;
  /** Felhasználónak látható megjelenítési név. */
  name: string;
  /** Egy mondatos szerepleírás (később ebből épül a system prompt). */
  role: string;
  /** Bővebb leírás, hogy a felhasználó értse, mire való. */
  description: string;
  /** Resource → engedélyezett műveletek. Ha egy resource nincs felsorolva,
   *  az agent nem férhet hozzá. */
  capabilities: Partial<Record<CrmResource, AgentCapability[]>>;
};

/** Központi agent regisztráció — később a futtató ezt olvassa. */
export const AGENTS: Record<AgentId, AgentDefinition> = {
  crm: {
    id: "crm",
    name: "CRM Asszisztens",
    role: "Általános CRM asszisztens — keres, összegez, riportol.",
    description:
      "Cégek, kapcsolattartók, leadek, projektek, ajánlatok, follow-upok, " +
      "feladatok és kommunikáció (email/hívás/találkozó) olvasása, " +
      "kereshetőség, gyors összesítések, riportok.",
    capabilities: {
      companies: ["read"],
      contacts: ["read"],
      leads: ["read"],
      projects: ["read"],
      quotes: ["read"],
      followups: ["read"],
      tasks: ["read"],
      emails: ["read"],
      phone_calls: ["read"],
      meetings: ["read"],
      project_documents: ["read"],
      project_notes: ["read"],
    },
  },
  sales: {
    id: "sales",
    name: "Értékesítő Agent",
    role: "Értékesítési ciklus támogatása — lead → ajánlat → megnyert/elveszett.",
    description:
      "Új leadek minősítése, ajánlat-állapotok követése, follow-up javaslatok, " +
      "értékesítési pipeline elemzése.",
    capabilities: {
      companies: ["read"],
      contacts: ["read"],
      leads: ["read", "write"],
      projects: ["read"],
      quotes: ["read", "write"],
      followups: ["read", "write"],
      emails: ["read"],
      phone_calls: ["read"],
      meetings: ["read"],
    },
  },
  pm: {
    id: "pm",
    name: "Projektvezető Agent",
    role: "Projekt-végrehajtás támogatása — határidők, feladatok, dokumentáció.",
    description:
      "Projektek státusza, kapcsolódó feladatok, határidők, dokumentumok, " +
      "jegyzetek kezelése. Időbeli kockázatok jelzése.",
    capabilities: {
      companies: ["read"],
      contacts: ["read"],
      projects: ["read", "write"],
      tasks: ["read", "write"],
      followups: ["read", "write"],
      meetings: ["read", "write"],
      project_documents: ["read"],
      project_notes: ["read", "write"],
    },
  },
};

/** Segéd: ki van-e nyitva egy adott (agent, resource, action) hármas? */
export function canAgent(agentId: AgentId, resource: CrmResource, action: AgentCapability): boolean {
  const agent = AGENTS[agentId];
  if (!agent) return false;
  const caps = agent.capabilities[resource];
  if (!caps) return false;
  return caps.includes(action);
}

/** Segéd: agent által elérhető resource-ok listája (UI-hoz). */
export function listAgentResources(agentId: AgentId): CrmResource[] {
  const agent = AGENTS[agentId];
  if (!agent) return [];
  return Object.keys(agent.capabilities) as CrmResource[];
}

/** PLACEHOLDER — későbbi futtató belépési pontja.
 *  Most szándékosan dob, hogy egyetlen kódhely se hívja véletlenül LLM-mel. */
export async function runAgent(_args: {
  agentId: AgentId;
  userPrompt: string;
  context?: Record<string, unknown>;
}): Promise<never> {
  throw new Error(
    "AI futtató még nincs bekötve. Jelen körben csak az architektúra készült el.",
  );
}