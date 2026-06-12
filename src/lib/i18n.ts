/**
 * Központi magyar megjelenítési szótár.
 *
 * Cél: minden felhasználói felületen megjelenő angol CRM szakkifejezés
 * egységes, közérthető magyar formában jelenjen meg. A DB enum értékek
 * (pl. "qualified", "open", "in_progress") változatlanok maradnak — csak
 * a megjelenítést fordítjuk.
 *
 * Használat:
 *   import { t, tStatus } from "@/lib/i18n";
 *   t("lead")              // "Érdeklődő"
 *   tStatus("lead", "new") // "Új"
 */

const DICT = {
  // Domain főnevek
  lead: "Érdeklődő",
  leads: "Érdeklődők",
  followup: "Utókövetés",
  followups: "Utókövetések",
  task: "Feladat",
  tasks: "Feladatok",
  opportunity: "Lehetőség",
  pipeline: "Értékesítési folyamat",
  contact: "Kapcsolattartó",
  contacts: "Kapcsolattartók",
  company: "Cég",
  companies: "Cégek",
  customer: "Ügyfél",
  customers: "Ügyfelek",
  quote: "Ajánlat",
  quotes: "Ajánlatok",
  project: "Projekt",
  projects: "Projektek",
  status: "Állapot",
  priority: "Prioritás",
  dashboard: "Vezérlőpult",

  // Műveletek
  create: "Létrehozás",
  save: "Mentés",
  cancel: "Mégse",
  delete: "Törlés",
  edit: "Szerkesztés",
  search: "Keresés",
  open: "Megnyitás",
  close: "Bezárás",
  add: "Hozzáadás",

  // Ügynöknevek
  "agent.marven": "Marven – CRM Navigátor",
  "agent.sales": "Értékesítési Segítő",
  "agent.marketing": "Marketing Segítő",
  "agent.pm": "Projektsegítő",
} as const;

export type I18nKey = keyof typeof DICT;

export function t(key: I18nKey): string {
  return DICT[key];
}

/** Státusz badge címkék. A kulcs a DB enum érték, az érték a magyar label. */
const STATUS: Record<string, Record<string, string>> = {
  lead: {
    new: "Új",
    contacted: "Felvettük a kapcsolatot",
    qualified: "Minősített",
    proposal_sent: "Ajánlat elküldve",
    negotiation: "Tárgyalás alatt",
    converted: "Konvertált",
    won: "Megnyert",
    lost: "Elvesztett",
  },
  task: {
    open: "Nyitott",
    todo: "Teendő",
    in_progress: "Folyamatban",
    blocked: "Akadályozott",
    completed: "Kész",
    done: "Kész",
    cancelled: "Törölve",
  },
  quote: {
    draft: "Vázlat",
    sent: "Elküldve",
    negotiation: "Tárgyalás alatt",
    won: "Megnyert",
    accepted: "Elfogadva",
    rejected: "Elutasítva",
    expired: "Lejárt",
    archived: "Archivált",
  },
  priority: {
    low: "Alacsony",
    normal: "Normál",
    high: "Magas",
    urgent: "Sürgős",
  },
};

export function tStatus(domain: keyof typeof STATUS, value: string | null | undefined): string {
  if (!value) return "—";
  return STATUS[domain]?.[value] ?? value;
}