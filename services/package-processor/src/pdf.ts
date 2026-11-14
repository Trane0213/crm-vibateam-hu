// PDF: oldalakra bontás és kiolvasás a szövegrétegből (poppler). Szövegréteg nélküli oldal → képpé
// alakítva a CRM-nek küldjük képfelismerésre (a feldolgozó nem kap AI-kulcsot). Az eredeti fájl nem változik.
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { run } from "./exec.ts";
import type { Callback } from "./callback.ts";
import type { ExtractResult, ProcessorJob, Problem, Unit } from "./types.ts";

export const MIN_TEXT_CHARS = 25;          // ennél kevesebb nem szóköz karakter → szkennelt oldalnak tekintjük
export const OCR_MAX_IMAGE_BYTES = 4_500_000;
const BATCH = 20;

export function parsePdfInfo(out: string): { pages: number; encrypted: boolean; title: string | null; producer: string | null } {
  const get = (k: string) => out.match(new RegExp(`^${k}:\\s*(.*)$`, "m"))?.[1]?.trim() ?? null;
  return { pages: Number(get("Pages") ?? 0) || 0, encrypted: /^yes/i.test(get("Encrypted") ?? "no"), title: get("Title"), producer: get("Producer") };
}

export function meaningfulChars(text: string): number {
  return text.replace(/\s+/g, "").length;
}

/** pdftotext kimenet oldalakra (lapdobás karakterrel tagolva). */
export function splitPages(text: string, expected: number): string[] {
  const parts = text.split("\f");
  if (parts.length > expected && parts[parts.length - 1].trim() === "") parts.pop();
  while (parts.length < expected) parts.push("");
  return parts.slice(0, expected);
}

export async function renderPageJpeg(path: string, page: number, dir: string): Promise<Uint8Array | null> {
  for (const dpi of [150, 110, 80]) {
    const base = join(dir, `p${page}-${dpi}`);
    await run("pdftoppm", ["-jpeg", "-jpegopt", "quality=82", "-r", String(dpi), "-f", String(page), "-l", String(page), "-singlefile", path, base], { timeoutMs: 120_000 });
    const bytes = new Uint8Array(await readFile(`${base}.jpg`));
    await rm(`${base}.jpg`, { force: true });
    if (bytes.length <= OCR_MAX_IMAGE_BYTES) return bytes;
  }
  return null;
}

export async function processPdf(job: ProcessorJob, path: string, dir: string, cb: Callback): Promise<Omit<ExtractResult, "sha256Ok">> {
  const problems: Problem[] = [];
  let info;
  try { info = parsePdfInfo((await run("pdfinfo", [path], { timeoutMs: 60_000 })).stdout); }
  catch (e: any) {
    const msg = String(e?.stderr ?? e?.message ?? "");
    const encrypted = /incorrect password|encrypted/i.test(msg);
    return { parser: "poppler", status: "unreadable", encrypted, summary: {}, problems: [{ code: encrypted ? "encrypted" : "pdf_damaged", detail: msg.slice(0, 300) }] };
  }
  if (info.pages < 1) return { parser: "poppler", status: "unreadable", summary: {}, problems: [{ code: "pdf_damaged", detail: "Nincs olvasható oldal" }] };
  const pages = Math.min(info.pages, job.limits.maxPdfPages);
  if (info.pages > pages) problems.push({ code: "page_limit", detail: `${info.pages} oldalból ${pages} feldolgozva` });

  let textPages = 0, ocrPages = 0, ocrSkipped = 0, unreadable = 0;
  const scanned: number[] = [];
  for (let from = 1; from <= pages; from += BATCH) {
    const to = Math.min(pages, from + BATCH - 1);
    let texts: string[];
    try {
      const out = (await run("pdftotext", ["-layout", "-enc", "UTF-8", "-f", String(from), "-l", String(to), path, "-"], { timeoutMs: 180_000 })).stdout as string;
      texts = splitPages(out, to - from + 1);
    } catch (e: any) {
      texts = Array(to - from + 1).fill("");
      problems.push({ code: "pdf_text_failed", detail: `${from}–${to}. oldal: ${String(e?.stderr ?? e?.message ?? "").slice(0, 200)}` });
    }
    const units: Unit[] = [];
    texts.forEach((t, i) => {
      const page = from + i;
      if (meaningfulChars(t) >= MIN_TEXT_CHARS) {
        textPages++;
        units.push({ unitKind: "page", unitNo: page, label: `${page}. oldal`, source: "text_layer", text: t.slice(0, job.limits.maxUnitChars) });
      } else scanned.push(page);
    });
    if (units.length) await cb("units", { units });
  }

  for (const page of scanned) {
    if (!job.limits.ocr) { ocrSkipped++; problems.push({ code: "ocr_disabled", page }); continue; }
    let img: Uint8Array | null = null;
    try { img = await renderPageJpeg(path, page, dir); } catch (e: any) { problems.push({ code: "render_failed", page, detail: String(e?.message ?? "").slice(0, 200) }); }
    if (!img) { unreadable++; problems.push({ code: "page_image_too_large", page }); continue; }
    const r = await cb("ocr", { unitKind: "page", unitNo: page, label: `${page}. oldal`, mime: "image/jpeg", imageBase64: Buffer.from(img).toString("base64") });
    if (r?.status === "ok") ocrPages++;
    else if (r?.status === "skipped") { ocrSkipped++; problems.push({ code: r.reason ?? "ocr_skipped", page }); }
    else { unreadable++; problems.push({ code: r?.reason ?? "ocr_failed", page }); }
  }

  const readable = textPages + ocrPages;
  const status = readable === pages && info.pages === pages ? "done" : readable === 0 ? "unreadable" : "partial";
  return {
    parser: "poppler", status, pageCount: info.pages, textPages, ocrPages, ocrSkipped, unreadablePages: unreadable,
    encrypted: info.encrypted, summary: { title: info.title, producer: info.producer, scannedPages: scanned.length }, problems,
  };
}
