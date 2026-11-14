/**
 * P1 tárhelyréteg-próba (valódi R2, valódi feltöltőmotor, adatbázis nélkül).
 * A csomagtáblák helyett egy JSON-állapotfájl szimulálja a szerver nyilvántartását,
 * ugyanazzal a döntési logikával (decideRegistration) és folytatási szabállyal (R2 ListParts + MD5 = ETag).
 * Minden objektum az elkülönített `_qa/p1-package-test/<run>/` előtag alá kerül, és a végén törlődik.
 * Használat:  bun scripts/qa/p1_package_r2_test.ts <A|B|C> <csomagmappa> <állapotfájl>
 */
import fs from "fs"; import path from "path"; import { createHash } from "crypto";
for (const l of fs.readFileSync("/tmp/p1/r2.env", "utf8").split("\n")) { const i = l.indexOf("="); if (i > 0) process.env[l.slice(0, i)] = l.slice(i + 1); }
const m = await import("../../src/lib/packages/r2-multipart.server");
const { decideRegistration, fileFingerprint, isSystemJunk, planParts, partRange, safeKeyName } = await import("../../src/lib/packages/package-policy");
const { uploadFiles, UploadAborted } = await import("../../src/lib/packages/upload-engine");

const [phase, root, stateFile] = process.argv.slice(2);
type F = { id: string; path: string; size: number; sha: string; fp: string; key: string | null; uploadId: string | null; partSize: number; partCount: number; status: string; md5: Record<number, string>; revisionNo: number; revisionOf: string | null; duplicateOf: string | null };
const st: { run: string; files: F[]; log: string[] } = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { run: String(Date.now()), files: [], log: [] };
const save = () => fs.writeFileSync(stateFile, JSON.stringify(st, null, 1));
const log = (s: string) => { st.log.push(`${new Date().toISOString()} ${s}`); console.log(s); save(); };

function listLocal(dir: string) {
  const out: { blob: Blob; relativePath: string; lastModified: number; mime: null }[] = [];
  const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { const rel = path.relative(dir, p).split(path.sep).join("/"); if (!isSystemJunk(rel)) out.push({ blob: Bun.file(p), relativePath: rel, lastModified: Math.floor(fs.statSync(p).mtimeMs), mime: null }); } } };
  walk(dir); return out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

const limits = { maxFileBytes: 1024 ** 3, maxParentBytes: 5 * 1024 ** 3, maxFilesPerPackage: 5000 };
const transport = {
  async register(list: any[]) {
    // Sorban, mint a szerver (ügyenkénti zárolás alatt) – így az azonos kötegben lévő másolat is duplikátum.
    const out: any[] = [];
    for (const x of list) out.push(await this.registerOne(x));
    return out;
  },
  async registerOne(x: any) {
    {
      const fp = fileFingerprint(x);
      const same = st.files.find((f) => f.fp === fp && f.sha === x.sha256 && ["uploading", "verified", "duplicate"].includes(f.status));
      if (same?.status === "duplicate") return { relativePath: x.relativePath, action: "duplicate", fileId: same.id, ofPath: null };
      if (same) {
        if (same.status === "verified") return { relativePath: x.relativePath, action: "verified", fileId: same.id };
        const parts = await m.listParts(same.key!, same.uploadId!);
        const done = parts.filter((p) => { const r = partRange(same.size, same.partSize, p.partNumber); return same.md5[p.partNumber] === p.etag && p.size === r.end - r.start; }).map((p) => p.partNumber);
        log(`RESUME ${x.relativePath}: ${done.length}/${same.partCount} darab már a tárhelyen (R2 ListParts + MD5=ETag)`);
        return { relativePath: x.relativePath, action: "resume", fileId: same.id, partSize: same.partSize, partCount: same.partCount, doneParts: done };
      }
      const d = decideRegistration({ relativePath: x.relativePath, size: x.size, sha256: x.sha256 }, st.files.map((f) => ({ id: f.id, relativePath: f.path, sha256: f.sha, size: f.size, status: f.status as any, revisionNo: f.revisionNo, revisionOf: f.revisionOf, duplicateOf: f.duplicateOf })), limits);
      const id = crypto.randomUUID();
      if (d.action === "reject") return { relativePath: x.relativePath, action: "reject", reason: d.reason };
      if (d.action === "duplicate") { st.files.push({ id, path: x.relativePath, size: x.size, sha: x.sha256, fp, key: null, uploadId: null, partSize: 0, partCount: 0, status: "duplicate", md5: {}, revisionNo: 1, revisionOf: null, duplicateOf: d.of }); log(`DUPLIKÁTUM ${x.relativePath} → ${st.files.find((f) => f.id === d.of)!.path}`); return { relativePath: x.relativePath, action: "duplicate", fileId: id, ofPath: null }; }
      const { partSize, partCount } = planParts(x.size);
      const key = `_qa/p1-package-test/${st.run}/${id}/original/${safeKeyName(x.relativePath)}`;
      const uploadId = await m.createMultipart(key, "application/octet-stream");
      st.files.push({ id, path: x.relativePath, size: x.size, sha: x.sha256, fp, key, uploadId, partSize, partCount, status: "uploading", md5: {}, revisionNo: d.revisionNo, revisionOf: d.revisionOf, duplicateOf: null });
      save();
      if (d.revisionNo > 1) log(`REVÍZIÓ ${x.relativePath}: ${d.revisionNo}. változat`);
      return { relativePath: x.relativePath, action: "upload", fileId: id, partSize, partCount, doneParts: [] };
    }
  },
  async sign(fileId: string, parts: number[]) { const f = st.files.find((x) => x.id === fileId)!; return parts.map((n) => ({ partNumber: n, url: m.presignPart(f.key!, f.uploadId!, n) })); },
  async putDirect(url: string, body: Blob, signal?: AbortSignal) { const r = await fetch(url, { method: "PUT", body: await body.arrayBuffer(), signal }); if (!r.ok) throw new Error(`put ${r.status}`); },
  async relay() { throw new Error("nem használt"); },
  async record(fileId: string, parts: any[]) { const f = st.files.find((x) => x.id === fileId)!; for (const p of parts) f.md5[p.partNumber] = p.md5; save(); },
  async complete(fileId: string) {
    const f = st.files.find((x) => x.id === fileId)!;
    const parts = await m.listParts(f.key!, f.uploadId!);
    const bad = []; for (let n = 1; n <= f.partCount; n++) { const p = parts.find((q) => q.partNumber === n); const r = partRange(f.size, f.partSize, n); if (!p || p.etag !== f.md5[n] || p.size !== r.end - r.start) bad.push(n); }
    if (bad.length) { for (const n of bad) delete f.md5[n]; save(); return { ok: false, badParts: bad }; }
    await m.completeMultipart(f.key!, f.uploadId!, parts.map((p) => ({ partNumber: p.partNumber, etag: p.etag })));
    const h = await m.headObject(f.key!);
    if (!h || h.size !== f.size) return { ok: false, failed: true };
    f.status = "verified"; f.uploadId = null; save();
    return { ok: true };
  },
};

