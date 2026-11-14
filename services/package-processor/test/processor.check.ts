// A feldolgozó tesztjei kitalált TESZT-fájlokkal: node --test test/*.check.ts
// (A CRM-tesztekhez nem tartoznak; a tároló saját függőségeit használják.)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import XLSX from "xlsx";
import { sign, verify } from "../src/hmac.ts";
import { runJob } from "../src/job.ts";
import { safeEntryPath } from "../src/zip.ts";
import { detectCostTable, workbookStructure } from "../src/excel.ts";
import { splitPages, parsePdfInfo } from "../src/pdf.ts";
import type { ProcessorJob } from "../src/types.ts";

const FIX = mkdtempSync(join(tmpdir(), "ppfix-"));
const WORK = mkdtempSync(join(tmpdir(), "ppwork-"));
const puts = new Map<string, Buffer>();
let server: Server; let base = "";

before(async () => {
  execFileSync("python3", [join(import.meta.dirname, "make_fixtures.py"), FIX]);
  // TESZT árazatlan költségvetés képletekkel, rejtett lappal, egyesített cellával
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ["TESZT Társasház – árazatlan költségvetés"],
    [],
    ["Tételszám", "Megnevezés", "Mennyiség", "Egység", "Anyag egységár", "Díj egységár", "Anyag összesen", "Díj összesen"],
    [1, "Kábel NYY-J 3x2,5", 120, "m", null, null, null, null],
    [2, "Elosztószekrény ESZ-1", 1, "db", 0, 0, null, null],
    [3, "Lámpatest LED 36W", 24, "db", 15000, 4000, null, null],
  ]);
  for (const r of [4, 5, 6]) { ws[`G${r}`] = { t: "n", v: 0, f: `C${r}*E${r}` }; ws[`H${r}`] = { t: "n", v: 0, f: `C${r}*F${r}` }; }
  ws["G7"] = { t: "n", v: 0, f: "SUM(G4:G6)" };
  ws["!ref"] = "A1:H7";
  ws["!merges"] = [XLSX.utils.decode_range("A1:H1")];
  XLSX.utils.book_append_sheet(wb, ws, "Költségvetés");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["belső", 1]]), "Rejtett");
  wb.Workbook = { Sheets: [{ Hidden: 0 }, { Hidden: 1 }] } as any;
  writeFileSync(join(FIX, "koltsegvetes.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  server = createServer((req, res) => {
    if (req.method === "PUT") { const c: Buffer[] = []; req.on("data", (d) => c.push(d)); req.on("end", () => { puts.set(req.url!, Buffer.concat(c)); res.end(); }); return; }
    try { res.end(readFileSync(join(FIX, decodeURIComponent(req.url!.slice(1))))); } catch { res.statusCode = 404; res.end(); }
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});
after(() => server.close());

function job(name: string, kind: ProcessorJob["kind"], extra: Partial<ProcessorJob> = {}): ProcessorJob {
  const p = join(FIX, name);
  return {
    v: 1, jobId: "11111111-1111-4111-8111-111111111111", token: "22222222-2222-4222-8222-222222222222", fileId: "33333333-3333-4333-8333-333333333333",
    kind, name, relativePath: `TESZT/${name}`, size: statSync(p).size, sha256: createHash("sha256").update(readFileSync(p)).digest("hex"), depth: 0,
    sourceUrl: `${base}/${encodeURIComponent(name)}`, derivedPutUrl: `${base}/derived/${name}.json.gz`, callbackUrl: `${base}/cb`,
    limits: { ocr: true, maxZipEntries: 20000, maxExpandRatio: 200, maxEntryBytes: 1 << 30, maxPdfPages: 5000, maxSpreadsheetBytes: 150 << 20, maxUnitChars: 200000 },
    ...extra,
  };
}
function fakeCrm(opts: { ocr?: "ok" | "skipped" } = {}) {
  const calls: { action: string; p: any }[] = [];
  let n = 0;
  const cb = async (action: string, p: any = {}) => {
    calls.push({ action, p });
    if (action === "ocr") return opts.ocr === "skipped" ? { status: "skipped", reason: "ocr_budget" } : { status: "ok" };
    if (action === "entry") return p.name === "masolat.txt" ? { action: "duplicate", fileId: "dup" } : { action: "upload", fileId: `child-${++n}`, putUrl: `${base}/put/${encodeURIComponent(p.entry)}` };
    return {};
  };
  return { calls, cb };
}

