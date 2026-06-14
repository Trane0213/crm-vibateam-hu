/**
 * Marketing workflow — determinisztikus „következő teendő" számítás.
 *
 * Tisztán pure függvények: nincs DB hívás, nincs side effect. Bemenet a
 * már lekért cég / kontaktok / email szálak + a `readMarketingMeta` által
 * dekódolt marketing állapot. Kimenet a UI-nak fogyasztható lépés-leírás
 * és a folyamat-checklist.
 */

import type { MarketingMeta, MarketingStatus } from "./marketing-status";

export type StepTone = "info" | "action" | "progress" | "ready" | "done";
export type StepActionKind =
  | "add-contact"
  | "edit-contact"
  | "send-email"
  | "open-emails"
  | "mark-contacted"
  | "write-sales-note"
  | "open-handoff"
  | "open-lead"
  | "none";

export type NextStep = {
  id:
    | "handoff-done"
    | "needs-contact"
    | "needs-email-address"
    | "needs-first-email"
    | "needs-qualification"
    | "needs-sales-note"
    | "ready-handoff";
  tone: StepTone;
  title: string;
  description: string;
  primary: { label: string; action: StepActionKind; targetTab?: string };
  secondary?: { label: string; action: StepActionKind; targetTab?: string };
  why: string[];
};

export type ChecklistItem = {
  id:
    | "company"
    | "contact"
    | "contact-email"
    | "first-email"
    | "sales-note"
    | "handoff";
  label: string;
  done: boolean;
  hint?: string;
  action?: { label: string; action: StepActionKind; targetTab?: string };
};

export type WorkflowInput = {
  company: { name: string; created_at?: string | null } | null | undefined;
  contacts: Array<{ id: string; name?: string | null; email?: string | null }>;
  threadCount: number;
  meta: MarketingMeta;
};

function primaryName(contacts: WorkflowInput["contacts"]): string {
  const p = contacts[0];
  return p?.name?.trim() || p?.email || "a kapcsolattartó";
}

