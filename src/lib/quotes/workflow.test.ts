import { describe, expect, it } from "vitest";
import { quoteWorkflow, quoteWorkflowFeatures } from "./workflow";
describe("Ajánlatkészítő munkamódok", () => {
  it("kapott költségvetésnél nincs saját szerkesztő", () => {
    expect(quoteWorkflowFeatures("received_budget").ownEditor).toBe(false);
    expect(quoteWorkflowFeatures("received_budget").documents).toBe(true);
  });
  it("saját ajánlatnál van szerkesztő és dokumentumkezelés", () => {
    expect(quoteWorkflowFeatures("viba_offer").ownEditor).toBe(true);
    expect(quoteWorkflowFeatures("viba_offer").documents).toBe(true);
  });
  it("mindkét munkamód négy lépés", () => {
    expect(quoteWorkflowFeatures("received_budget").stepCount).toBe(4);
    expect(quoteWorkflowFeatures("viba_offer").stepCount).toBe(4);
  });
  it("korábbi típus nélküli ajánlat nincs automatikusan besorolva", () => {
    expect(quoteWorkflow(null)).toBe(null);
    expect(quoteWorkflow("other")).toBe(null);
    expect(quoteWorkflowFeatures(null).stepCount).toBe(0);
  });
});