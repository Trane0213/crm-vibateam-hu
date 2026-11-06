import { describe, it, expect } from "vitest";
import { analyzeThread, buildContactIndex, nextHistoryCheckpoint, isPermanentMessageError } from "./relink-analysis";

const idx = buildContactIndex([
  { id: "c1", email: "Anna@Acme.hu", company_id: "A" },
  { id: "c2", email: "bela@beta.hu", company_id: "B" },
  { id: "c3", email: "info@acme.hu", company_id: "A" },
  { id: "c4", email: "nocomp@x.hu", company_id: null },
]);
const T = (company_id: string | null = null) => ({ id: "t", company_id, contact_id: null, subject: "Szál tárgy", last_message_at: null });
const out = (to: string[], extra: Record<string, unknown> = {}) => ({ from_email: "info@vibateam.hu", to_emails: to, cc_emails: [], is_outbound: true, internal_date: "2026-10-01T10:00:00Z", subject: "", gmail_message_id: "gmail-id", gmail_label_ids: ["SENT"], ...extra });
const inn = (from: string, at = "2026-10-02T10:00:00Z") => ({ from_email: from, to_emails: ["info@vibateam.hu"], cc_emails: [], is_outbound: false, internal_date: at, subject: null, gmail_label_ids: ["INBOX"] });
const MB = "info@vibateam.hu";

describe("relink dry-run", () => {
  it("pontos kontakt-email, egy cég → biztosan kapcsolható, tárgy fallback, válasz felismerve", () => {
    const r = analyzeThread(T(), [out(["anna@acme.hu"]), inn("Anna <anna@acme.hu>")], MB, idx);
    expect(r.category).toBe("certain");
    expect(r.suggested_company_id).toBe("A");
    expect(r.subject).toBe("Szál tárgy");
    expect(r.replied).toBe(true);
  });
  it("két cég kontaktja → ütközés, nincs javaslat", () => {
    expect(analyzeThread(T(), [out(["anna@acme.hu", "bela@beta.hu"])], MB, idx).category).toBe("conflict");
  });
  it("mentett cégtől eltérő egyezés → ütközés", () => {
    expect(analyzeThread(T("B"), [out(["anna@acme.hu"])], MB, idx).category).toBe("conflict");
  });
  it("mentett cég ellentmondás nélkül → öröklés", () => {
    expect(analyzeThread(T("A"), [out(["anna@acme.hu"])], MB, idx).category).toBe("linked");
  });
  it("csak domain-egyezés → ellenőrizendő, soha nem biztos", () => {
    const r = analyzeThread(T(), [out(["uj@acme.hu"])], MB, idx);
    expect(r.category).toBe("review");
    expect(r.evidence.join()).toMatch(/domain/);
  });
  it("gyűjtőcím és körlevél → ellenőrizendő", () => {
    expect(analyzeThread(T(), [out(["info@acme.hu"])], MB, idx).category).toBe("review");
    const many = Array.from({ length: 9 }, (_, i) => `x${i}@zz.hu`);
    expect(analyzeThread(T(), [out(["anna@acme.hu", ...many])], MB, idx).category).toBe("review");
  });
  it("céghez nem kötött kontakt → ellenőrizendő", () => {
    expect(analyzeThread(T(), [out(["nocomp@x.hu"])], MB, idx).category).toBe("review");
  });
  it("belső és tesztcím → belső", () => {
    expect(analyzeThread(T(), [out(["ramon.dencsi@vibateam.hu", "viktor.csotai@gmail.com"])], MB, idx).category).toBe("internal");
  });
  it("ismeretlen külső cím → CRM-kontakt hiányzik", () => {
    expect(analyzeThread(T(), [out(["valaki@ismeretlen.hu"])], MB, idx).category).toBe("no_contact");
  });
});

describe("szinkron checkpoint", () => {
  it("feldolgozatlan vagy átmeneti hibás üzenetnél marad", () => {
    expect(nextHistoryCheckpoint({ start: "1", latest: "9", pending: 2, transientErrors: 0 })).toBe("1");
    expect(nextHistoryCheckpoint({ start: "1", latest: "9", pending: 0, transientErrors: 1 })).toBe("1");
    expect(nextHistoryCheckpoint({ start: "1", latest: "9", pending: 0, transientErrors: 0 })).toBe("9");
  });
  it("404 végleges hiba, timeout nem", () => {
    expect(isPermanentMessageError("Gmail getMessage 404 Not Found")).toBe(true);
    expect(isPermanentMessageError("fetch timeout")).toBe(false);
  });
});

describe("saját (Viba-Team) céghez mentett szálak", () => {
  const S = new Set(["SELF"]);
  const i2 = buildContactIndex([{ id: "c1", email: "anna@acme.hu", company_id: "A" }, { id: "c2", email: "bela@beta.hu", company_id: "B" }, { id: "s", email: "ramon.dencsi@vibateam.hu", company_id: "SELF" }]);
  it("külső megkeresés nem számít helyesen kapcsoltnak; pontos kontakt → másik cég javaslat", () => {
    const r = analyzeThread(T("SELF"), [out(["anna@acme.hu"])], MB, i2, S);
    expect(r.category).toBe("self_other_company");
    expect(r.suggested_company_id).toBe("A");
  });
  it("csak belső → self_internal", () => {
    expect(analyzeThread(T("SELF"), [out(["ramon.dencsi@vibateam.hu"])], MB, i2, S).category).toBe("self_internal");
  });
  it("két ügyfélcég → self_conflict, nincs javaslat", () => {
    const r = analyzeThread(T("SELF"), [out(["anna@acme.hu", "bela@beta.hu"])], MB, i2, S);
    expect(r.category).toBe("self_conflict");
    expect(r.suggested_company_id).toBeNull();
  });
  it("ismeretlen cím → self_no_contact; domain → self_conflict", () => {
    expect(analyzeThread(T("SELF"), [out(["x@ismeretlen.hu"])], MB, i2, S).category).toBe("self_no_contact");
    expect(analyzeThread(T("SELF"), [out(["uj@acme.hu"])], MB, i2, S).category).toBe("self_conflict");
  });
  it("promóció → self_bulk", () => {
    expect(analyzeThread(T("SELF"), [inn("news@shop.hu")].map(m => ({ ...m, gmail_label_ids: ["CATEGORY_PROMOTIONS"] })), MB, i2, S).category).toBe("self_bulk");
  });
});

it('draft is not a sent outreach or a reply trigger',()=>{const r=analyzeThread(T(),[out(['anna@acme.hu'],{gmail_label_ids:['SENT','DRAFT']}),inn('anna@acme.hu')],MB,idx);expect(r.outbound).toBe(0);expect(r.replied).toBe(false);});
it('unrelated sender in same thread is not a reply',()=>expect(analyzeThread(T(),[out(['anna@acme.hu']),inn('bela@beta.hu')],MB,idx).replied).toBe(false));
it('incoming before sent is not a reply',()=>expect(analyzeThread(T(),[inn('anna@acme.hu','2026-09-01T00:00:00Z'),out(['anna@acme.hu'])],MB,idx).replied).toBe(false));
it('multiple external participants cannot be certain',()=>expect(analyzeThread(T(),[out(['anna@acme.hu','unknown@else.hu'])],MB,idx).category).toBe('review'));
it('saved company without exact contact is not linked',()=>expect(analyzeThread(T('A'),[out(['unknown@else.hu'])],MB,idx).category).toBe('review'));
