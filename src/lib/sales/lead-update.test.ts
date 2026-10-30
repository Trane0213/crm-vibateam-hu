import { describe, expect, it } from "vitest";
import { assertSingleLeadRow, LEAD_NOT_UPDATED_MESSAGE } from "./lead-update";

describe("assertSingleLeadRow", () => {
  it("egy módosított sor siker", () => {
    expect(() => assertSingleLeadRow([{ id: "a" }])).not.toThrow();
  });
  it("nulla sor (RLS-tiltás / nem létező lead) hiba", () => {
    expect(() => assertSingleLeadRow([])).toThrow(LEAD_NOT_UPDATED_MESSAGE);
    expect(() => assertSingleLeadRow(null)).toThrow(LEAD_NOT_UPDATED_MESSAGE);
  });
  it("több sor sem siker", () => {
    expect(() => assertSingleLeadRow([{ id: "a" }, { id: "b" }])).toThrow();
  });
});
