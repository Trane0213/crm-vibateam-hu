// Szöveges dokumentumok (TXT, CSV szövegként, DOCX/ODT) és önálló képek.
import { readFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import type { Callback } from "./callback.ts";
import type { ExtractResult, ProcessorJob, Problem, Unit } from "./types.ts";
import { OCR_MAX_IMAGE_BYTES } from "./pdf.ts";

/** Egyetlen bejegyzés kiolvasása kis Office-ZIP-ből (a központi könyvtárból). */
export function zipEntry(buf: Buffer, wanted: string): Buffer | null {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) return null;
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), off = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nlen);
    if (name === wanted) {
      const lnl = buf.readUInt16LE(off + 26), lel = buf.readUInt16LE(off + 28);
      const data = buf.subarray(off + 30 + lnl + lel, off + 30 + lnl + lel + csize);
      return method === 0 ? Buffer.from(data) : method === 8 ? inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 }) : null;
    }
    p += 46 + nlen + elen + clen;
  }
  return null;
}

export function xmlText(xml: string): string {
  return xml
    .replace(/<w:tab\/>|<text:tab\/>/g, "\t")
    .replace(/<\/w:p>|<\/text:p>|<\/text:h>|<w:br\/>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n").trim();
}

function chunks(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out.length ? out : [""];
}

export async function processText(job: ProcessorJob, path: string, cb: Callback): Promise<Omit<ExtractResult, "sha256Ok">> {
  const ext = job.name.split(".").pop()?.toLowerCase() ?? "";
  if (job.size > 50 * 1024 * 1024) return { parser: "text", status: "not_supported", summary: {}, problems: [{ code: "text_too_large" }] };
  const buf = await readFile(path);
  let text: string | null = null;
  const problems: Problem[] = [];
  if (ext === "txt" || ext === "csv") text = buf.toString("utf8");
  else if (ext === "docx") { const x = zipEntry(buf, "word/document.xml"); text = x ? xmlText(x.toString("utf8")) : null; }
  else if (ext === "odt") { const x = zipEntry(buf, "content.xml"); text = x ? xmlText(x.toString("utf8")) : null; }
  else return { parser: "text", status: "not_supported", summary: {}, problems: [{ code: "unsupported_format", detail: ext }] };
  if (text === null) return { parser: "text", status: "unreadable", summary: {}, problems: [{ code: "document_damaged" }] };
  const parts = chunks(text, job.limits.maxUnitChars);
  const units: Unit[] = parts.map((t, i) => ({ unitKind: "text", unitNo: i + 1, label: parts.length > 1 ? `${i + 1}. rész` : null, source: "text", text: t }));
  for (let i = 0; i < units.length; i += 20) await cb("units", { units: units.slice(i, i + 20) });
  return { parser: ext === "docx" || ext === "odt" ? "office-xml" : "text", status: text.trim() ? "done" : "unreadable", summary: { chars: text.length }, problems };
}

const IMAGE_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function processImage(job: ProcessorJob, path: string, cb: Callback): Promise<Omit<ExtractResult, "sha256Ok">> {
  const ext = job.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = IMAGE_MIME[ext];
  if (!mime) return { parser: "image", status: "not_supported", summary: {}, problems: [{ code: "unsupported_image", detail: ext }] };
  if (!job.limits.ocr) return { parser: "image", status: "not_supported", ocrSkipped: 1, summary: {}, problems: [{ code: "ocr_disabled" }] };
  if (job.size > OCR_MAX_IMAGE_BYTES) return { parser: "image", status: "not_supported", summary: {}, problems: [{ code: "page_image_too_large" }] };
  const r = await cb("ocr", { unitKind: "page", unitNo: 1, label: "Kép", mime, imageBase64: (await readFile(path)).toString("base64") });
  if (r?.status === "ok") return { parser: "image-ocr", status: "done", pageCount: 1, ocrPages: 1, summary: {}, problems: [] };
  if (r?.status === "skipped") return { parser: "image-ocr", status: "not_supported", ocrSkipped: 1, summary: {}, problems: [{ code: r.reason ?? "ocr_skipped" }] };
  return { parser: "image-ocr", status: "unreadable", pageCount: 1, unreadablePages: 1, summary: {}, problems: [{ code: r?.reason ?? "ocr_failed" }] };
}