/** Sorrendben kiértékelt szabályrendszer — első igaz ág nyer. */
export function computeNextStep(input: WorkflowInput): NextStep {
  const { contacts, threadCount, meta } = input;
  const hasContact = contacts.length > 0;
  const primaryEmail = contacts[0]?.email?.trim() ?? "";
  const hasEmail = !!primaryEmail;

  if (meta.status === "handoff") {
    return {
      id: "handoff-done",
      tone: "done",
      title: "Átadva sales-nek",
      description: meta.statusDate
        ? `A cég ${meta.statusDate}-én átkerült a sales pipeline-ba. A marketing minősítés lezárult.`
        : "A cég átkerült a sales pipeline-ba. A marketing minősítés lezárult.",
      primary: meta.handoffLeadId
        ? { label: "Lead megnyitása", action: "open-lead" }
        : { label: "Folyamat lezárva", action: "none" },
      why: ["Marketing státusz: Átadva sales-nek"],
    };
  }

  if (!hasContact) {
    return {
      id: "needs-contact",
      tone: "action",
      title: "Kapcsolattartó felvétele szükséges",
      description: "A salesnek átadáshoz legalább egy kapcsolattartó kell. Vegyél fel egyet a Kapcsolattartók fülön.",
      primary: { label: "Kapcsolattartó hozzáadása", action: "add-contact", targetTab: "contacts" },
      why: ["Nincs kapcsolattartó rögzítve a céghez"],
    };
  }

  if (!hasEmail) {
    return {
      id: "needs-email-address",
      tone: "action",
      title: "Email cím hiányzik a kapcsolattartónál",
      description: `${primaryName(contacts)} adatlapján nincs email cím. Email küldéshez és átadáshoz szükséges.`,
      primary: { label: "Kapcsolattartó szerkesztése", action: "edit-contact", targetTab: "contacts" },
      why: ["Az elsődleges kapcsolattartónak nincs email címe"],
    };
  }

  if (threadCount === 0) {
    return {
      id: "needs-first-email",
      tone: "action",
      title: "Első kapcsolatfelvétel szükséges",
      description: `Küldj bemutatkozó emailt ${primaryName(contacts)} részére. Az elküldött szál automatikusan ide kerül.`,
      primary: { label: "Email küldése", action: "send-email" },
      secondary: { label: "Email szálak megnyitása", action: "open-emails", targetTab: "emails" },
      why: ["Még nem indult email szál ezzel a céggel"],
    };
  }

  if (meta.status === "new") {
    return {
      id: "needs-qualification",
      tone: "progress",
      title: "Minősítés folyamatban",
      description: 'Már elindult a kommunikáció. Ha a kapcsolattartó válaszolt és párbeszéd indult, jelöld „Kapcsolatban" állapotra.',
      primary: { label: "Megjelölés: Kapcsolatban", action: "mark-contacted" },
        secondary: { label: "Email szálak átnézése", action: "open-emails", targetTab: "emails" },
      why: ["Van email aktivitás", 'Státusz még „Új"'],
    };
  }

  if (meta.status === "contacted" && !meta.salesNote) {
    return {
      id: "needs-sales-note",
      tone: "action",
      title: "Jegyzet a salesnek szükséges",
      description: "Foglald össze 2-3 mondatban a sales számára: mire keresnek partnert, ki a döntéshozó, mikor érdemes hívni.",
      primary: { label: "Jegyzet írása", action: "write-sales-note", targetTab: "sales-note" },
      why: ["Van kapcsolat", "Még nincs salesnek szánt jegyzet"],
    };
  }

  // contacted + salesNote, vagy qualified → minden megvan, átadható.
  return {
    id: "ready-handoff",
    tone: "ready",
    title: "Átadható sales-nek",
    description: "Minden adat megvan: kapcsolattartó, email aktivitás és sales jegyzet. Hozz létre leadet és add át.",
    primary: { label: "Saleshez átadás", action: "open-handoff" },
    secondary: { label: "Jegyzet ellenőrzése", action: "write-sales-note", targetTab: "sales-note" },
    why: [
      "Van kapcsolattartó email címmel",
      "Volt email aktivitás",
      meta.salesNote ? "Sales jegyzet kész" : "Státusz: Átadható",
    ],
  };
}

export function computeChecklist(input: WorkflowInput): ChecklistItem[] {
  const { company, contacts, threadCount, meta } = input;
  const hasContact = contacts.length > 0;
  const primaryEmail = contacts[0]?.email?.trim() ?? "";
  const hasEmail = !!primaryEmail;
  const hasThread = threadCount > 0;
  const hasSalesNote = !!meta.salesNote;
  const handed = meta.status === "handoff";

  return [
    {
      id: "company",
      label: "Cég adatok kitöltve",
      done: !!company?.name,
    },
    {
      id: "contact",
      label: hasContact ? `Kapcsolattartó felvéve (${contacts.length})` : "Kapcsolattartó felvéve",
      done: hasContact,
      action: hasContact ? undefined : { label: "Hozzáadás", action: "add-contact", targetTab: "contacts" },
    },
    {
      id: "contact-email",
      label: "Email cím a kapcsolattartónál",
      done: hasContact && hasEmail,
      action: hasContact && !hasEmail ? { label: "Szerkesztés", action: "edit-contact", targetTab: "contacts" } : undefined,
    },
    {
      id: "first-email",
      label: hasThread ? `Email aktivitás (${threadCount} szál)` : "Első email elküldve",
      done: hasThread,
      action: hasContact && hasEmail && !hasThread ? { label: "Küldés", action: "send-email" } : undefined,
    },
    {
      id: "sales-note",
      label: "Jegyzet sales-nek",
      done: hasSalesNote,
      action: !hasSalesNote && !handed ? { label: "Megírom", action: "write-sales-note", targetTab: "sales-note" } : undefined,
    },
    {
      id: "handoff",
      label: "Saleshez átadva",
      done: handed,
      hint: handed && meta.statusDate ? meta.statusDate : undefined,
    },
  ];
}

/** Jelenlegi marketing státusz megjelenítéshez — UI nem kötelező, de hasznos. */
export function statusOf(meta: MarketingMeta): MarketingStatus {
  return meta.status;
}