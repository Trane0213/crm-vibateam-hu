// ZIP: biztonságos kibontás (útvonal-, méret-, darabszám- és arányellenőrzéssel), a mappaszerkezet
// megőrzésével. Minden bejegyzés külön, változatlan fájlként kerül a tárhelyre a CRM által aláírt címre;
// az eredeti ZIP érintetlen marad. Titkosított bejegyzést, szimbolikus linket nem bontunk ki.
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { putFile } from "./io.ts";
import type { Callback } from "./callback.ts";
import type { ExtractResult, ProcessorJob, Problem } from "./types.ts";

// Hungarian Windows ZIP-ek gyakran CP852 kódolású nevet írnak UTF-8 jelzés nélkül.
const CP852 = "ÇüéâäůćçłëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤťŁ×čáíóúĄąŽžĘę¬źČş«»░▒▓│┤ÁÂĚŞ╣║╗╝Żż┐└┴┬├─┼Ăă╚╔╩╦╠═╬¤đĐĎËďŇÍÎě┘┌█▄ŢŮ▀ÓßÔŃńňŠšŔÚŕŰýÝţ´\u00ad˝˛ˇ˘§÷¸°¨˙űŘř■\u00a0";
/** Bejegyzésnév dekódolása: UTF-8 jelzés vagy érvényes UTF-8 → UTF-8, különben CP852. */
export function decodeEntryName(raw: Buffer, utf8Flag: boolean): string {
  if (utf8Flag) return raw.toString("utf8");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(raw); }
  catch { return [...raw].map((b) => (b < 0x80 ? String.fromCharCode(b) : CP852[b - 0x80])).join(""); }
}

const SKIP = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini|\._[^/]*)(\/|$)/i;
const CONTROL = /[\u0000-\u001f\u007f]/g;

/** ZIP-en belüli útvonal ellenőrzése: nincs abszolút út, meghajtó, "..", vezérlőkarakter. */
export function safeEntryPath(raw: string): string | null {
  const p = String(raw ?? "").replace(/\\/g, "/").replace(CONTROL, "").trim();
  if (!p || p.startsWith("/") || /^[a-zA-Z]:/.test(p)) return null;
  const segs = p.split("/").filter((s) => s !== "" && s !== ".");
  if (!segs.length || segs.some((s) => s === ".." || s.trim() === "")) return null;
  const out = segs.map((s) => s.trim()).join("/");
  return out.length <= 900 ? out : null;
}

export type EntryInfo = { path: string | null; raw: string; size: number; compressed: number; dir: boolean; encrypted: boolean; symlink: boolean };

export function classifyEntry(e: { fileName: string | Buffer; uncompressedSize: number; compressedSize: number; generalPurposeBitFlag: number; externalFileAttributes: number }): EntryInfo {
  const fileName = typeof e.fileName === "string" ? e.fileName : decodeEntryName(e.fileName, (e.generalPurposeBitFlag & 0x800) !== 0);
  const dir = fileName.endsWith("/");
  const mode = (e.externalFileAttributes >>> 16) & 0o170000;
  return {
    path: safeEntryPath(fileName), raw: fileName, size: e.uncompressedSize, compressed: e.compressedSize, dir,
    encrypted: (e.generalPurposeBitFlag & 1) === 1, symlink: mode === 0o120000,
  };
}

function openZip(path: string): Promise<yauzl.ZipFile> {
  return new Promise((res, rej) => yauzl.open(path, { lazyEntries: true, autoClose: false, validateEntrySizes: true, decodeStrings: false }, (err, zf) => (err || !zf ? rej(err) : res(zf))));
}
function listEntries(zf: yauzl.ZipFile, max: number): Promise<{ entries: yauzl.Entry[]; tooMany: boolean }> {
  return new Promise((res, rej) => {
    const entries: yauzl.Entry[] = [];
    let tooMany = false;
    zf.on("entry", (e: yauzl.Entry) => { entries.push(e); if (entries.length > max) { tooMany = true; res({ entries, tooMany }); } else zf.readEntry(); });
    zf.on("end", () => res({ entries, tooMany }));
    zf.on("error", rej);
    zf.readEntry();
  });
}
function readStream(zf: yauzl.ZipFile, e: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((res, rej) => zf.openReadStream(e, (err, s) => (err || !s ? rej(err) : res(s))));
}

