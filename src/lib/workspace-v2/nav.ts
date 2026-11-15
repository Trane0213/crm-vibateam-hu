// Új munkaterület (v2) menüje. Tiszta adat: csak elrejt, jogot nem ad —
// minden cél a canAccessRoute szerint is elérhető kell legyen (teszt).
import type { RoleSlug } from "@/lib/permissions";

export type WsArea = "sales" | "marketing";
/** ready = az új képernyő kész; legacy = addig a meglévő oldal nyílik; planned = háttér hiányzik. */
export type WsItemState = "ready" | "legacy" | "planned";
export type WsItem = { key: string; title: string; area: WsArea; state: WsItemState; url: string; note?: string };

export const WS_ITEMS: WsItem[] = [
  { key: "s-ma", title: "Ma", area: "sales", state: "legacy", url: "/sales" },
  { key: "s-pipeline", title: "Ügyek (Pipeline)", area: "sales", state: "legacy", url: "/sales/leads" },
  { key: "s-ugyfelek", title: "Ügyfelek", area: "sales", state: "legacy", url: "/customers" },
  { key: "s-ajanlatok", title: "Ajánlatok", area: "sales", state: "legacy", url: "/quotes", note: "Kapott Excel és saját VIBA-ajánlat külön képernyőn" },
  { key: "s-projektek", title: "Projektek", area: "sales", state: "legacy", url: "/projects" },
  { key: "m-ma", title: "Ma", area: "marketing", state: "legacy", url: "/today" },
  { key: "m-erdeklodok", title: "Érdeklődők", area: "marketing", state: "legacy", url: "/web-quote-requests" },
  { key: "m-kampanyok", title: "E-mail-kampányok", area: "marketing", state: "legacy", url: "/campaign-list" },
  { key: "m-levelezes", title: "Levelezés és piszkozatok", area: "marketing", state: "legacy", url: "/emails" },
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
