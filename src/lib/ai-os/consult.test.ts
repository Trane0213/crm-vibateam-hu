import { describe, expect, it } from "vitest";
import { collectObservedIds, isConsultReadTool, isReviewTool, parseSpecialistReport, verifiedSourceIds, MAX_HANDOFFS_PER_RUN } from "./consult";

const LEAD = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";

describe("szakértői konzultáció — csak olvasó eszközök", () => {
  it("safe olvasó eszköz engedett", () => expect(isConsultReadTool({ name: "crm_get_lead", domain: "crm.leads" })).toBe(true));
  it("jóváhagyásköteles írás tiltott", () => expect(isConsultReadTool({ name: "sales_update_next_step", domain: "sales.next_step", approval: "confirm" })).toBe(false));
  it("needs_approval tiltott", () => expect(isConsultReadTool({ name: "x", domain: "crm.leads", needs_approval: true })).toBe(false));
  it("dry-run/végrehajtó eszköz tiltott", () => expect(isConsultReadTool({ name: "x", domain: "sales.pipeline_status", supports_dry_run: true })).toBe(false));
  it("szakértő nem adhat tovább (nincs lánc)", () => expect(isConsultReadTool({ name: "handoff_to", domain: "core.handoff" })).toBe(false));
  it("memóriaírás tiltott", () => expect(isConsultReadTool({ name: "memory_write", domain: "core.memory" })).toBe(false));
  it("George vizsgálati módban konzultálhat, de írni nem tud", () => {
    expect(isReviewTool({ name: "handoff_to", domain: "core.handoff" })).toBe(true);
    expect(isReviewTool({ name: "memory_write", domain: "core.memory", needs_approval: true })).toBe(false);
  });
  it("futásonként legfeljebb 4 konzultáció", () => expect(MAX_HANDOFFS_PER_RUN).toBe(4));
});

describe("forrás-ellenőrzés", () => {
  const observed = collectObservedIds({ ok: true, data: { items: [{ id: LEAD, company_id: "abc" }] } }, new Set());
  const json = (basis: string, id: string) => JSON.stringify({ status: "answered", summary: "s", findings: [{ statement: "Állítás", basis, sources: [{ type: "lead", id }] }], confidence: "high" });

  it("eszközben látott azonosítóval source_fact marad", () => {
    const r = parseSpecialistReport("timothy", json("source_fact", LEAD), observed);
    expect(r.findings[0].basis).toBe("source_fact");
    expect(r.verified_source_count).toBe(1);
    expect(verifiedSourceIds(r)).toEqual([LEAD]);
  });
  it("ki nem olvasott azonosító → unverified", () => {
    const r = parseSpecialistReport("timothy", json("source_fact", OTHER), observed);
    expect(r.findings[0].basis).toBe("unverified");
    expect(r.unverified_claim_count).toBe(1);
    expect(verifiedSourceIds(r)).toEqual([]);
  });
  it("forrás nélküli source_fact → unverified", () => {
    const r = parseSpecialistReport("boss", JSON.stringify({ status: "answered", findings: [{ statement: "x", basis: "source_fact", sources: [] }] }), observed);
    expect(r.findings[0].basis).toBe("unverified");
  });
  it("nem JSON válasz → invalid_format, nincs megállapítás", () => {
    const r = parseSpecialistReport("scarlet", "Szabad szöveg", observed);
    expect(r.status).toBe("invalid_format");
    expect(r.findings).toEqual([]);
  });
  it("javasolt lépés mindig emberi jóváhagyást igényel", () => {
    const r = parseSpecialistReport("timothy", JSON.stringify({ status: "answered", recommended_actions: [{ action: "Hívd fel", needs_approval: false, owner_role: "sales" }] }), observed);
    expect(r.recommended_actions[0].needs_approval).toBe(true);
  });
  it("ismeretlen státusz → insufficient_data", () => {
    expect(parseSpecialistReport("timothy", JSON.stringify({ status: "verified" }), observed).status).toBe("insufficient_data");
  });
});
