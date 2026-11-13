// Sales modul UI konstansok — a backend specifikációval szinkronban.
// Forrás: .lovable/plan.md (Sales Backend v1, 1.2 / 1.4 / 1.5).

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "quote_prep",
  "quote_sent",
  "follow_up",
  "contract",
  "won",
  "lost",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Új",
  contacted: "Kapcsolat alatt",
  quote_prep: "Ajánlat előkészítés",
  quote_sent: "Ajánlat kiadva",
  follow_up: "Utánkövetés",
  contract: "Szerződés",
  won: "Megnyert",
  lost: "Elveszett",
};

// Státusz-színek a közös szemantikus tokenekből (styles.css --status-*).
// Tailwind csak literál osztályneveket ismer fel, ezért nincs osztálygeneráló segédfüggvény.
export const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-muted text-muted-foreground border-border",
  contacted: "bg-[color:var(--status-info)]/12 text-[color:var(--status-info)] border-[color:var(--status-info)]/35",
  quote_prep: "bg-[color:var(--status-warning)]/12 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/35",
  quote_sent: "bg-primary/10 text-primary border-primary/30",
  follow_up: "bg-primary/10 text-primary border-primary/30",
  contract: "bg-[color:var(--status-success)]/12 text-[color:var(--status-success)] border-[color:var(--status-success)]/35",
  won: "bg-[color:var(--status-success)] text-primary-foreground border-[color:var(--status-success)]",
  lost: "bg-destructive/10 text-destructive border-destructive/30",
};

// Engedélyezett státuszváltások — 4. szekció (state machine).
export const STATUS_TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  new: ["contacted", "lost"],
  contacted: ["quote_prep", "follow_up", "lost"],
  quote_prep: ["quote_sent", "lost"],
  quote_sent: ["follow_up", "contract", "lost"],
  follow_up: ["quote_sent", "contract", "lost"],
  contract: ["won", "lost"],
  won: [],
  lost: [],
};

export const NEXT_STEP_TYPES = [
  "phone",
  "email",
  "meeting",
  "site_visit",
  "doc_request",
  "quote_send",
  "follow_up",
  "other",
] as const;
export type NextStepType = (typeof NEXT_STEP_TYPES)[number];

export const NEXT_STEP_LABEL: Record<NextStepType, string> = {
  phone: "Telefon",
  email: "Email",
  meeting: "Találkozó",
  site_visit: "Helyszín",
  doc_request: "Dokumentum",
  quote_send: "Ajánlat",
  follow_up: "Utánkövetés",
  other: "Egyéb",
};

export const LOST_REASONS = [
  "price",
  "chose_competitor",
  "no_response",
  "project_cancelled",
  "deadline_issue",
  "bad_fit",
  "other",
] as const;
export type LostReason = (typeof LOST_REASONS)[number];

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  price: "Ár",
  chose_competitor: "Versenytársat választott",
  no_response: "Nem reagált",
  project_cancelled: "Projekt törölve",
  deadline_issue: "Határidő probléma",
  bad_fit: "Nem illeszkedik",
  other: "Egyéb",
};

// =====================================================================
// LOST_STAGES — a lost_stage backendoldali whitelist-je (2026-06-27 invariáns).
// A DB constraint `leads_lost_stage_chk` PONTOSAN ezeket az értékeket engedi.
// Reaktiváláskor a lead.status = lead.lost_stage (1:1 visszaállítás).
// =====================================================================
export const LOST_STAGES = [
  "contacted",
  "quote_prep",
  "quote_sent",
  "follow_up",
  "contract",
] as const;
export type LostStage = (typeof LOST_STAGES)[number];

/** Egy aktuális (nem lost/won) lead státuszát képezi le egy érvényes
 *  lost_stage értékre. A 'new' státusznak nincs külön lost_stage-e
 *  (üzleti döntés: a new → lost átmenet 'contacted' szakaszként könyvelődik). */
export function statusToLostStage(status: LeadStatus | string | null | undefined): LostStage {
  switch (status) {
    case "contacted":
    case "quote_prep":
    case "quote_sent":
    case "follow_up":
    case "contract":
      return status;
    case "new":
    default:
      return "contacted";
  }
}

export const DUE_BUCKETS = ["overdue", "today", "tomorrow", "later", "missing"] as const;
export type DueBucket = (typeof DUE_BUCKETS)[number];

export const DUE_BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Lejárt",
  today: "Ma",
  tomorrow: "Holnap",
  later: "Később",
  missing: "Hiányzó",
};

export const DUE_BUCKET_TONE: Record<DueBucket, string> = {
  overdue: "bg-destructive/10 text-destructive border-destructive/30",
  today: "bg-[color:var(--status-warning)]/12 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/35",
  tomorrow: "bg-[color:var(--status-info)]/12 text-[color:var(--status-info)] border-[color:var(--status-info)]/35",
  later: "bg-muted text-muted-foreground border-border",
  missing: "bg-muted text-muted-foreground border-dashed border-border",
};