test("aláírás: helyes elfogadva, módosított törzs, rossz kulcs és lejárt időbélyeg elutasítva", () => {
  const h = sign("titok", '{"a":1}', 1000);
  assert.equal(verify("titok", '{"a":1}', h, 1100), true);
  assert.equal(verify("titok", '{"a":2}', h, 1100), false);
  assert.equal(verify("mas", '{"a":1}', h, 1100), false);
  assert.equal(verify("titok", '{"a":1}', h, 1000 + 301), false);
});

test("PDF: szövegréteges oldalak kiolvasva, a szkennelt oldal képfelismerésre megy", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("tervlap-vegyes.pdf", "pdf"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.ok(r);
  assert.equal(r.status, "done"); assert.equal(r.pageCount, 3); assert.equal(r.textPages, 2); assert.equal(r.ocrPages, 1);
  const units = crm.calls.filter((c) => c.action === "units").flatMap((c) => c.p.units);
  assert.deepEqual(units.map((u: any) => u.unitNo), [1, 3]);
  assert.match(units[0].text, /VT-E-01 rev B/);
  const ocr = crm.calls.find((c) => c.action === "ocr")!;
  assert.equal(ocr.p.unitNo, 2); assert.equal(ocr.p.mime, "image/jpeg");
  assert.ok(Buffer.from(ocr.p.imageBase64, "base64").length < 4_500_000);
});

test("PDF: ha a képfelismerési keret elfogyott, az oldal kihagyott és részlegesként jelölt", async () => {
  const crm = fakeCrm({ ocr: "skipped" });
  const r = await runJob(job("tervlap-vegyes.pdf", "pdf"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "partial"); assert.equal(r!.ocrSkipped, 1);
  assert.ok(r!.problems.some((p) => p.code === "ocr_budget" && p.page === 2));
});

test("Excel: munkalapok, képletek, egyesített cella, rejtett lap megmarad; árazatlan tételek felismerve", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("koltsegvetes.xlsx", "spreadsheet"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "done"); assert.equal(r!.sheetCount, 2); assert.equal(r!.formulaCount, 7);
  assert.ok(r!.problems.some((p) => p.code === "hidden_sheet" && p.sheet === "Rejtett"));
  const ct = (r!.summary.costTables as any[])[0];
  assert.equal(ct.headerRow, 3); assert.equal(ct.itemRows, 3); assert.equal(ct.unpricedRows, 2);
  const structure = JSON.parse(gunzipSync(puts.get("/derived/koltsegvetes.xlsx.json.gz")!).toString());
  const sheet = structure.sheets[0];
  assert.deepEqual(sheet.merges, ["A1:H1"]);
  assert.ok(sheet.cells.some((c: any[]) => c[0] === "G7" && c[3] === "SUM(G4:G6)"));
  assert.equal(structure.sheets[1].state, "hidden");
});

test("Excel: az eredeti fájl bájtra változatlan marad a feldolgozás után", () => {
  const before = createHash("sha256").update(readFileSync(join(FIX, "koltsegvetes.xlsx"))).digest("hex");
  const wb = XLSX.read(readFileSync(join(FIX, "koltsegvetes.xlsx")), { cellFormula: true });
  workbookStructure(wb, "x");
  assert.equal(createHash("sha256").update(readFileSync(join(FIX, "koltsegvetes.xlsx"))).digest("hex"), before);
});

