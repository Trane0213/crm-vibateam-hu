// Központi VIBA enumok — UI címkék + tone classok.

export const PROJECT_STATUS = [
  { value: "uj_megkereses",    label: "Új megkeresés" },
  { value: "felmeres",         label: "Felmérés" },
  { value: "ajanlat_keszul",   label: "Ajánlat készül" },
  { value: "ajanlat_kikuldve", label: "Ajánlat kiküldve" },
  { value: "utankovetes",      label: "Utánkövetés" },
  { value: "megnyert",         label: "Megnyert" },
  { value: "elvesztett",       label: "Elvesztett" },
  { value: "kivitelezes",      label: "Kivitelezés" },
  { value: "lezart",           label: "Lezárt" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number]["value"];

export const PROJECT_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  PROJECT_STATUS.map((s) => [s.value, s.label]),
);

export const PROJECT_STATUS_TONE: Record<string, string> = {
  uj_megkereses:    "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  felmeres:         "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  ajanlat_keszul:   "bg-primary/10 text-primary border-primary/30",
  ajanlat_kikuldve: "bg-primary/15 text-primary border-primary/40",
  utankovetes:      "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
  megnyert:         "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  elvesztett:       "bg-destructive/10 text-destructive border-destructive/30",
  kivitelezes:      "bg-primary/10 text-primary border-primary/30",
  lezart:           "bg-muted text-muted-foreground border-border",
};

export const COMPANY_TYPE = [
  { value: "generalkivitelezo", label: "Generálkivitelező" },
  { value: "tarsashaz",         label: "Társasház" },
  { value: "kozos_kepviselo",   label: "Közös képviselő" },
  { value: "beruhazo",          label: "Beruházó" },
  { value: "alvallalkozo",      label: "Alvállalkozó" },
  { value: "maganszemely",      label: "Magánszemély" },
] as const;

export const COMPANY_TYPE_LABEL: Record<string, string> = {
  ...Object.fromEntries(COMPANY_TYPE.map((c) => [c.value, c.label])),
  potencialis: "Potenciális (legacy)",
};

export const PROJECT_CONTACT_ROLE = [
  { value: "muszaki",         label: "Műszaki" },
  { value: "donteshozo",      label: "Döntéshozó" },
  { value: "penzugy",         label: "Pénzügy" },
  { value: "kozos_kepviselo", label: "Közös képviselő" },
  { value: "projektvezeto",   label: "Projektvezető" },
  { value: "egyeb",           label: "Egyéb" },
] as const;

export const PROJECT_CONTACT_ROLE_LABEL: Record<string, string> =
  Object.fromEntries(PROJECT_CONTACT_ROLE.map((r) => [r.value, r.label]));

// Dashboard csoportosítás
export const ACTIVE_PROJECT_STATUSES: ProjectStatus[] = [
  "uj_megkereses",
  "felmeres",
  "ajanlat_keszul",
  "ajanlat_kikuldve",
  "utankovetes",
  "kivitelezes",
];