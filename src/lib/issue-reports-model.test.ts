import { describe, expect, it } from "vitest";
import { issueInput, issuePath, canPersistIssueCategory, routeSpecialist, clampAiEvidence } from "./issue-reports-model";
const valid = { submissionKey: "11111111-1111-4111-8111-111111111111", pagePath: "/today", description: "TESZT", expectedResult: "TESZT expected", actualResult: "TESZT actual", technicalCode: "401" };
describe("hibajegy biztonságos bemenet", () => {
  it("nem fogad kliensoldali személyt vagy szerepkört", () => { expect(issueInput.safeParse({ ...valid, reporter_id: "other" }).success).toBe(false); });
  it("útvonalból elhagyja a query és hash adatot", () => { expect(issuePath("/today?token=secret#private")).toBe("/today"); });
  it("2000 karakternél hosszabb leírást elutasít", () => { expect(issueInput.safeParse({ ...valid, description: "x".repeat(2001) }).success).toBe(false); });
  it("üres tényleges eredményt elutasít", () => { expect(issueInput.safeParse({ ...valid, actualResult: " " }).success).toBe(false); });
  it.each(["usage", "bug", "ux", "feature"] as const)("%s kategória menthető", c => { expect(canPersistIssueCategory(c)).toBe(true); expect(issueInput.safeParse({ ...valid, category: c }).success).toBe(true); });
  it("ismeretlen kategóriát elutasít", () => { expect(issueInput.safeParse({ ...valid, category: "other" }).success).toBe(false); });
});
describe("George szakértői irányítás", () => {
  it("kampány → Scarlet", () => { expect(routeSpecialist("/campaign-list", "marketing")).toBe("scarlet"); });
  it("pipeline → Timothy", () => { expect(routeSpecialist("/pipeline", "owner")).toBe("timothy"); });
  it("projekt → Boss", () => { expect(routeSpecialist("/projects/1", "owner")).toBe("boss"); });
  it("általános owner oldal → George", () => { expect(routeSpecialist("/dashboard", "owner")).toBe("george"); });
  it("AI nem állíthat igazolt hibát", () => { expect(clampAiEvidence("proven")).toBe("assumed"); expect(clampAiEvidence("not_examinable")).toBe("not_examinable"); });
});
