import { describe, expect, it } from "vitest";
import { leadNextAction, quoteSendReadiness, contractReadiness, menuTransitions, dailyLeadTarget, ESIGN_AVAILABLE, leadWarnings, SALES_FLOW_STEPS } from "./sales-flow";
import { STATUS_TRANSITIONS } from "./constants";

const NOW = new Date("2026-11-13T12:00:00Z");
const base = { status: "quote_prep", pipeline_entered_at: "2026-11-01T10:00:00Z", company_id: "c1", contact_id: "p1", next_step_type: "phone", next_step_due_at: "2026-11-20T09:00:00Z" };

describe("Sales munkafolyamat – következő teendő", () => {
  it("hét lépés a teljes folyamatra, szerződés és átadás az utolsó", () => {
    expect(SALES_FLOW_STEPS.map((s) => s.key)).toEqual(["inquiry", "customer", "quote", "check", "send", "followup", "contract"]);
  });
  it("Pipeline előtt az előkészítő munkafelületre visz", () => {
    expect(leadNextAction({ ...base, status: "new", pipeline_entered_at: null }, [], NOW)).toMatchObject({ step: "inquiry", kind: "open_prep" });
  });
  it("ügyfél nélkül előbb ügyféladatot kér", () => {
    expect(leadNextAction({ ...base, status: "contacted", pipeline_entered_at: null, company_id: null }, [], NOW)).toMatchObject({ step: "customer", kind: "open_prep" });
  });
  it("ajánlat-előkészítésben ajánlat nélkül létrehozást javasol", () => {
    expect(leadNextAction(base, [], NOW)).toMatchObject({ step: "quote", kind: "create_quote" });
  });
  it("visszavont vagy régi verzió nem számít aktuális ajánlatnak", () => {
    const r = leadNextAction(base, [{ id: "q0", status: "withdrawn", is_current: true }, { id: "q1", status: "draft", is_current: false }], NOW);
    expect(r.kind).toBe("create_quote");
  });
  it("piszkozatnál a meglévő ajánlatot nyitja, nem újat hoz létre", () => {
    expect(leadNextAction(base, [{ id: "q1", status: "draft", is_current: true }], NOW)).toMatchObject({ step: "check", kind: "open_quote", quoteId: "q1" });
  });
  it("igazolt kiküldés után csak engedélyezett „Ajánlat kiadva” átmenetet javasol", () => {
    expect(leadNextAction(base, [{ id: "q1", status: "sent", sent_at: "2026-11-10T08:00:00Z", is_current: true }], NOW)).toMatchObject({ kind: "change_status", suggestStatus: "quote_sent" });
  });
  it("„Ajánlat kiadva” szakasz kiküldési bizonyíték nélkül figyelmeztet", () => {
    const r = leadNextAction({ ...base, status: "quote_sent" }, [{ id: "q1", status: "draft", is_current: true }], NOW);
    expect(r).toMatchObject({ step: "send", kind: "open_quote", quoteId: "q1" });
    expect(r.warnings).toContain("Kiküldés bizonyíték nélkül.");
  });
  it("elfogadott ajánlatnál Szerződés szakaszt javasol, utánkövetésből is", () => {
    expect(leadNextAction({ ...base, status: "follow_up" }, [{ id: "q1", status: "accepted", sent_at: "2026-11-10T08:00:00Z", is_current: true }], NOW)).toMatchObject({ step: "contract", suggestStatus: "contract" });
  });
  it("Szerződés szakaszban a Megnyertük → projekt a teendő", () => {
    expect(leadNextAction({ ...base, status: "contract" }, [], NOW)).toMatchObject({ step: "contract", kind: "win" });
  });
  it("megnyert és elveszett ügynél nincs művelet", () => {
    expect(leadNextAction({ ...base, status: "won" }, [], NOW).kind).toBe("none");
    expect(leadNextAction({ ...base, status: "lost" }, [], NOW).kind).toBe("none");
  });
  it("lejárt és hiányzó következő lépés figyelmeztetés", () => {
    expect(leadWarnings({ ...base, next_step_due_at: "2026-11-10T09:00:00Z" }, NOW)).toContain("A következő lépés határideje lejárt.");
    expect(leadWarnings({ ...base, next_step_type: null }, NOW)).toContain("Nincs mentett következő lépés határidővel.");
  });
  it("javasolt státusz mindig a meglévő állapotgépen belül marad", () => {
    for (const status of ["quote_prep", "quote_sent", "follow_up", "contract"]) {
      const r = leadNextAction({ ...base, status }, [{ id: "q", status: "accepted", sent_at: "x", is_current: true }], NOW);
      if (r.suggestStatus) expect(STATUS_TRANSITIONS[status as "quote_prep"]).toContain(r.suggestStatus);
    }
  });
});

