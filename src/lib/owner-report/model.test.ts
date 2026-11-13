import { describe, expect, it } from "vitest";
import { factIds, factsHash, reportPeriod, type OwnerFacts } from "./model";
import { parseSpecialistReport } from "@/lib/ai-os/consult";

const facts = (label = "Lejárt lépés"): OwnerFacts => ({ kind: "daily", period: { start: "2026-11-12T23:00:00.000Z", end: "2026-11-13T20:00:00.000Z", label: "x" }, sections: [{ key: "overdue", title: "Elmaradt", total: 1, items: [{ id: "11111111-1111-4111-8111-111111111111", type: "followup", label, extra: { lead_id: "22222222-2222-4222-8222-222222222222" } }] }] });

describe("owner report", () => {
  it("daily = Budapest day start, weekly = 7 Budapest days", () => {
    const now = new Date("2026-11-13T20:00:00Z");
    expect(reportPeriod("daily", now).start).toBe("2026-11-12T23:00:00.000Z");
    expect(reportPeriod("weekly", now).start).toBe("2026-11-06T23:00:00.000Z");
  });
  it("unchanged facts → same hash even if period end moves; changed facts → new hash", async () => {
    const a = facts(); const b = { ...facts(), period: { ...facts().period, end: "2026-11-13T21:00:00.000Z" } };
    expect(await factsHash(a)).toBe(await factsHash(b));
    expect(await factsHash(a)).not.toBe(await factsHash(facts("Más")));
  });
  it("AI usage (incl. the report's own run) does not count as a change", async () => {
    const a = facts(); const b = facts();
    b.sections.push({ key: "ai_usage", title: "AI", total: 5, items: [{ id: "model:x", type: "model", label: "x: 5 futás" }] });
    expect(await factsHash(a)).toBe(await factsHash(b));
  });
  it("source_fact survives only with ids present in the facts", () => {
    const ids = factIds(facts());
    expect(ids.has("22222222-2222-4222-8222-222222222222")).toBe(true);
    const text = JSON.stringify({ status: "answered", summary: "s", findings: [
      { statement: "valós", basis: "source_fact", sources: [{ type: "followup", id: "11111111-1111-4111-8111-111111111111" }] },
      { statement: "kitalált", basis: "source_fact", sources: [{ type: "lead", id: "99999999-9999-4999-8999-999999999999" }] },
    ], recommended_actions: [{ action: "P1: x", needs_approval: false, owner_role: "owner" }], open_questions: [], confidence: "high" });
    const r = parseSpecialistReport("george", text, ids);
    expect(r.findings.map((f) => f.basis)).toEqual(["source_fact", "unverified"]);
    expect(r.recommended_actions[0].needs_approval).toBe(true);
  });
});
