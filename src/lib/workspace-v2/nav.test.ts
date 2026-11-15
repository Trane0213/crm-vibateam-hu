import { describe, it, expect } from "vitest";
import { wsItemsForRole, wsAreasForRole, wsHomeForRole, wsStartForRole, wsItemActive, wsAgentFor, WS_ITEMS } from "./nav";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";

const ROLES: RoleSlug[] = ["owner", "sales", "marketing", "project_manager"];

describe("új munkaterület menü", () => {
  it("értékesítő nem látja a Marketing részt, marketinges a Sales részt", () => {
    expect(wsAreasForRole("sales")).toEqual(["sales", "common"]);
    expect(wsAreasForRole("marketing")).toEqual(["marketing", "common"]);
    expect(wsItemsForRole("sales").some((i) => i.area === "marketing")).toBe(false);
    expect(wsItemsForRole("marketing").some((i) => i.area === "sales")).toBe(false);
  });
  it("projektvezető nem kap új munkaterületet", () => {
    expect(wsItemsForRole("project_manager")).toEqual([]);
    expect(canAccessRoute("project_manager", "/munka")).toBe(false);
  });
  it("egyik menüpont sem vezet olyan oldalra, amihez a szerepkörnek nincs joga", () => {
    for (const role of ROLES) for (const i of wsItemsForRole(role)) expect(canAccessRoute(role, i.url)).toBe(true);
  });
  it("minden menüpont az új munkaterületen belül marad, és egy menüpont sem ismétlődik", () => {
    for (const i of WS_ITEMS) expect(i.url.startsWith("/munka/")).toBe(true);
    const urls = wsItemsForRole("owner").map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
  it("a /munka/sales csak tulajdonosnak és értékesítőnek, a /munka/marketing csak tulajdonosnak és marketingesnek", () => {
    expect(canAccessRoute("sales", "/munka/sales/ma")).toBe(true);
    expect(canAccessRoute("marketing", "/munka/sales/ma")).toBe(false);
    expect(canAccessRoute("marketing", "/munka/marketing/ma")).toBe(true);
    expect(canAccessRoute("sales", "/munka/marketing/ma")).toBe(false);
  });
  it("az ügy- és ajánlat-részletoldal a saját menüpontját jelöli aktívnak", () => {
    const pipeline = WS_ITEMS.find((i) => i.key === "s-pipeline")!;
    expect(wsItemActive(pipeline, "/munka/ugy/abc")).toBe(true);
    expect(wsItemActive(WS_ITEMS.find((i) => i.key === "s-ajanlatok")!, "/munka/sales/ajanlat/abc")).toBe(true);
  });
});

describe("új munkaterület kezdőlap és asszisztens", () => {
  it("Sales és Marketing a saját Ma-oldalát kapja, a tulajdonos a régi kezdőlapról nem kerül át automatikusan", () => {
    expect(wsHomeForRole("sales")).toBe("/munka/sales/ma");
    expect(wsHomeForRole("marketing")).toBe("/munka/marketing/ma");
    expect(wsHomeForRole("owner")).toBeNull();
    expect(wsHomeForRole("project_manager")).toBeNull();
    expect(wsStartForRole("owner")).toBe("/munka/sales/ma");
  });
  it("értékesítőnél Timothy, marketingesnél Scarlet, tulajdonosnál a képernyő szerint", () => {
    expect(wsAgentFor("sales", "/munka/ugyfel/x")).toBe("sales");
    expect(wsAgentFor("marketing", "/munka/ugyfel/x")).toBe("marketing");
    expect(wsAgentFor("owner", "/munka/marketing/kampanyok")).toBe("marketing");
    expect(wsAgentFor("owner", "/munka/sales/ma")).toBe("sales");
  });
});
