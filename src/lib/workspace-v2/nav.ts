// Új munkaterület (v2) menüje. Tiszta adat: csak elrejt, jogot nem ad —
// minden cél a canAccessRoute szerint is elérhető kell legyen (teszt).
import type { RoleSlug } from "@/lib/permissions";

export type WsArea = "sales" | "marketing";
/** ready = az új képernyő kész; legacy = a meglévő oldal nyílik; planned = háttér hiányzik, nem kattintható. */
export type WsItemState = "ready" | "legacy" | "planned";
export type WsItem = { key: string; title: string; area: WsArea; state: WsItemState; url: string; note?: string };

export const WS_ITEMS: WsItem[] = [
  { key: "s-ma", title: "Ma", area: "sales", state: "ready", url: "/munka/sales/ma" },
  { key: "s-pipeline", title: "Ügyek (Pipeline)", area: "sales", state: "ready", url: "/munka/sales/pipeline" },
  { key: "s-ugyfelek", title: "Ügyfelek", area: "sales", state: "ready", url: "/munka/ugyfelek" },
  { key: "s-ajanlatok", title: "Ajánlatok", area: "sales", state: "ready", url: "/munka/sales/ajanlatok", note: "Kapott Excel és saját VIBA-ajánlat külön" },
  { key: "s-projektek", title: "Projektek", area: "sales", state: "legacy", url: "/projects" },
  { key: "m-ma", title: "Ma", area: "marketing", state: "ready", url: "/munka/marketing/ma" },
  { key: "m-erdeklodok", title: "Érdeklődők", area: "marketing", state: "ready", url: "/munka/marketing/erdeklodok" },
  { key: "m-kampanyok", title: "E-mail-kampányok", area: "marketing", state: "ready", url: "/munka/marketing/kampanyok" },
  { key: "m-levelezes", title: "Levelezés és tartalom", area: "marketing", state: "ready", url: "/munka/marketing/levelezes" },
  { key: "m-ugyfelek", title: "Ügyfelek", area: "marketing", state: "ready", url: "/munka/ugyfelek" },
  { key: "m-tartalom", title: "Tartalomnaptár és kreatívtár", area: "marketing", state: "planned", url: "/munka", note: "Tervezett – adattárolás és integráció szükséges" },
];

export const WS_AREA_LABEL: Record<WsArea, string> = { sales: "Értékesítés", marketing: "Marketing" };

export function wsAreasForRole(role: RoleSlug): WsArea[] {
  if (role === "owner") return ["sales", "marketing"];
  if (role === "sales") return ["sales"];
  if (role === "marketing") return ["marketing"];
  return [];
}

export function wsItemsForRole(role: RoleSlug): WsItem[] {
  const areas = wsAreasForRole(role);
  return WS_ITEMS.filter((i) => areas.includes(i.area));
}

/** Szerepkör „Ma” képernyője az új munkaterületen (tulajdonosnál nincs automatikus átirányítás). */
export function wsHomeForRole(role: RoleSlug): "/munka/sales/ma" | "/munka/marketing/ma" | null {
  if (role === "sales") return "/munka/sales/ma";
  if (role === "marketing") return "/munka/marketing/ma";
  return null;
}
