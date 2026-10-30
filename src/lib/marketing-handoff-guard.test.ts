import { describe, expect, it } from "vitest";
import { canSubmitHandoff, openLeads } from "./marketing-handoff-guard";

const base = { summary: "x", leadSource: "cold_email", assignee: "u1", submitting: false, openLeadCount: 0, confirmedSeparateOpportunity: false };
describe("Sales-átadás – meglévő lead", () => {
  it("lezárt (won/lost) lead nem számít nyitottnak", () => {
    expect(openLeads([{ status: "new" }, { status: "won" }, { status: "lost" }, { status: "contract" }]).length).toBe(2);
  });
  it("nyitott lead mellett megerősítés nélkül nem adható át (12 Raszter: 1 new lead)", () => {
    expect(canSubmitHandoff({ ...base, openLeadCount: 1 })).toBe(false);
    expect(canSubmitHandoff({ ...base, openLeadCount: 1, confirmedSeparateOpportunity: true })).toBe(true);
  });
  it("felelős értékesítő és csatorna kötelező; mentés közben nem küldhető újra", () => {
    expect(canSubmitHandoff({ ...base, assignee: "" })).toBe(false);
    expect(canSubmitHandoff({ ...base, leadSource: "" })).toBe(false);
    expect(canSubmitHandoff({ ...base, submitting: true })).toBe(false);
    expect(canSubmitHandoff(base)).toBe(true);
  });
});
