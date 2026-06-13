export type RoleSlug = "owner" | "project_manager" | "sales" | "marketing";

export const ROLE_LABEL: Record<RoleSlug, string> = {
  owner: "Tulajdonos",
  project_manager: "Projektvezető",
  sales: "Értékesítő",
  marketing: "Marketinges",
};

/**
 * Magyar/angol/akármi → kanonikus slug.
 *
 * H5 biztonságos viselkedés:
 * - üres / hiányzó input → "owner" (legacy: az a rekord, amelyiknek nincs még role_id-je,
 *   nem zárható ki — a useEnsureProfile / admin pótolja a role-t).
 * - ismert alias → kanonikus slug.
 * - ismeretlen, de nem-üres név → "marketing" (LEGSZŰKEBB jog) + figyelmeztetés.
 *   Ez megakadályozza a véletlen privilege-escalation-t arra az esetre, ha valaki
 *   új, ismeretlen role-t hoz létre az adatbázisban.
 */
export function normalizeRole(input: unknown): RoleSlug {
  const v = String(input ?? "").toLowerCase().trim();
  if (!v) return "owner";
  if (["owner", "tulajdonos", "admin", "superadmin"].includes(v)) return "owner";
  if (["project_manager", "projektvezeto", "projektvezető", "pm", "manager"].includes(v))
    return "project_manager";
  if ([
    "sales", "ertekesito", "értékesítő", "sales_rep",
    "irodai", "iroda", "irodai_munkatars", "irodai munkatárs", "office",
    "agent", "ugynok", "ügynök",
  ].includes(v)) return "sales";
  if ([
    "marketing", "marketinges", "marketer",
    "szerelo", "szerelő", "installer", "technician", "field",
  ].includes(v)) return "marketing";
  if (typeof console !== "undefined") {
    console.warn(
      `[permissions] Ismeretlen role név ("${v}") → fallback: "marketing" (legszűkebb jog). ` +
        `Vegyél fel aliast a normalizeRole-ba, vagy javítsd a roles.name értéket.`,
    );
  }
  return "marketing";
}

/** Route → engedélyezett szerepkörök. A „/agents" jellegű utak mindenki számára elérhetők. */
export const ROUTE_ACCESS: { prefix: string; roles: RoleSlug[] }[] = [
  { prefix: "/today", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/dashboard", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/activity", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/projects", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/quotes", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/followups", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/leads", roles: ["owner", "sales"] },
  { prefix: "/tasks", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/companies", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/contacts", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/customers", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/campaign-list", roles: ["owner", "project_manager", "marketing"] },
  { prefix: "/emails", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/calls", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/meetings", roles: ["owner", "project_manager", "sales"] },
  { prefix: "/documents", roles: ["owner", "project_manager"] },
  { prefix: "/ai-assistants", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/ai-assistant", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/sales/research", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/data-quality", roles: ["owner", "project_manager", "marketing"] },
  { prefix: "/help", roles: ["owner", "project_manager", "sales", "marketing"] },
  { prefix: "/settings", roles: ["owner"] },
];

export function canAccessRoute(role: RoleSlug, pathname: string): boolean {
  // Tulajdonos mindent lát.
  if (role === "owner") return true;
  const match = ROUTE_ACCESS.find(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  );
  if (!match) {
    // Fail-closed: ismeretlen útvonal alapból TILTOTT.
    // Csak az ROUTE_ACCESS-ben explicit felvett route-ok elérhetők.
    if (typeof console !== "undefined") {
      console.warn(
        `[permissions] Ismeretlen útvonal blokkolva (${role}): ${pathname}`,
      );
    }
    return false;
  }
  return match.roles.includes(role);
}