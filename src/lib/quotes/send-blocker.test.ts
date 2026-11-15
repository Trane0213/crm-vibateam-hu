import { describe, expect, it } from "vitest";
import { postSendPlan, quoteSendBlocker, replyHeadersFromThread } from "./send-policy";

const ok = { status: "draft", kind: "received_budget", net: 1_250_000, mismatch: false, itemCount: 0, attachedDocTypes: ["priced_budget"], extraAttachmentCount: 0 };
describe("ajánlat kiküldhetősége (szerver)", () => {
  it("teljes, árazott Excellel csatolt ajánlat kiküldhető", () => { expect(quoteSendBlocker(ok)).toBeNull(); });
  it("0 Ft-os ajánlat nem küldhető ki", () => { expect(quoteSendBlocker({ ...ok, net: 0 })).toMatch(/0 Ft/); });
  it("ismeretlen összeg nem küldhető ki", () => { expect(quoteSendBlocker({ ...ok, net: null })).not.toBeNull(); });
  it("visszavont ajánlat nem küldhető ki", () => { expect(quoteSendBlocker({ ...ok, status: "withdrawn" })).toMatch(/Visszavont/); });
  it("kapott költségvetés árazott Excel nélkül nem küldhető ki", () => { expect(quoteSendBlocker({ ...ok, attachedDocTypes: ["unpriced_budget"] })).toMatch(/árazott/); });
  it("melléklet nélkül nem küldhető ki", () => { expect(quoteSendBlocker({ ...ok, attachedDocTypes: [] })).toMatch(/melléklet/); });
  it("saját ajánlat tétel nélkül nem küldhető ki", () => { expect(quoteSendBlocker({ ...ok, kind: "viba_offer", itemCount: 0, attachedDocTypes: ["sent_offer"] })).toMatch(/tételek/); });
});

describe("kiküldés utáni automatikus lépések", () => {
  it("igazolt küldés: utánkövetés + Ajánlat előkészítése → Ajánlat kiadva", () => {
    expect(postSendPlan({ ok: true, leadStatus: "quote_prep", hasLead: true })).toEqual({ scheduleFollowup: true, advancePipeline: true });
  });
  it("figyelmeztetéssel (nem teljesen igazolt) semmi nem lép automatikusan", () => {
    expect(postSendPlan({ ok: true, warning: "x", leadStatus: "quote_prep", hasLead: true })).toEqual({ scheduleFollowup: false, advancePipeline: false });
  });
  it("duplikált (már elküldött) kérés nem léptet újra", () => {
    expect(postSendPlan({ ok: true, duplicate: true, leadStatus: "quote_prep", hasLead: true }).advancePipeline).toBe(false);
  });
  it("Pipeline-on kívüli ügy szakasza nem változik", () => {
    expect(postSendPlan({ ok: true, leadStatus: "contacted", hasLead: true }).advancePipeline).toBe(false);
  });
});

describe("válasz az eredeti Gmail-szálban", () => {
  it("az utolsó levél Message-ID-ja és a teljes References-lánc kerül a válaszba", () => {
    const r = replyHeadersFromThread([
      { headers: [{ name: "Message-ID", value: "<a@x>" }] },
      { headers: [{ name: "Message-Id", value: "<b@x>" }, { name: "References", value: "<a@x>" }, { name: "Subject", value: "Árazatlan Excel" }] },
    ]);
    expect(r).toEqual({ inReplyTo: "<b@x>", references: "<a@x> <b@x>", subject: "Árazatlan Excel" });
  });
  it("hibás Message-ID esetén nincs kitalált fejléc", () => {
    expect(replyHeadersFromThread([{ headers: [{ name: "Message-ID", value: "nincs" }] }])).toBeNull();
  });
});
