import { describe, it, expect } from "vitest";
import { marketingRowLink, marketingRowStatus } from "./marketing-today";

describe("Marketing – Ma", () => {
  it("céges teendő az új ügyféladatlapra, feladat a feladatlistára visz", () => {
    expect(marketingRowLink({ target: { kind: "company", companyId: "c1" } })).toEqual({ to: "/munka/ugyfel/$id", params: { id: "c1" } });
    expect(marketingRowLink({ target: { kind: "tasks" } })).toEqual({ to: "/tasks" });
  });
  it("átadható cég jóváhagyásra vár, hiányzó elérhetőség hiányzó adat", () => {
    expect(marketingRowStatus("handoff-ready")).toBe("approval");
    expect(marketingRowStatus("missing-contact")).toBe("missing");
  });
});
