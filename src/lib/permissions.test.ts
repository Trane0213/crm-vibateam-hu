import { describe, it, expect } from "vitest";
import { normalizeRole, canAccessRoute } from "./permissions";

describe("normalizeRole", () => {
  it("szerepkör nélküli felhasználó nem kap tulajdonosi jogot", () => {
    expect(normalizeRole(null)).toBe("marketing");
    expect(normalizeRole("")).toBe("marketing");
  });
  it("owner marad owner", () => {
    expect(normalizeRole("owner")).toBe("owner");
  });
});

describe("canAccessRoute – munkakörök", () => {
  it("marketing eléri a Lead Workspace-t és a hívásokat", () => {
    expect(canAccessRoute("marketing", "/leads")).toBe(true);
    expect(canAccessRoute("marketing", "/calls")).toBe(true);
  });
  it("marketing nem éri el a Pipeline-t, ajánlatokat, jelenlétet", () => {
    expect(canAccessRoute("marketing", "/sales/leads")).toBe(false);
    expect(canAccessRoute("marketing", "/quotes")).toBe(false);
    expect(canAccessRoute("marketing", "/attendance")).toBe(false);
    expect(canAccessRoute("marketing", "/leads/lost")).toBe(false);
  });
  it("sales nem éri el a jelenlétet, PM nem éri el a Pipeline-t", () => {
    expect(canAccessRoute("sales", "/attendance")).toBe(false);
    expect(canAccessRoute("project_manager", "/sales/leads")).toBe(false);
    expect(canAccessRoute("project_manager", "/attendance")).toBe(true);
  });
});

import { canAccessRoute as canAccess1B } from "./permissions";
describe("D7 – Vezetői irányítópult (1/B)", () => {
  it("csak tulajdonos érheti el, közvetlen URL-lel is", () => {
    expect(canAccess1B("owner", "/dashboard")).toBe(true);
    expect(canAccess1B("sales", "/dashboard")).toBe(false);
    expect(canAccess1B("project_manager", "/dashboard")).toBe(false);
    expect(canAccess1B("marketing", "/dashboard")).toBe(false);
  });
});
