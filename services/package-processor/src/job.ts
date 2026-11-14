// Egy feladat teljes lefutása: letöltés → SHA-256 újraellenőrzés → feldolgozás típus szerint → eredmény.
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { makeCallback, type Callback } from "./callback.ts";
import { downloadTo } from "./io.ts";
import { processPdf } from "./pdf.ts";
import { processSpreadsheet } from "./excel.ts";
import { processZip } from "./zip.ts";
import { processImage, processText } from "./text.ts";
import type { ExtractResult, ProcessorJob } from "./types.ts";

export async function runJob(job: ProcessorJob, opts: { secret: string; workDir: string; callback?: Callback; fetchImpl?: typeof fetch; allow?: unknown }): Promise<ExtractResult | null> {
  const cb = opts.callback ?? makeCallback(job, opts.secret, opts.fetchImpl);
  const dir = join(opts.workDir, job.jobId);
  await mkdir(dir, { recursive: true });
  try {
    await cb("started", {});
    const src = join(dir, "source");
    const got = await downloadTo(job.sourceUrl, src, opts.fetchImpl);
    if (got.sha256 !== job.sha256 || got.size !== job.size) {
      const result: ExtractResult = { parser: "integrity", status: "corrupt", sha256Ok: false, summary: { expectedSize: job.size, gotSize: got.size }, problems: [{ code: "integrity_mismatch" }] };
      await cb("result", { result });
      return result;
    }
    const base =
      job.kind === "pdf" ? await processPdf(job, src, dir, cb)
      : job.kind === "spreadsheet" ? await processSpreadsheet(job, src, cb)
      : job.kind === "archive" ? await processZip(job, src, dir, cb)
      : job.kind === "image" ? await processImage(job, src, cb)
      : await processText(job, src, cb);
    const result: ExtractResult = { ...base, sha256Ok: true };
    await cb("result", { result });
    return result;
  } catch (e: any) {
    try { await cb("failed", { code: "processor_error", detail: String(e?.message ?? e).slice(0, 500) }); } catch { /* a CRM később elakadtként jelzi */ }
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
