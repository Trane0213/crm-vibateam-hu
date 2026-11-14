import { afterEach, describe, expect, it, vi } from "vitest";
import { sign as processorSign, verify as processorVerify } from "../../../services/package-processor/src/hmac";
import {
  buildReport, extractedRelativePath, isStale, jobKindOf, ocrAllowed, parseResult, parseUnits, resolveProcessing,
} from "./processing-policy";
import { handleCallback, signBody, verifyBody } from "./processing.server";

describe("P2 feldolgozási szabályok", () => {
  it("csak a P2-ben támogatott típusok kerülnek feldolgozásra", () => {
    expect(jobKindOf("A-101.pdf")).toBe("pdf");
    expect(jobKindOf("koltsegvetes.xlsx")).toBe("spreadsheet");
    expect(jobKindOf("terv.zip")).toBe("archive");
    expect(jobKindOf("foto.JPG")).toBe("image");
    expect(jobKindOf("leiras.docx")).toBe("text");
    expect(jobKindOf("alaprajz.dwg")).toBeNull();   // CAD: P4
    expect(jobKindOf("level.eml")).toBeNull();
    expect(jobKindOf("kep.heic")).toBeNull();
  });

  it("ZIP-ből kibontott fájl a ZIP nevével azonos mappába kerül, a belső szerkezettel", () => {
    expect(extractedRelativePath("Kiviteli/terv.zip", "E-epitesz/A-101.pdf")).toBe("Kiviteli/terv/E-epitesz/A-101.pdf");
    expect(extractedRelativePath("csomag.ZIP", "a.txt")).toBe("csomag/a.txt");
    expect(() => extractedRelativePath("x.zip", "../../kilep.txt")).toThrow();
  });

  it("képfelismerési keret: csomagonként a beállított oldalszámig, kikapcsolva soha", () => {
    const s = resolveProcessing({ ocrPagesPerPackage: 2 });
    expect(ocrAllowed(1, s)).toBe(true);
    expect(ocrAllowed(2, s)).toBe(false);
    expect(ocrAllowed(0, resolveProcessing({ ocrEnabled: false }))).toBe(false);
    expect(resolveProcessing({}).ocrPagesPerPackage).toBe(300);
  });

  it("20 percnél régebben jelentkezett feladat elakadtnak számít", () => {
    const now = Date.parse("2026-11-14T12:00:00Z");
    expect(isStale({ status: "running", heartbeat_at: "2026-11-14T11:30:00Z", dispatched_at: null }, now)).toBe(true);
    expect(isStale({ status: "running", heartbeat_at: "2026-11-14T11:50:00Z", dispatched_at: null }, now)).toBe(false);
    expect(isStale({ status: "done", heartbeat_at: "2026-11-14T10:00:00Z", dispatched_at: null }, now)).toBe(false);
  });

  it("a feldolgozó nem küldhet AI-kiolvasottnak jelölt szöveget (csak a CRM menthet ilyet)", () => {
    expect(parseUnits([{ unitKind: "page", unitNo: 1, label: "1. oldal", source: "text_layer", text: "x" }])).toHaveLength(1);
    expect(parseUnits([{ unitKind: "page", unitNo: 1, label: null, source: "ocr", text: "hamis" }])).toBeNull();
    expect(parseUnits([])).toBeNull();
    expect(parseUnits([{ unitKind: "page", unitNo: 0, label: null, source: "text_layer", text: "x" }])).toBeNull();
  });

  it("eredmény: ismeretlen állapot elutasítva, számok szűrve", () => {
    expect(parseResult({ status: "kész", parser: "pdf" })).toBeNull();
    const r = parseResult({ status: "partial", parser: "pdf", sha256Ok: true, pageCount: 3, textPages: -1, problems: [{ code: "ocr_budget", page: 2 }], summary: {} })!;
    expect(r.nums.page_count).toBe(3);
    expect(r.nums.text_pages).toBeNull();
    expect(r.problems[0].code).toBe("ocr_budget");
  });
});

