import { describe, it, expect } from "vitest";
import { marketingRowLink, marketingRowStatus, marketingTaskId } from "./marketing-today";

describe("Marketing – Ma", () => {
  it("céges teendő az új ügyféladatlap megfelelő fülére visz, saját feladat helyben zárható", () => {
    expect(marketingRowLink({ target: { kind: "company", companyId: "c1", tab: "contacts" } })).toEqual({ to: "/munka/ugyfel/$id", params: { id: "c1" }, search: { tab: "contacts" } });
    expect(marketingRowLink({ target: { kind: "tasks" } })).toBeNull();
    expect(marketingTaskId({ id: "task-t9", kind: "task-today" })).toBe("t9");
    expect(marketingTaskId({ id: "new-c1", kind: "new-contact" })).toBeNull();
  });
  it("átadható cég jóváhagyásra vár, hiányzó elérhetőség hiányzó adat", () => {
    expect(marketingRowStatus("handoff-ready")).toBe("approval");
    expect(marketingRowStatus("missing-contact")).toBe("missing");
  });
});