describe("Kiküldés előtti ellenőrzés", () => {
  const ok = { kind: "viba_offer", title: "Teszt", companyId: "c", contactId: "p", contactEmail: "a@b.hu", net: 100000, mismatch: false, itemCount: 2, pricedDocCount: 0, sentOfferDocCount: 1, validUntil: "2026-12-01", hasMailbox: true };
  it("minden adat megvan → kész", () => {
    expect(quoteSendReadiness(ok)).toMatchObject({ ready: true, missingBlocking: 0 });
  });
  it("e-mail nélküli kapcsolattartó blokkol", () => {
    expect(quoteSendReadiness({ ...ok, contactEmail: null }).ready).toBe(false);
  });
  it("ismeretlen (null) összeg nem 0 Ft és blokkol", () => {
    expect(quoteSendReadiness({ ...ok, net: null }).ready).toBe(false);
  });
  it("saját ajánlat tétel nélkül blokkol, kapott költségvetésnél árazott Excel kell", () => {
    expect(quoteSendReadiness({ ...ok, itemCount: 0 }).ready).toBe(false);
    expect(quoteSendReadiness({ ...ok, kind: "received_budget", itemCount: 0, pricedDocCount: 0 }).ready).toBe(false);
    expect(quoteSendReadiness({ ...ok, kind: "received_budget", itemCount: 0, pricedDocCount: 1 }).ready).toBe(true);
  });
  it("összegeltérés blokkol", () => {
    expect(quoteSendReadiness({ ...ok, mismatch: true }).ready).toBe(false);
  });
  it("Gmail-fiók, cím, érvényesség és melléklet hiánya csak figyelmeztetés", () => {
    const r = quoteSendReadiness({ ...ok, hasMailbox: false, title: "", validUntil: null, sentOfferDocCount: 0 });
    expect(r.ready).toBe(true);
    expect(r.checks.filter((c) => !c.ok).map((c) => c.key).sort()).toEqual(["attachment", "mailbox", "title", "valid"]);
  });
});

describe("Szerződés-előkészítés", () => {
  const i = { leadStatus: "contract", acceptedQuote: true, companyId: "c", contactId: "p", net: 5, contractTermsDoc: true };
  it("elektronikus aláírás nem érhető el", () => { expect(ESIGN_AVAILABLE).toBe(false); });
  it("Megnyertük csak Szerződés szakaszból", () => {
    expect(contractReadiness(i).canWin).toBe(true);
    expect(contractReadiness({ ...i, leadStatus: "follow_up" }).canWin).toBe(false);
  });
  it("ügyfél nélkül nem javasolt a megnyerés", () => {
    expect(contractReadiness({ ...i, companyId: null }).canWin).toBe(false);
  });
  it("hiányzó feltétel-dokumentum vagy elfogadás csak figyelmeztetés", () => {
    expect(contractReadiness({ ...i, contractTermsDoc: false, acceptedQuote: false }).canWin).toBe(true);
  });
});

describe("Pipeline menü és napi hivatkozás", () => {
  it("csak engedélyezett köztes átmenet, megnyert/elveszett külön gombon", () => {
    expect(menuTransitions("quote_sent")).toEqual(["follow_up", "contract"]);
    expect(menuTransitions("contract")).toEqual([]);
    expect(menuTransitions("won")).toEqual([]);
  });
  it("Pipeline-ügy a Pipeline adatlapra, előkészítés a munkafelületre visz", () => {
    expect(dailyLeadTarget({ id: "l", pipeline_entered_at: "x", status: "follow_up" }).to).toBe("/sales/leads");
    expect(dailyLeadTarget({ id: "l", pipeline_entered_at: null, status: "new" }).to).toBe("/leads");
  });
});