describe("P2 csomagjelentés", () => {
  const file = (id: string, path: string, extra: Partial<any> = {}) => ({ id, relativePath: path, size: 1, status: "verified", processingStatus: "waiting", errorCode: null, extractedFrom: null, duplicateOf: null, ...extra });
  const ext = (file_id: string, status: any, extra: Partial<any> = {}) => ({ file_id, status, parser: "x", page_count: null, text_pages: null, ocr_pages: null, ocr_skipped: null, unreadable_pages: null, sheet_count: null, formula_count: null, entry_count: null, extracted_count: null, has_macros: false, encrypted: false, problems: [], summary: {}, ...extra });

  it("minden fájlról megmondja, sikerült-e és miért nem", () => {
    const r = buildReport(
      [file("1", "a.pdf"), file("2", "b.pdf"), file("3", "c.dwg", { processingStatus: "not_supported" }), file("4", "d.xlsx"), file("5", "e.pdf", { status: "duplicate" }), file("6", "z/f.pdf", { extractedFrom: "9" }), file("7", "g.pdf", { status: "aborted" })],
      [ext("1", "done", { page_count: 10, text_pages: 10 }), ext("2", "unreadable", { encrypted: true, problems: [{ code: "encrypted" }] }), ext("6", "partial", { problems: [{ code: "ocr_budget", page: 3 }] })],
      [{ file_id: "4", status: "failed", error_code: "processor_error", heartbeat_at: null, dispatched_at: null, created_at: "2026-11-14T10:00:00Z" }],
    );
    const by = Object.fromEntries(r.rows.map((x) => [x.path, x]));
    expect(r.totals.files).toBe(6);              // megszakított feltöltés nem számít
    expect(by["a.pdf"].state).toBe("processed");
    expect(by["b.pdf"].state).toBe("unreadable");
    expect(by["b.pdf"].reasons[0]).toMatch(/Jelszóval/);
    expect(by["b.pdf"].retryable).toBe(false);   // jelszavas: újrapróbálás nem segít
    expect(by["c.dwg"].state).toBe("not_supported");
    expect(by["d.xlsx"].state).toBe("failed");
    expect(by["d.xlsx"].retryable).toBe(true);
    expect(by["e.pdf"].state).toBe("duplicate");
    expect(by["z/f.pdf"].fromArchive).toBe(true);
    expect(by["z/f.pdf"].reasons[0]).toMatch(/kerete elfogyott/);
    expect(r.rows[0].state).toBe("failed");      // a problémás fájlok elöl
    expect(r.totals.extractedFromZip).toBe(1);
  });
});

describe("P2 visszajelzés-hitelesítés", () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it("a CRM és a feldolgozó aláírása kölcsönösen elfogadott", () => {
    const secret = "s".repeat(40), body = JSON.stringify({ a: 1 });
    expect(verifyBody(secret, body, processorSign(secret, body))).toBe(true);
    expect(processorVerify(secret, body, signBody(secret, body))).toBe(true);
    expect(verifyBody(secret, body + " ", processorSign(secret, body))).toBe(false);
    expect(verifyBody(secret, body, processorSign(secret, body, Math.floor(Date.now() / 1000) - 3600))).toBe(false);
  });

  it("beállított titok nélkül a visszajelzési cím zárva", async () => {
    vi.stubEnv("PACKAGE_PROCESSOR_SECRET", "");
    expect((await handleCallback("{}", null, { admin: {} as any })).status).toBe(503);
  });

  it("aláírás nélküli vagy hamis aláírású üzenet elutasítva, adatbázishoz nem nyúl", async () => {
    vi.stubEnv("PACKAGE_PROCESSOR_SECRET", "k".repeat(40));
    const admin = new Proxy({}, { get: () => { throw new Error("adatbázis nem érhető el ebben a tesztben"); } });
    const body = JSON.stringify({ jobId: "00000000-0000-4000-8000-000000000000", token: "00000000-0000-4000-8000-000000000001", action: "result" });
    expect((await handleCallback(body, null, { admin: admin as any })).status).toBe(401);
    expect((await handleCallback(body, processorSign("masik".repeat(10), body), { admin: admin as any })).status).toBe(401);
  });

  it("ismeretlen feladat vagy rossz token: 403", async () => {
    vi.stubEnv("PACKAGE_PROCESSOR_SECRET", "k".repeat(40));
    const job = { id: "00000000-0000-4000-8000-000000000000", token: "00000000-0000-4000-8000-0000000000ff", status: "running" };
    const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: job }) };
    const admin = { from: () => q };
    const body = JSON.stringify({ jobId: job.id, token: "00000000-0000-4000-8000-000000000001", action: "started" });
    expect((await handleCallback(body, processorSign("k".repeat(40), body), { admin: admin as any })).status).toBe(403);
  });
});
