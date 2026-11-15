// A két felület közti váltó célpontjai. Mindkettő ugyanazt az adatbázist és jogosultságot
// használja; a váltás csak a böngészőben tárolt kezdőfelület-választást állítja.
export type InterfaceKey = "crm" | "workspace";

export const INTERFACE_OPTIONS = [
  { key: "crm", label: "Fő CRM", to: "/today", workspaceEnabled: false, hint: "A teljes CRM összes meglévő funkciójával" },
  { key: "workspace", label: "Új munkafelület", to: "/munka", workspaceEnabled: true, hint: "Egyszerűsített Sales/Marketing munkafelület" },
] as const satisfies readonly { key: InterfaceKey; label: string; to: "/today" | "/munka"; workspaceEnabled: boolean; hint: string }[];
