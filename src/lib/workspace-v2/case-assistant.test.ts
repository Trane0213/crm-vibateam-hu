import { describe, it, expect } from "vitest";
import { caseAssistantPrompts } from "./case-assistant";

describe("ügyön belüli asszisztens", () => {
  it("minden gyorskérés tartalmazza a rekord azonosítóját és a jóváhagyási tiltást", () => {
    for (const agent of ["sales", "marketing"] as const) for (const kind of ["lead", "company", "thread"] as const) {
      const ps = caseAssistantPrompts(agent, kind, { id: "abc-123", name: "Teszt Kft" });
      expect(ps.length).toBeGreaterThan(0);
      for (const p of ps) { expect(p.text).toContain("abc-123"); expect(p.text).toContain("jóváhagyás nélkül"); }
    }
  });
  it("Scarlet érdeklődő-minősítésnél nem von össze duplikátumot", () => {
    expect(caseAssistantPrompts("marketing", "inbound", { id: "x" })[0].text).toContain("ne vonj össze");
  });
});