const files = listLocal(root);
const total = files.reduce((s, f) => s + f.blob.size, 0);
if (phase === "A" || phase === "B") {
  log(`${phase}: ${files.length} fájl, ${(total / 1e6).toFixed(1)} MB, mappák: ${[...new Set(files.map((f) => f.relativePath.split("/").slice(0, -1).join("/")))].filter(Boolean).length}`);
  const ac = new AbortController(); let sent = new Map<string, number>(); const t0 = Date.now();
  try {
    const out = await uploadFiles(files as any, { transport: transport as any, signal: ac.signal, concurrency: 4, onEvent: (e: any) => {
      if (e.type === "progress") { sent.set(e.relativePath, e.sentBytes); const s = [...sent.values()].reduce((a, b) => a + b, 0); if (phase === "A" && s > total * 0.4 && !ac.signal.aborted) { log(`A: MEGSZAKÍTÁS ${(s / total * 100).toFixed(0)}%-nál (${(s / 1e6).toFixed(0)} MB)`); ac.abort(); } }
    } });
    log(`${phase}: kész ${((Date.now() - t0) / 1000).toFixed(0)} s alatt: ` + out.map((o: any) => `${o.relativePath}=${o.state}${o.resumedParts ? `(+${o.resumedParts} folytatott darab)` : ""}`).join("; "));
  } catch (e) { if (e instanceof UploadAborted || ac.signal.aborted) log(`A: a munkamenet leállt, állapot mentve (${st.files.filter((f) => f.status === "uploading").length} félkész fájl)`); else throw e; }
}
if (phase === "C") {
  // Sértetlenség: minden ellenőrzött objektumot visszaolvasunk és SHA-256-ot számolunk.
  let ok = 0;
  for (const f of st.files.filter((x) => x.status === "verified")) {
    const res = await fetch(m.presign("GET", f.key!, {}, 900)); const h = createHash("sha256");
    for await (const chunk of res.body as any) h.update(chunk);
    const good = h.digest("hex") === f.sha; ok += good ? 1 : 0;
    log(`SHA ${good ? "OK" : "HIBA"} ${f.path} (${(f.size / 1e6).toFixed(1)} MB, rev ${f.revisionNo})`);
  }
  log(`C: ${ok}/${st.files.filter((x) => x.status === "verified").length} objektum bitre egyezik; duplikátum: ${st.files.filter((x) => x.status === "duplicate").length}`);
}
if (phase === "D") {
  for (const f of st.files) { if (f.uploadId) await m.abortMultipart(f.key!, f.uploadId).catch(() => {}); if (f.key && f.status === "verified") await fetch(m.presign("DELETE", f.key), { method: "DELETE" }); }
  const left = await Promise.all(st.files.filter((f) => f.key).map((f) => m.headObject(f.key!)));
  log(`D: tesztobjektumok törölve, maradt: ${left.filter(Boolean).length}`);
}
