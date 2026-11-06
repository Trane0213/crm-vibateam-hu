import { describe, expect, it } from "vitest";
import { assertSenderIdentity, defaultMailbox, mailboxResult, type Mailbox } from "./mailbox-model";

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
  it("401 Response nem kerül sikeres postafióklistaként a képernyőre", async () => {
    await expect(mailboxResult(Promise.resolve(new Response("Unauthorized: invalid token", { status: 401 })), "mailboxes")).rejects.toThrow("munkamenet");
  });
  it("hibás lista és hibás lap nem lesz sikeres vagy üres adat", async () => {
    await expect(mailboxResult(Promise.resolve({ error: "failed" }), "mailboxes")).rejects.toThrow("hibás");
    await expect(mailboxResult(Promise.resolve({ rows: [], total: 0 }), "page")).rejects.toThrow("hibás");
  });
  it("érvényes lista, üres lista és postafióklap változatlanul megmarad", async () => {
    expect(await mailboxResult(Promise.resolve(mailboxes), "mailboxes")).toEqual(mailboxes);
    expect(await mailboxResult(Promise.resolve([]), "mailboxes")).toEqual([]);
    const page = { rows: [], total: 0, counts: { all: 0 } };
    expect(await mailboxResult(Promise.resolve(page), "page")).toEqual(page);
  });
});