test("ZIP: mappaszerkezettel kibontva, rendszerfájl kihagyva, duplikátum nem töltődik fel újra", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("csomag.zip", "archive"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "done"); assert.equal(r!.entryCount, 4); assert.equal(r!.extractedCount, 3);
  const entries = crm.calls.filter((c) => c.action === "entry").map((c) => c.p.entry).sort();
  assert.deepEqual(entries, ["Koltsegvetes/leiras.txt", "Koltsegvetes/masolat.txt", "Terv/E-Erosaram/E-01.pdf", "Terv/G-Gyengearam/G-01.pdf"]);
  assert.equal(puts.get("/put/" + encodeURIComponent("Koltsegvetes/leiras.txt"))!.toString(), "TESZT muszaki leiras\nKabeltalca 50 m\n");
  assert.equal(crm.calls.filter((c) => c.action === "entry_done").length, 3);
});

test("ZIP: kilépő és abszolút útvonal nem bontható ki, a jó bejegyzés igen", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("veszelyes.zip", "archive"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "partial"); assert.equal(r!.extractedCount, 1);
  assert.equal(r!.problems.filter((p) => p.code === "path_unsafe").length, 2);
  assert.equal(safeEntryPath("../x"), null); assert.equal(safeEntryPath("C:/x"), null); assert.equal(safeEntryPath("a/./b.pdf"), "a/b.pdf");
});

test("ZIP: túlzott tömörítési arány (ZIP-bomba) → nem bontjuk ki", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("bomba.zip", "archive"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "unreadable"); assert.equal(r!.problems[0].code, "zip_bomb");
  assert.equal(crm.calls.filter((c) => c.action === "entry").length, 0);
});

test("Sértetlenség: eltérő SHA-256 → sérült, nincs feldolgozás", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("csomag.zip", "archive", { sha256: "0".repeat(64) }), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "corrupt"); assert.equal(r!.sha256Ok, false);
  assert.equal(crm.calls.filter((c) => c.action === "entry").length, 0);
});

test("Kép: képfelismerésre küldve; szöveges fájl darabolva", async () => {
  const crm = fakeCrm();
  const r = await runJob(job("scan.jpg", "image"), { secret: "s", workDir: WORK, callback: crm.cb });
  assert.equal(r!.status, "done"); assert.equal(crm.calls.filter((c) => c.action === "ocr").length, 1);
  assert.deepEqual(splitPages("a\fb\f", 2), ["a", "b"]);
  assert.equal(parsePdfInfo("Pages:          12\nEncrypted:      no").pages, 12);
});

test("Költségvetés-felismerés: fejléc nélküli lapon nincs találat", () => {
  assert.equal(detectCostTable("x", [["a", "b"], [1, 2]]), null);
});

test("hálózati korlát: csak a beállított tárhely és CRM-cím fogadható el", async () => {
  const { allowFromEnv, jobAllowed } = await import("../src/types.ts");
  const allow = allowFromEnv({ ALLOWED_STORAGE_HOSTS: "acc.r2.cloudflarestorage.com", ALLOWED_CALLBACK_ORIGINS: "https://crm.example.hu" });
  const base: any = { sourceUrl: "https://acc.r2.cloudflarestorage.com/b/k?X-Amz-Signature=1", derivedPutUrl: null, callbackUrl: "https://crm.example.hu/api/public/package-processor" };
  assert.equal(jobAllowed(base, allow), true);
  assert.equal(jobAllowed({ ...base, sourceUrl: "https://169.254.169.254/latest" }, allow), false);
  assert.equal(jobAllowed({ ...base, callbackUrl: "https://evil.example/x" }, allow), false);
  assert.equal(jobAllowed({ ...base, derivedPutUrl: "https://other.host/x" }, allow), false);
  assert.equal(jobAllowed({ ...base, sourceUrl: "http://acc.r2.cloudflarestorage.com/b/k" }, allow), false);
  assert.equal(jobAllowed(base, allowFromEnv({})), false);
});
