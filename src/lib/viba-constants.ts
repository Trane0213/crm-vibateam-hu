// Központi VIBA enumok — UI címkék + tone classok.

// Kivitelezési projekt-státuszok. A sales fázisok (ajánlat, megnyert,
// elvesztett) a leadhez tartoznak, nem a projekthez. Az adatbázis is csak
// ezeket az értékeket fogadja el; új projekt „atadas" állapotban indul.
export const PROJECT_STATUS = [
  { value: "atadas",         label: "Átadás / előkészítés" },
  { value: "felmeres",       label: "Felmérés" },
  { value: "elokeszites",    label: "Munka-előkészítés" },
  { value: "kivitelezes",    label: "Kivitelezés" },
  { value: "muszaki_atadas", label: "Műszaki átadás" },
  { value: "lezart",         label: "Lezárt" },
  { value: "felfuggesztve",  label: "Felfüggesztve" },
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[number]["value"];

export const PROJECT_STATUS_LABEL: Record<string, string> = Object.fromEntries(
  PROJECT_STATUS.map((s) => [s.value, s.label]),
);

export const PROJECT_STATUS_TONE: Record<string, string> = {
  atadas:         "bg-[color:var(--status-info)]/15 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  felmeres:       "bg-[color:var(--status-info)]/10 text-[color:var(--status-info)] border-[color:var(--status-info)]/30",
  elokeszites:    "bg-primary/10 text-primary border-primary/30",
  kivitelezes:    "bg-primary/15 text-primary border-primary/40",
  muszaki_atadas: "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30",
  lezart:         "bg-muted text-muted-foreground border-border",
  felfuggesztve:  "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30",
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
  potencialis: "Kampány",
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
  "atadas",
  "felmeres",
  "elokeszites",
  "kivitelezes",
  "muszaki_atadas",
];