/**
 * AI OS — UI agent metadata és láthatóság.
 *
 * UI-szintű regisztráció (Settings → AI agent láthatóság, AgentGate).
 * Az agent futtatása az AI OS runtime-on történik (`src/lib/ai-os/agents.ts`),
 * itt csak a megjelenítéshez szükséges adatok élnek.
 */

export type RegisteredAgent = {
  id: string;
  name: string;
  short: string;
  description: string;
  /** Ha igaz, minden szerepkör látja. */
  alwaysVisible?: boolean;
};

export const AGENT_REGISTRY: RegisteredAgent[] = [
  {
    id: "crm",
    name: "George",
    short: "CRM Navigátor",
    description: "Minden szerepkör számára elérhető navigátor — adatkeresés a CRM-ben.",
    alwaysVisible: true,
  },
  {
    id: "sales",
    name: "Timothy",
    short: "Értékesítési Segítő",
    description: "Leadek, ajánlatok, utókövetések — sales fókuszú támogatás.",
  },
  {
    id: "pm",
    name: "Boss",
    short: "Projektfelügyelő",
    description: "Projektek, határidők, kockázatok — projektvezetői támogatás.",
  },
  {
    id: "marketing",
    name: "Scarlet",
    short: "Marketing Stratéga",
    description: "Piackutatás és marketing stratégia — marketing csapatnak.",
  },
  {
    id: "ads",
    name: "Michael",
    short: "Google Ads Specialista",
    description: "Google Ads elemző és tanácsadó — kizárólag Tulajdonos szerepkör számára látható.",
  },
];

export const ALWAYS_VISIBLE_AGENT_IDS = new Set(
  AGENT_REGISTRY.filter((a) => a.alwaysVisible).map((a) => a.id),
);