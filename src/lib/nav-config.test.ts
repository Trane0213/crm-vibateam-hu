import { describe, it, expect } from "vitest";
import { MORE_GROUPS, WORKSPACES_BY_ROLE, AI_ITEMS, HOME, moreGroups, primaryItems } from "./nav-config";
import { canAccessRoute, type RoleSlug } from "./permissions";

const ROLES: RoleSlug[] = ["owner", "sales", "marketing", "project_manager"];
const all = [HOME, ...Object.values(WORKSPACES_BY_ROLE).flat(), ...MORE_GROUPS.flatMap((g) => g.items), ...AI_ITEMS];

const reachable = (role: RoleSlug) =>
  new Set([...primaryItems(role), ...moreGroups(role).flatMap((g) => g.items)].map((i) => i.url));

describe("navigáció", () => {
  it("tulajdonos minden menüpontot elér (fő menü vagy Továbbiak)", () => {
    const r = reachable("owner");
    for (const i of all.filter((x) => !x.agentId && x.url !== "/ai-assistants")) expect(r.has(i.url)).toBe(true);
  });
  it("egyik szerepkör sem lát olyan menüpontot, amihez nincs joga", () => {
    for (const role of ROLES) for (const url of reachable(role)) expect(canAccessRoute(role, url)).toBe(true);
  });
  it("a fő menü legfeljebb 6 elem", () => {
    for (const role of ROLES) expect(primaryItems(role).length).toBeLessThanOrEqual(6);
  });
  it("marketing nem látja a Pipeline-t és a Jelenlétet", () => {
    const r = reachable("marketing");
    expect(r.has("/sales/leads")).toBe(false);
    expect(r.has("/attendance")).toBe(false);
  });
});
