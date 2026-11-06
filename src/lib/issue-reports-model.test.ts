import { describe, expect, it } from "vitest";
import { issueInput, issuePath } from "./issue-reports-model";
const valid = { submissionKey: "11111111-1111-4111-8111-111111111111", pagePath: "/today", description: "TESZT", expectedResult: "TESZT expected", actualResult: "TESZT actual", technicalCode: "401" };
describe("hibajegy biztonságos bemenet", () => {
  it("nem fogad kliensoldali személyt vagy szerepkört", () => { expect(issueInput.safeParse({ ...valid, reporter_id: "other" }).success).toBe(false); });
  it("útvonalból elhagyja a query és hash adatot", () => { expect(issuePath("/today?token=secret#private")).toBe("/today"); });
  it("2000 karakternél hosszabb leírást elutasít", () => { expect(issueInput.safeParse({ ...valid, description: "x".repeat(2001) }).success).toBe(false); });
  it("üres tényleges eredményt elutasít", () => { expect(issueInput.safeParse({ ...valid, actualResult: " " }).success).toBe(false); });
});