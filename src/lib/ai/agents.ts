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
  | "company_documents"
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
    name: "George – CRM Navigátor",
    role: "Segít eligibálni a rendszerben — megkeresi az adatokat, megmutatja hol vannak.",
    description:
      "Ha nem tudod hol keress valamit a CRM-ben, kérdezd George-ot. " +
      "Megtalál cégeket, projekteket, ajánlatokat, kapcsolattartókat, " +
      "és gyorsan összegzi, mi tartozik egymáshoz.",
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
      company_documents: ["read"],
      project_notes: ["read"],
    },
  },
  sales: {
    id: "sales",
    name: "Timothy – Értékesítési Segítő",
    role: "Az értékesítésben segít — leadek, ajánlatok, utókövetések.",
    description:
      "Megmondja kit kell ma hívni, mely ajánlatok állnak régóta, " +
      "mely leadekkel érdemes foglalkozni, és napi értékesítési riportot készít.",
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
      company_documents: ["read"],
    },
  },
  pm: {
    id: "pm",
    name: "Boss – Projektfelügyelő",
    role: "A projektek vezetésében segít — határidők, feladatok, kockázatok.",
    description:
      "Megmutatja mely projektek vannak veszélyben, mi a mai feladat, " +
      "milyen határidő közeleg, és melyik projektnél hiányzik dokumentum.",
    capabilities: {
      companies: ["read"],
      contacts: ["read"],
      projects: ["read", "write"],
      tasks: ["read", "write"],
      followups: ["read", "write"],
      meetings: ["read", "write"],
      project_documents: ["read"],
      company_documents: ["read"],
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