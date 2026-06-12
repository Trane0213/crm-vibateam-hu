/**
 * AI Agent regisztráció a láthatósági mátrixhoz.
 *
 * Itt szerepel minden ismert agent — akkor is, ha még nincs hozzá futtató
 * (pl. Scarlet). Az admin felület ezt listázza a Settings → AI agentek oldalon.
 *
 * Az `agent_id` érték = az `agent_role_access.agent_id` text mező.
 * George (crm) speciális: a frontend mindig láthatóként kezeli.
 */

export type RegisteredAgent = {
  id: string;
  name: string;
  short: string;
  description: string;
  /** Ha igaz, a frontend minden szerepkör számára láthatóként mutatja. */
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
];

export const ALWAYS_VISIBLE_AGENT_IDS = new Set(
  AGENT_REGISTRY.filter((a) => a.alwaysVisible).map((a) => a.id),
);