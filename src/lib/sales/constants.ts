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
  contacted: "Kontaktált",
  quote_prep: "Ajánlat-előkészítés",
  quote_sent: "Ajánlat kiküldve",
  follow_up: "Utánkövetés",
  contract: "Szerződés",
  won: "Megnyert",
  lost: "Elveszett",
};

// Tailwind szín-paletta (semantic-aware). A skeleton fázisban közvetlen
// utility-osztályok; a végleges színek a Sales UI v2-ben kerülnek semantic
// tokenné a styles.css-ben (lásd plan: Státuszok és színek).
export const LEAD_STATUS_TONE: Record<LeadStatus, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-300",
  contacted: "bg-sky-100 text-sky-800 border-sky-300",
  quote_prep: "bg-amber-100 text-amber-800 border-amber-300",
  quote_sent: "bg-indigo-100 text-indigo-800 border-indigo-300",
  follow_up: "bg-violet-100 text-violet-800 border-violet-300",
  contract: "bg-emerald-100 text-emerald-800 border-emerald-300",
  won: "bg-emerald-600 text-white border-emerald-700",
  lost: "bg-rose-100 text-rose-800 border-rose-300",
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
  overdue: "bg-rose-100 text-rose-800 border-rose-300",
  today: "bg-amber-100 text-amber-800 border-amber-300",
  tomorrow: "bg-sky-100 text-sky-800 border-sky-300",
  later: "bg-muted text-muted-foreground border-border",
  missing: "bg-muted text-muted-foreground border-dashed border-border",
};