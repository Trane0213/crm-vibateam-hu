import { describe, it, expect } from "vitest";
import { buildKey, checkFile, isOwnOutboundKey, safeFileName, UPLOAD_ROLES, MAX_BYTES } from "./r2-policy";

const U = "11111111-1111-1111-1111-111111111111";
const P = "22222222-2222-2222-2222-222222222222";

describe("R2 dokumentumvédelem (1/C)", () => {
  it("marketing nem tölthet fel projektdokumentumot, céges dokumentumot igen", () => {
    expect(UPLOAD_ROLES.project).not.toContain("marketing");
    expect(UPLOAD_ROLES.company).toContain("marketing");
    expect(UPLOAD_ROLES.project).toEqual(expect.arrayContaining(["sales", "project_manager"]));
  });

  it("szerepkör nélküli felhasználó egyik célra sem tölthet fel", () => {
    for (const roles of Object.values(UPLOAD_ROLES)) expect(roles).not.toContain("");
  });

  it("méretkorlát: dokumentum 50 MB, levélmelléklet 20 MB", () => {
    expect(checkFile("project", "a.pdf", "application/pdf", MAX_BYTES.project + 1)).not.toBeNull();
    expect(checkFile("project", "a.pdf", "application/pdf", 50 * 1024 * 1024)).toBeNull();
    expect(checkFile("outbound", "a.pdf", "application/pdf", 20 * 1024 * 1024 + 1)).not.toBeNull();
    expect(checkFile("company", "a.pdf", "application/pdf", 0)).not.toBeNull();
  });

  it("tiltott és álcázott fájltípus elutasítva", () => {
    expect(checkFile("company", "virus.exe", "application/x-msdownload", 10)).not.toBeNull();
    expect(checkFile("company", "page.html", "text/html", 10)).not.toBeNull();
    expect(checkFile("company", "fake.pdf", "text/html", 10)).not.toBeNull();
    expect(checkFile("company", "noext", "", 10)).not.toBeNull();
    expect(checkFile("project", "terv.dwg", "", 10)).toBeNull();
    expect(checkFile("project", "arajanlat.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 10)).toBeNull();
  });

  it("a tárolási kulcsot a szerver állítja elő, útvonal-kitörés nélkül", () => {
    const k = buildKey({ purpose: "company", targetId: P, category: "marketing", userId: U, fileName: "../../x/../a b.pdf", unique: "abc" });
    expect(k.startsWith(`company-documents/${P}/marketing/`)).toBe(true);
    expect(k).not.toContain("..");
    expect(buildKey({ purpose: "project", targetId: null, category: "other", userId: U, fileName: "a.pdf", unique: "x" }).startsWith("global/other/")).toBe(true);
    expect(buildKey({ purpose: "outbound", targetId: null, category: "", userId: U, fileName: "a.pdf", unique: "x" }).startsWith(`outbound-attachments/${U}/`)).toBe(true);
    expect(safeFileName("..")).toBe("file");
  });

  it("kimenő levélhez csak a saját mellékletkulcs csatolható", () => {
    expect(isOwnOutboundKey(`outbound-attachments/${U}/1-a.pdf`, U)).toBe(true);
    expect(isOwnOutboundKey(`outbound-attachments/${P}/1-a.pdf`, U)).toBe(false);
    expect(isOwnOutboundKey(`company-documents/${P}/marketing/a.pdf`, U)).toBe(false);
    expect(isOwnOutboundKey(`outbound-attachments/${U}/../../company-documents/x.pdf`, U)).toBe(false);
    expect(isOwnOutboundKey("outbound-attachments/1-legacy.pdf", U)).toBe(false);
  });
});