const MIME: Record<string, string> = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel", xlsm: "application/vnd.ms-excel.sheet.macroEnabled.12", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", zip: "application/zip", csv: "text/csv", txt: "text/plain" };
export const mimeOf = (name: string) => MIME[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";

export async function processZip(job: ProcessorJob, path: string, dir: string, cb: Callback): Promise<Omit<ExtractResult, "sha256Ok">> {
  const problems: Problem[] = [];
  let zf: yauzl.ZipFile;
  try { zf = await openZip(path); }
  catch (e: any) { return { parser: "yauzl", status: "unreadable", summary: {}, problems: [{ code: "corrupt_archive", detail: String(e?.message ?? "").slice(0, 300) }] }; }
  try {
    const { entries, tooMany } = await listEntries(zf, job.limits.maxZipEntries);
    if (tooMany) return { parser: "yauzl", status: "unreadable", entryCount: entries.length, summary: {}, problems: [{ code: "too_many_entries", detail: `> ${job.limits.maxZipEntries}` }] };
    const infos = entries.map((e) => ({ e, i: classifyEntry(e as any) }));
    const files = infos.filter((x) => !x.i.dir);
    const declared = files.reduce((s, x) => s + x.i.size, 0);
    if (declared > job.size * job.limits.maxExpandRatio) {
      return { parser: "yauzl", status: "unreadable", entryCount: files.length, summary: { declaredBytes: declared }, problems: [{ code: "zip_bomb", detail: `kibontva ${declared} bájt` }] };
    }
    let extracted = 0, duplicates = 0, skipped = 0;
    for (const { e, i } of files) {
      if (SKIP.test(i.raw)) { skipped++; continue; }
      if (!i.path) { problems.push({ code: "path_unsafe", entry: i.raw.slice(0, 200) }); continue; }
      if (i.symlink) { problems.push({ code: "symlink_skipped", entry: i.path }); continue; }
      if (i.encrypted) { problems.push({ code: "entry_encrypted", entry: i.path }); continue; }
      if (i.size > job.limits.maxEntryBytes) { problems.push({ code: "file_too_large", entry: i.path }); continue; }
      if (i.size === 0) { problems.push({ code: "empty_entry", entry: i.path }); continue; }
      const tmp = join(dir, `entry-${extracted + duplicates + problems.length}`);
      const h = createHash("sha256");
      let actual = 0;
      try {
        const s = await readStream(zf, e);
        await pipeline(s as any, new Transform({ transform(c, _e, done) { actual += c.length; if (actual > i.size) return done(new Error("size_mismatch")); h.update(c); done(null, c); } }), createWriteStream(tmp));
      } catch (err: any) {
        problems.push({ code: /size/i.test(String(err?.message)) ? "zip_bomb" : "entry_damaged", entry: i.path, detail: String(err?.message ?? "").slice(0, 200) });
        await rm(tmp, { force: true });
        continue;
      }
      const name = i.path.split("/").pop()!;
      try {
        const r = await cb("entry", { entry: i.path, name, size: actual, sha256: h.digest("hex"), mime: mimeOf(name) });
        if (r?.action === "upload" && typeof r.putUrl === "string") {
          // A feltöltési cím csak ugyanarra a tárhelyre mutathat, ahonnan a ZIP jött.
          { const pu = new URL(r.putUrl), su = new URL(job.sourceUrl); if (pu.host !== su.host || pu.protocol !== su.protocol) throw new Error("put_url_not_allowed"); }
          await putFile(r.putUrl, tmp, mimeOf(name));
          await cb("entry_done", { fileId: r.fileId });
          extracted++;
        } else if (r?.action === "duplicate") duplicates++;
        else if (r?.action === "verified") extracted++;
        else problems.push({ code: r?.reason ?? "entry_rejected", entry: i.path });
      } catch (err: any) {
        problems.push({ code: "entry_upload_failed", entry: i.path, detail: String(err?.message ?? "").slice(0, 200) });
      } finally {
        await rm(tmp, { force: true });
      }
    }
    const usable = files.length - skipped;
    const ok = extracted + duplicates;
    return {
      parser: "yauzl", status: ok === usable ? "done" : ok === 0 ? "unreadable" : "partial",
      entryCount: usable, extractedCount: extracted,
      summary: { duplicates, skippedSystemFiles: skipped, declaredBytes: declared, folders: new Set(files.map((x) => x.i.path?.split("/").slice(0, -1).join("/") ?? "")).size },
      problems,
    };
  } finally {
    zf.close();
  }
}
