// Az új munkaterület (v2) egyetlen menüje. Tiszta adat: csak elrejt, jogot nem ad —
// minden cél a canAccessRoute szerint is elérhető kell legyen (teszt).
import type { RoleSlug } from "@/lib/permissions";

export type WsArea = "sales" | "marketing" | "common";
export type WsItem = { key: string; title: string; area: WsArea; url: string; match?: string[] };

export const WS_ITEMS: WsItem[] = [
  { key: "s-ma", title: "Ma", area: "sales", url: "/munka/sales/ma" },
  { key: "s-pipeline", title: "Pipeline", area: "sales", url: "/munka/sales/pipeline", match: ["/munka/ugy/", "/munka/sales/projekt/"] },
  { key: "s-ajanlatok", title: "Ajánlatok", area: "sales", url: "/munka/sales/ajanlatok", match: ["/munka/sales/ajanlat/"] },
  { key: "m-ma", title: "Ma", area: "marketing", url: "/munka/marketing/ma" },
  { key: "m-erdeklodok", title: "Érdeklődők", area: "marketing", url: "/munka/marketing/erdeklodok", match: ["/munka/marketing/erdeklodo/"] },
  { key: "m-kampanyok", title: "Kampányok", area: "marketing", url: "/munka/marketing/kampanyok", match: ["/munka/marketing/kampany"] },
  { key: "c-ugyfelek", title: "Ügyfelek", area: "common", url: "/munka/ugyfelek", match: ["/munka/ugyfel/", "/munka/kapcsolattarto/"] },
  { key: "c-levelezes", title: "Levelezés", area: "common", url: "/munka/levelezes" },
];

export const WS_AREA_LABEL: Record<WsArea, string> = { sales: "Értékesítés", marketing: "Marketing", common: "Közös" };

export function wsAreasForRole(role: RoleSlug): WsArea[] {
  if (role === "owner") return ["sales", "marketing", "common"];
  if (role === "sales") return ["sales", "common"];
  if (role === "marketing") return ["marketing", "common"];
  return [];
}

export function wsItemsForRole(role: RoleSlug): WsItem[] {
  const areas = wsAreasForRole(role);
  return WS_ITEMS.filter((i) => areas.includes(i.area));
}

export function wsItemActive(item: WsItem, pathname: string): boolean {
  if (pathname === item.url || pathname.startsWith(item.url + "/")) return true;
  return (item.match ?? []).some((m) => pathname.startsWith(m));
}

/** Szerepkör „Ma” képernyője az új munkaterületen (tulajdonosnál nincs automatikus átirányítás a régi kezdőlapról). */
export function wsHomeForRole(role: RoleSlug): "/munka/sales/ma" | "/munka/marketing/ma" | null {
  if (role === "sales") return "/munka/sales/ma";
  if (role === "marketing") return "/munka/marketing/ma";
  return null;
}

/** Az új munkaterület kezdőképernyője belépéskor (tulajdonosnak a Sales Ma). */
export function wsStartForRole(role: RoleSlug): "/munka/sales/ma" | "/munka/marketing/ma" | null {
  return role === "owner" ? "/munka/sales/ma" : wsHomeForRole(role);
}

/** Melyik asszisztens segít az adott képernyőn. */
export function wsAgentFor(role: RoleSlug, pathname: string): "sales" | "marketing" {
  if (role === "marketing") return "marketing";
  if (role === "sales") return "sales";
  return pathname.startsWith("/munka/marketing") ? "marketing" : "sales";
}
