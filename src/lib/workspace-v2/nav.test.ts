import { describe, it, expect } from "vitest";
import { wsItemsForRole, wsAreasForRole } from "./nav";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";

const ROLES: RoleSlug[] = ["owner", "sales", "marketing", "project_manager"];

describe("új munkaterület menü", () => {
  it("értékesítő nem látja a Marketing részt, marketinges a Sales részt", () => {
    expect(wsAreasForRole("sales")).toEqual(["sales"]);
    expect(wsAreasForRole("marketing")).toEqual(["marketing"]);
    expect(wsAreasForRole("owner")).toEqual(["sales", "marketing"]);
  });
  it("projektvezető nem kap új munkaterületet", () => {
    expect(wsItemsForRole("project_manager")).toEqual([]);
    expect(canAccessRoute("project_manager", "/munka")).toBe(false);
  });
  it("egyik menüpont sem vezet olyan oldalra, amihez a szerepkörnek nincs joga", () => {
    for (const role of ROLES) for (const i of wsItemsForRole(role)) expect(canAccessRoute(role, i.url)).toBe(true);
  });
  it("a /munka/sales csak tulajdonosnak és értékesítőnek, a /munka/marketing csak tulajdonosnak és marketingesnek", () => {
    expect(canAccessRoute("sales", "/munka/sales/ma")).toBe(true);
    expect(canAccessRoute("marketing", "/munka/sales/ma")).toBe(false);
    expect(canAccessRoute("marketing", "/munka/marketing/ma")).toBe(true);
    expect(canAccessRoute("sales", "/munka/marketing/ma")).toBe(false);
  });
  it("a tervezett modul nem jelenik meg késznek", () => {
    const t = wsItemsForRole("owner").find((i) => i.key === "m-tartalom");
    expect(t?.state).toBe("planned");
  });
});

describe("új munkaterület kezdőlap", () => {
  it("csak Sales és Marketing kap automatikus Ma-oldalt, a tulajdonos marad a saját kezdőlapján", async () => {
    const { wsHomeForRole } = await import("./nav");
    expect(wsHomeForRole("sales")).toBe("/munka/sales/ma");
    expect(wsHomeForRole("marketing")).toBe("/munka/marketing/ma");
    expect(wsHomeForRole("owner")).toBeNull();
    expect(wsHomeForRole("project_manager")).toBeNull();
  });
});
