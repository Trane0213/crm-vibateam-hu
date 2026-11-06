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
  | "select-lead-source"
  | "none";

export type NextStep = {
  id:
    | "handoff-done"
    | "needs-contact"
    | "needs-email-address"
    | "needs-lead-source"
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
    | "lead-source"
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
  const { contacts, meta } = input;
  const hasContact = contacts.length > 0;
  const primaryEmail = contacts[0]?.email?.trim() ?? "";
  const hasEmail = !!primaryEmail;

  if (meta.status === "handoff") {
    return {
      id: "handoff-done",
      tone: "done",
      title: "Átadva a Sales-előkészítésbe",
      description: meta.statusDate
        ? `Mentett marketingállapot: átadva (${meta.statusDate}). Az ügy a kijelölt értékesítő Sales-előkészítéséhez tartozik; a Pipeline-ba léptetés külön Sales-művelet.`
        : "Mentett marketingállapot: átadva. Az ügy a kijelölt értékesítő Sales-előkészítéséhez tartozik; a Pipeline-ba léptetés külön Sales-művelet.",
      primary: meta.handoffLeadId
        ? { label: "Átadott ügy megnyitása", action: "open-lead" }
        : { label: "Folyamat lezárva", action: "none" },
      why: ["Marketing státusz: Átadva sales-nek"],
    };
  }

  if (!hasContact) {
    return {
      id: "needs-contact",
      tone: "action",
      title: "Kapcsolattartó felvétele szükséges",
      description: "A felület előkészítési sorrendjében először a kapcsolattartót rögzítsd. Ez még nem hoz létre Sales-ügyet.",
      primary: { label: "Kapcsolattartó hozzáadása", action: "add-contact", targetTab: "contacts" },
      why: ["Nincs kapcsolattartó rögzítve a céghez"],
    };
  }

  if (!hasEmail) {
    return {
      id: "needs-email-address",
      tone: "action",
      title: "Email cím hiányzik a kapcsolattartónál",
      description: `${primaryName(contacts)} adatlapján nincs email cím. Email küldéshez ajánlott megadni.`,
      primary: { label: "Kapcsolattartó szerkesztése", action: "edit-contact", targetTab: "contacts" },
      why: ["Az elsődleges kapcsolattartónak nincs email címe"],
    };
  }

  if (!meta.leadSource) {
    return {
      id: "needs-lead-source",
      tone: "action",
      title: "Lead érkezési csatorna megjelölése szükséges",
      description: "Válaszd ki, honnan érkezett az érdeklődés. A csatorna mentése még nem adja át az ügyet a Salesnek.",
      primary: { label: "Csatorna kiválasztása", action: "select-lead-source" },
      secondary: { label: "Email küldése (opcionális)", action: "send-email" },
      why: ["Még nincs megjelölt érkezési csatorna"],
    };
  }

  if (meta.status === "new") {
    return {
      id: "needs-qualification",
      tone: "progress",
      title: "Minősítés folyamatban",
      description: 'Csatorna megjelölve. Ha a kapcsolattartóval párbeszéd indult, jelöld „Kapcsolatban" állapotra.',
      primary: { label: "Megjelölés: Kapcsolatban", action: "mark-contacted" },
      secondary: { label: "Email szálak átnézése", action: "open-emails", targetTab: "emails" },
      why: ["Csatorna ki van választva", 'Státusz még „Új"'],
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
    title: "Sales-átadás előkészítése",
    description: "Nyisd meg az átadás ellenőrzését: összefoglaló, csatorna, felelős és meglévő nyitott ügyek. Az átadás csak a megerősítő gombbal történik; email nem indul.",
    primary: { label: "Átadás ellenőrzése", action: "open-handoff" },
    secondary: { label: "Jegyzet ellenőrzése", action: "write-sales-note", targetTab: "sales-note" },
    why: [
      "Van kapcsolattartó",
      "Érkezési csatorna ki van választva",
      meta.salesNote ? "Sales jegyzet kész" : "Státusz: Átadható",
    ],
  };
}

export function computeChecklist(input: WorkflowInput): ChecklistItem[] {
  const { company, contacts, meta } = input;
  const hasContact = contacts.length > 0;
  const primaryEmail = contacts[0]?.email?.trim() ?? "";
  const hasEmail = !!primaryEmail;
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
      id: "lead-source",
      label: "Lead érkezési csatorna megjelölve",
      done: !!meta.leadSource,
      action: !meta.leadSource && !handed ? { label: "Megjelölés", action: "select-lead-source" } : undefined,
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