import { describe, expect, it } from "vitest";
import { isOwnSalesLead, isSalesPrepListLead } from "./lead-visibility";

const VIKTOR = "feaad8d8-b04a-4d10-b67b-1aeb6a7b4850";
const RAMON = "401cc133-10bd-494b-aa49-28ee14b3266e";
const sopron = { assigned_to: RAMON, status: "new", pipeline_entered_at: null };

describe("Sales saját ügy láthatóság", () => {
  it("más értékesítő 'new' leadje nem látszik", () => {
    expect(isSalesPrepListLead(sopron, VIKTOR)).toBe(false);
    expect(isOwnSalesLead(sopron, VIKTOR)).toBe(false);
  });
  it("saját előkészítő lead látszik", () => {
    expect(isSalesPrepListLead(sopron, RAMON)).toBe(true);
  });
  it("felelős nélküli lead nem saját Sales ügy", () => {
    expect(isSalesPrepListLead({ ...sopron, assigned_to: null }, RAMON)).toBe(false);
  });
  it("Pipeline-ba lépett és lezárt saját lead nincs az előkészítő listában", () => {
    expect(isSalesPrepListLead({ ...sopron, pipeline_entered_at: "2026-11-03T10:00:00Z" }, RAMON)).toBe(false);
    expect(isSalesPrepListLead({ ...sopron, status: "won" }, RAMON)).toBe(false);
  });
  it("bejelentkezés nélkül semmi", () => {
    expect(isOwnSalesLead(sopron, null)).toBe(false);
  });
});
