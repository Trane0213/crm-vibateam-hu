import { describe, expect, it } from "vitest";
import { assertSenderIdentity, defaultMailbox, type Mailbox } from "./mailbox-model";

const mailboxes: Mailbox[] = [
  { userId: "info", email: "info@vibateam.hu", name: null, active: true, authError: false, lastSync: null },
  { userId: "laci", email: "pretor.laszlo@vibateam.hu", name: null, active: true, authError: false, lastSync: null },
  { userId: "ramon", email: "ramon.dencsi@vibateam.hu", name: null, active: true, authError: false, lastSync: null },
];
describe("Postafiókok alapértelmezése és küldőazonosság", () => {
  it("Laci saját postafiókját választja, nem az Összes nézetet", () => {
    expect(defaultMailbox(mailboxes, "laci")).toBe("pretor.laszlo@vibateam.hu");
  });
  it("Ramon saját postafiókját választja", () => {
    expect(defaultMailbox(mailboxes, "ramon")).toBe("ramon.dencsi@vibateam.hu");
  });
  it("tulajdonosnak konkrét aktív postafiókot választ", () => {
    expect(defaultMailbox(mailboxes, "owner")).toBe("info@vibateam.hu");
  });
  it("archív postafiók nem előzi meg az aktívat", () => {
    expect(defaultMailbox([{ ...mailboxes[0], active: false }, mailboxes[1]], "info")).toBe("pretor.laszlo@vibateam.hu");
  });
  it("info nem küldhet Laci helyett", () => {
    expect(() => assertSenderIdentity("pretor.laszlo@vibateam.hu", "info@vibateam.hu", "info@vibateam.hu")).toThrow();
  });
  it("a tényleges Gmail-azonosság eltérését elutasítja", () => {
    expect(() => assertSenderIdentity(undefined, "info@vibateam.hu", "ramon.dencsi@vibateam.hu")).toThrow();
  });
  it("saját Gmail-azonosságot elfogad", () => {
    expect(() => assertSenderIdentity("INFO@vibateam.hu", "info@vibateam.hu", "info@vibateam.hu")).not.toThrow();
  });
});