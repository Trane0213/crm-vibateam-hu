// P2 – tervcsomag-feldolgozás, CRM-oldal (csak szerver).
// • Feladat kiküldése az elkülönített feldolgozónak: csak erre az egy fájlra szóló, rövid életű
//   aláírt letöltési (és táblázatnál szerkezet-feltöltési) címet kap – adatbázis-, tárhely- és
//   AI-kulcsot soha.
// • A feldolgozó aláírt visszajelzéseit (HMAC + feladatonkénti token) itt ellenőrizzük és mentjük.
// • A képfelismerés a CRM meglévő OpenAI-képfelismerőjén fut (visionExtract), csomagonkénti kerettel.
import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  checkPackageFile, initialProcessingStatus, isSha256, isUuid, normalizeRelativePath, packageObjectKey, resolveLimits,
  type PackageParent,
} from "./package-policy";
import {
  buildReport, CALLBACK_ACTIONS, extractedRelativePath, jobKindOf, isStale, ocrAllowed, parseResult, parseUnits, PROBLEM_LABEL,
  resolveProcessing, type CallbackAction, type PackageReport, type ProcessingSettings,
} from "./processing-policy";

type Sb = SupabaseClient<any, any, any>;
const admin = async (): Promise<Sb> => (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Sb;
const r2 = () => import("./r2-multipart.server");

export const SIGNATURE_HEADER = "x-viba-signature";
const MAX_SKEW = 300;
const URL_TTL = 6 * 3600;

export class ProcessingError extends Error { constructor(message: string, public status = 400, public code = "bad_request") { super(message); this.name = "ProcessingError"; } }

export function processorConfig() {
  const url = (process.env.PACKAGE_PROCESSOR_URL ?? "").replace(/\/+$/, "");
  const secret = process.env.PACKAGE_PROCESSOR_SECRET ?? "";
  const callbackBase = (process.env.PACKAGE_PROCESSOR_CALLBACK_URL ?? "").replace(/\/+$/, "");
  return { url, secret, callbackBase, configured: /^https:\/\//.test(url) && secret.length >= 32 };
}

export function signBody(secret: string, body: string, now = Math.floor(Date.now() / 1000)): string {
  return `t=${now},v1=${createHmac("sha256", secret).update(`${now}.${body}`).digest("hex")}`;
}
export function verifyBody(secret: string, body: string, header: string | null | undefined, now = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(now - t) > MAX_SKEW || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}

async function loadSettings(a: Sb): Promise<{ processing: ProcessingSettings; maxFile: number; maxFiles: number }> {
  const { data } = await a.from("settings").select("key,value").in("key", ["document_package_processing", "document_package_limits"]);
  const get = (k: string) => (data ?? []).find((r: any) => r.key === k)?.value;
  const limits = resolveLimits(get("document_package_limits"));
  return { processing: resolveProcessing(get("document_package_processing")), maxFile: limits.maxFileBytes, maxFiles: limits.maxFilesPerPackage };
}

async function logEvent(a: Sb, packageId: string, fileId: string | null, actor: string, event: string, detail: Record<string, unknown> = {}) {
  await a.from("package_upload_events").insert({ package_id: packageId, file_id: fileId, actor, event, detail });
}

type FileRow = { id: string; package_id: string; parent_kind: "project" | "quote"; parent_id: string; relative_path: string; name: string; size_bytes: number; sha256: string; r2_key: string | null; status: string; processing_status: string; extract_depth: number; extracted_from: string | null; uploaded_by: string; file_kind: string | null };
const FILE_COLS = "id,package_id,parent_kind,parent_id,relative_path,name,size_bytes,sha256,r2_key,status,processing_status,extract_depth,extracted_from,uploaded_by,file_kind";

/** Feladat létrehozása egy ellenőrzött fájlra (ha a típusa feldolgozható). Ismételt hívás nem hoz létre másodikat. */
export async function enqueueFile(a: Sb, fileId: string, requestedBy: string): Promise<{ jobId: string | null; state: "queued" | "not_supported" | "skipped" }> {
  const { data: f } = await a.from("package_files").select(FILE_COLS).eq("id", fileId).maybeSingle();
  const file = f as FileRow | null;
  if (!file || file.status !== "verified") return { jobId: null, state: "skipped" };
  if (!jobKindOf(file.name)) {
    if (file.processing_status === "waiting") await a.from("package_files").update({ processing_status: "not_supported" }).eq("id", fileId);
    return { jobId: null, state: "not_supported" };
  }
  const ins = await a.from("package_processing_jobs").insert({ file_id: fileId, package_id: file.package_id, requested_by: requestedBy }).select("id").single();
  if (!ins.error) return { jobId: ins.data.id as string, state: "queued" };
  const { data: active } = await a.from("package_processing_jobs").select("id").eq("file_id", fileId).in("status", ["queued", "dispatched", "running"]).maybeSingle();
  return { jobId: (active?.id as string) ?? null, state: "queued" };
}

/** Feladat kiküldése a feldolgozónak. Ha a feldolgozó nincs bekapcsolva, a feladat várakozik. */
export async function dispatchJob(a: Sb, jobId: string, origin: string): Promise<{ dispatched: boolean; reason?: string }> {
  const cfg = processorConfig();
  const { data: job } = await a.from("package_processing_jobs").select("id,file_id,status,attempt").eq("id", jobId).maybeSingle();
  if (!job || job.status !== "queued") return { dispatched: false, reason: "not_queued" };
  if (!cfg.configured) {
    await a.from("package_processing_jobs").update({ error_code: "not_configured" }).eq("id", jobId).eq("status", "queued");
    return { dispatched: false, reason: "not_configured" };
  }
  const { data: f } = await a.from("package_files").select(FILE_COLS).eq("id", job.file_id).maybeSingle();
  const file = f as FileRow | null;
  const kind = file ? jobKindOf(file.name) : null;
  if (!file || file.status !== "verified" || !file.r2_key || !kind) {
    await a.from("package_processing_jobs").update({ status: "cancelled", error_code: "no_archive" }).eq("id", jobId);
    return { dispatched: false, reason: "file_unavailable" };
  }
  const st = await loadSettings(a);
  const processing = st.processing;
  const m = await r2();
  const derivedKey = kind === "spreadsheet" ? file.r2_key.replace(/\/original\/[^/]+$/, "/derived/structure.json.gz") : null;
  const token = randomUUID();
  const envelope = {
    v: 1, jobId, token, fileId: file.id, kind, name: file.name, relativePath: file.relative_path, size: Number(file.size_bytes),
    sha256: file.sha256, depth: file.extract_depth,
    sourceUrl: m.presign("GET", file.r2_key, {}, URL_TTL),
    derivedPutUrl: derivedKey ? m.presign("PUT", derivedKey, {}, URL_TTL) : null,
    callbackUrl: `${cfg.callbackBase || origin}/api/public/package-processor`,
    limits: {
      ocr: processing.ocrEnabled && processing.ocrPagesPerPackage > 0, maxZipEntries: processing.maxZipEntries, maxExpandRatio: processing.maxExpandRatio,
      maxEntryBytes: st.maxFile, maxPdfPages: 5000, maxSpreadsheetBytes: 150 * 1024 * 1024, maxUnitChars: 200_000,
    },
  };
  // A token a kiküldés előtt kerül mentésre, hogy az azonnali visszajelzés is érvényes legyen.
  const { error: upErr } = await a.from("package_processing_jobs").update({
    token, status: "dispatched", attempt: (job.attempt ?? 0) + 1, dispatched_at: new Date().toISOString(), heartbeat_at: null, error_code: null, error_detail: null,
  }).eq("id", jobId).eq("status", "queued");
  if (upErr) return { dispatched: false, reason: "storage" };
  const body = JSON.stringify(envelope);
  let ok = false, detail = "";
  try {
    const res = await fetch(`${cfg.url}/jobs`, { method: "POST", headers: { "content-type": "application/json", [SIGNATURE_HEADER]: signBody(cfg.secret, body) }, body, signal: AbortSignal.timeout(30_000) });
    ok = res.ok; if (!ok) detail = `${res.status} ${(await res.text()).slice(0, 200)}`;
  } catch (e) { detail = String((e as Error)?.message ?? e).slice(0, 200); }
  if (!ok) {
    await a.from("package_processing_jobs").update({ status: "queued", error_code: "dispatch_failed", error_detail: detail }).eq("id", jobId).eq("token", token);
    return { dispatched: false, reason: "dispatch_failed" };
  }
  await a.from("package_files").update({ processing_status: "processing" }).eq("id", file.id).in("processing_status", ["waiting", "partial", "unreadable", "processing"]);
  return { dispatched: true };
}

/** Feltöltés lezárása után: feladat + kiküldés. Hiba esetén a feltöltés sikeres marad, a feladat várakozik. */
export async function afterUploadVerified(fileId: string, userId: string, origin: string): Promise<void> {
  try {
    const a = await admin();
    const q = await enqueueFile(a, fileId, userId);
    if (q.jobId) await dispatchJob(a, q.jobId, origin);
  } catch (e) { console.error("[package-processing] enqueue", (e as Error)?.message); }
}

// ---------- Visszajelzések a feldolgozótól ----------

type CallbackReply = { status: number; body: Record<string, unknown> };
const reply = (status: number, body: Record<string, unknown>): CallbackReply => ({ status, body });

const STATUS_FROM_EXTRACT: Record<string, string> = { done: "done", partial: "partial", unreadable: "unreadable", corrupt: "unreadable", not_supported: "not_supported" };

export type OcrFn = (bytes: Uint8Array, name: string, mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif") => Promise<{ text: string | null; uncertain: string[]; withheld: boolean }>;
async function defaultOcr(bytes: Uint8Array, name: string, mime: Parameters<OcrFn>[2]) {
  const { visionExtract } = await import("@/lib/ai-os/adapters/vision-extract.server");
  const r = await visionExtract(bytes, name, { type: "image", mime });
  const text = r.units.map((u) => u.text ?? "").join("\n").trim();
  return { text: text || null, uncertain: r.units.flatMap((u) => u.uncertain).slice(0, 50), withheld: r.status === "sensitive_withheld" };
}

export async function handleCallback(raw: string, signature: string | null, deps: { admin?: Sb; ocr?: OcrFn; origin?: string } = {}): Promise<CallbackReply> {
  const cfg = processorConfig();
  if (!cfg.secret) return reply(503, { error: "not_configured" });
  if (raw.length > 12 * 1024 * 1024) return reply(413, { error: "too_large" });
  if (!verifyBody(cfg.secret, raw, signature)) return reply(401, { error: "bad_signature" });
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return reply(400, { error: "bad_json" }); }
  const action = msg?.action as CallbackAction;
  if (!isUuid(msg?.jobId) || !isUuid(msg?.token) || !(CALLBACK_ACTIONS as readonly string[]).includes(action)) return reply(400, { error: "bad_message" });
  const a = deps.admin ?? (await admin());
  const { data: job } = await a.from("package_processing_jobs").select("id,file_id,package_id,status,token,requested_by").eq("id", msg.jobId).maybeSingle();
  if (!job || job.token !== msg.token) return reply(403, { error: "unknown_job" });
  if (job.status !== "dispatched" && job.status !== "running") return reply(409, { error: "job_closed" });
  const { data: f } = await a.from("package_files").select(FILE_COLS).eq("id", job.file_id).maybeSingle();
  const file = f as FileRow | null;
  if (!file || file.status !== "verified") return reply(409, { error: "file_unavailable" });
  const now = new Date().toISOString();
  if (action !== "result" && action !== "failed") await a.from("package_processing_jobs").update({ status: "running", heartbeat_at: now }).eq("id", job.id);

  switch (action) {
    case "started":
      return reply(200, { ok: true });

    case "units": {
      const units = parseUnits(msg.units);
      if (!units) return reply(400, { error: "bad_units" });
      const rows = units.map((u) => ({ file_id: file.id, unit_kind: u.unitKind, unit_no: u.unitNo, label: u.label, source: u.source, text: u.text, chars: u.text.length, ai_extracted: false, uncertain: [] }));
      const { error } = await a.from("package_file_units").upsert(rows, { onConflict: "file_id,unit_kind,unit_no" });
      return error ? reply(500, { error: "storage" }) : reply(200, { ok: true, stored: rows.length });
    }

    case "ocr": {
      const unitNo = msg.unitNo;
      const mime = msg.mime;
      if (msg.unitKind !== "page" || !Number.isInteger(unitNo) || unitNo < 1 || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime) || typeof msg.imageBase64 !== "string") return reply(400, { error: "bad_ocr" });
      const { data: existing } = await a.from("package_file_units").select("unit_no").eq("file_id", file.id).eq("unit_kind", "page").eq("unit_no", unitNo).eq("source", "ocr").maybeSingle();
      if (existing) return reply(200, { status: "ok", reused: true });   // újrafeldolgozásnál nem fizetünk kétszer
      const { processing } = await loadSettings(a);
      const { count } = await a.from("package_file_units").select("file_id,package_files!inner(package_id)", { count: "exact", head: true }).eq("source", "ocr").eq("package_files.package_id", file.package_id);
      if (!ocrAllowed(count ?? 0, processing)) return reply(200, { status: "skipped", reason: processing.ocrEnabled ? "ocr_budget" : "ocr_disabled" });
      const bytes = new Uint8Array(Buffer.from(msg.imageBase64, "base64"));
      const { imageMime } = await import("@/lib/ai-os/adapters/vision-extract.server");
      if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || imageMime(bytes) !== mime) return reply(400, { error: "bad_image" });
      let r;
      try { r = await (deps.ocr ?? defaultOcr)(bytes, file.name, mime); }
      catch { return reply(200, { status: "failed", reason: "ocr_unavailable" }); }
      if (r.withheld) return reply(200, { status: "failed", reason: "ocr_sensitive" });
      if (!r.text) return reply(200, { status: "failed", reason: "ocr_failed" });
      const label = typeof msg.label === "string" ? msg.label.slice(0, 150) : `${unitNo}. oldal`;
      const { error } = await a.from("package_file_units").upsert({ file_id: file.id, unit_kind: "page", unit_no: unitNo, label: `${label} (AI-kiolvasás)`, source: "ocr", text: r.text.slice(0, 200_000), chars: r.text.length, ai_extracted: true, uncertain: r.uncertain }, { onConflict: "file_id,unit_kind,unit_no" });
      return error ? reply(500, { error: "storage" }) : reply(200, { status: "ok" });
    }

    case "entry": {
      if (jobKindOf(file.name) !== "archive") return reply(400, { error: "not_archive" });
      let entry: string, rel: string;
      try { entry = normalizeRelativePath(String(msg.entry ?? "")); rel = extractedRelativePath(file.relative_path, entry); }
      catch { return reply(200, { action: "reject", reason: "path_unsafe" }); }
      const size = Number(msg.size);
      if (!Number.isSafeInteger(size) || size <= 0 || !isSha256(msg.sha256)) return reply(400, { error: "bad_entry" });
      const { maxFile, maxFiles } = await loadSettings(a);
      const problem = checkPackageFile({ relativePath: rel, size }, { maxFileBytes: maxFile, maxParentBytes: Number.MAX_SAFE_INTEGER, maxFilesPerPackage: maxFiles });
      if (problem) return reply(200, { action: "reject", reason: size > maxFile ? "file_too_large" : "not_allowed_type" });
      const name = rel.split("/").pop()!;
      const mime = typeof msg.mime === "string" ? msg.mime.slice(0, 120) : null;
      const { data: dec, error } = await a.rpc("document_package_register_extracted", {
        p_zip: file.id, p_entry: entry, p_relative_path: rel, p_name: name, p_size: size, p_mime: mime, p_kind: (await import("./package-policy")).fileKindOf(name),
        p_sha256: msg.sha256, p_processing: initialProcessingStatus(rel), p_max_file: maxFile, p_max_files: maxFiles,
      });
      if (error || !dec) return reply(500, { error: "storage" });
      const d = dec as { action: string; file_id?: string; reason?: string; r2_key?: string | null; sha256?: string };
      if (d.action === "reject") return reply(200, { action: "reject", reason: d.reason ?? "entry_rejected" });
      if (d.action !== "upload") return reply(200, { action: d.action, fileId: d.file_id });
      if (d.sha256 && d.sha256 !== msg.sha256) return reply(200, { action: "reject", reason: "integrity_mismatch" });
      const parent: PackageParent = { kind: file.parent_kind, id: file.parent_id };
      const key = d.r2_key ?? packageObjectKey({ parent, packageId: file.package_id, fileId: d.file_id!, name });
      if (!d.r2_key) {
        const { error: kErr } = await a.from("package_files").update({ r2_key: key }).eq("id", d.file_id!).eq("status", "uploading");
        if (kErr) return reply(500, { error: "storage" });
      }
      return reply(200, { action: "upload", fileId: d.file_id, putUrl: (await r2()).presign("PUT", key, {}, URL_TTL) });
    }

    case "entry_done": {
      if (!isUuid(msg.fileId)) return reply(400, { error: "bad_entry" });
      const { data: c } = await a.from("package_files").select(FILE_COLS).eq("id", msg.fileId).maybeSingle();
      const child = c as FileRow | null;
      if (!child || child.extracted_from !== file.id) return reply(403, { error: "not_child" });
      if (child.status === "verified") return reply(200, { ok: true });
      if (child.status !== "uploading" || !child.r2_key) return reply(409, { error: "not_open" });
      const head = await (await r2()).headObject(child.r2_key);
      if (!head || head.size !== Number(child.size_bytes)) {
        await a.from("package_files").update({ status: "failed", error_code: "integrity" }).eq("id", child.id);
        return reply(200, { ok: false, reason: "integrity_mismatch" });
      }
      await a.from("package_files").update({ status: "verified", verified_at: now, error_code: null }).eq("id", child.id).eq("status", "uploading");
      await logEvent(a, child.package_id, child.id, job.requested_by, "extracted_verified", { from: file.id, size: child.size_bytes });
      const q = await enqueueFile(a, child.id, job.requested_by);
      if (q.jobId) await dispatchJob(a, q.jobId, deps.origin ?? processorConfig().callbackBase).catch(() => undefined);
      return reply(200, { ok: true });
    }

    case "result": {
      const r = parseResult(msg.result);
      if (!r) return reply(400, { error: "bad_result" });
      const structureKey = r.structureUploaded && file.r2_key ? file.r2_key.replace(/\/original\/[^/]+$/, "/derived/structure.json.gz") : null;
      const { error } = await a.from("package_file_extracts").upsert({
        file_id: file.id, job_id: job.id, parser: r.parser, status: r.status, sha256_ok: r.sha256Ok, ...r.nums,
        has_macros: r.hasMacros, encrypted: r.encrypted, structure_key: structureKey, summary: r.summary, problems: r.problems, processed_at: now,
      }, { onConflict: "file_id" });
      if (error) return reply(500, { error: "storage" });
      await a.from("package_files").update({ processing_status: STATUS_FROM_EXTRACT[r.status], error_code: r.status === "corrupt" ? "integrity" : null }).eq("id", file.id);
      await a.from("package_processing_jobs").update({ status: "done", finished_at: now, heartbeat_at: now }).eq("id", job.id);
      await logEvent(a, file.package_id, file.id, job.requested_by, "processed", { status: r.status, parser: r.parser, problems: r.problems.length });
      return reply(200, { ok: true });
    }

    case "failed": {
      const code = typeof msg.code === "string" && PROBLEM_LABEL[msg.code] ? msg.code : "processor_error";
      await a.from("package_processing_jobs").update({ status: "failed", finished_at: now, error_code: code, error_detail: typeof msg.detail === "string" ? msg.detail.slice(0, 500) : null }).eq("id", job.id);
      await a.from("package_files").update({ processing_status: "waiting" }).eq("id", file.id).eq("processing_status", "processing");
      await logEvent(a, file.package_id, file.id, job.requested_by, "processing_failed", { code });
      return reply(200, { ok: true });
    }
  }
  return reply(400, { error: "bad_action" });
}

// ---------- Felhasználói műveletek (a hívó saját jogával ellenőrizve) ----------

async function visibleFile(sb: Sb, fileId: string): Promise<{ id: string; package_id: string; status: string; name: string }> {
  if (!isUuid(fileId)) throw new ProcessingError("Érvénytelen fájl");
  const { data } = await sb.from("package_files").select("id,package_id,status,name").eq("id", fileId).maybeSingle();
  if (!data) throw new ProcessingError("A fájl nem található vagy nem elérhető", 403, "forbidden");
  return data as any;
}

/** Újrafeldolgozás / feldolgozás indítása: aki az ügyhöz feltölthet, az indíthatja (meglévő szabály). */
export async function retryFiles(sb: Sb, userId: string, packageId: string, fileIds: string[] | null, origin: string) {
  const { assertCanUpload } = await import("./packages.server");
  if (!isUuid(packageId)) throw new ProcessingError("Érvénytelen csomag");
  const { data: pkg } = await sb.from("document_packages").select("id,parent_kind,project_id,quote_id").eq("id", packageId).maybeSingle();
  if (!pkg) throw new ProcessingError("A csomag nem található vagy nem elérhető", 403, "forbidden");
  await assertCanUpload(sb, userId, { kind: pkg.parent_kind, id: pkg.project_id ?? pkg.quote_id });
  const ids = fileIds ? fileIds.slice(0, 200) : null;
  if (ids) for (const id of ids) { const vf = await visibleFile(sb, id); if (vf.package_id !== packageId) throw new ProcessingError("A fájl nem ehhez a csomaghoz tartozik", 403, "forbidden"); }
  const a = await admin();
  let q = a.from("package_files").select("id,name,status").eq("package_id", packageId).eq("status", "verified").limit(1000);
  if (ids) q = q.in("id", ids);
  const { data: files } = await q;
  const { data: jobs } = await a.from("package_processing_jobs").select("id,file_id,status,heartbeat_at,dispatched_at").eq("package_id", packageId).in("status", ["queued", "dispatched", "running"]);
  const active = new Map((jobs ?? []).map((j: any) => [j.file_id, j]));
  const { data: done } = ids ? { data: [] as any[] } : await a.from("package_file_extracts").select("file_id,status,package_files!inner(package_id)").eq("package_files.package_id", packageId);
  const finished = new Set((done ?? []).filter((d: any) => d.status === "done" || d.status === "not_supported").map((d: any) => d.file_id));
  let started = 0, waiting = 0, skipped = 0;
  for (const f of (files ?? []) as any[]) {
    if (!jobKindOf(f.name) || (!ids && finished.has(f.id))) { skipped++; continue; }
    const j = active.get(f.id);
    if (j && !isStale(j) && j.status !== "queued") { skipped++; continue; }
    if (j && j.status !== "queued") await a.from("package_processing_jobs").update({ status: "cancelled", error_code: "stale" }).eq("id", j.id);
    const jobId = j?.status === "queued" ? j.id : (await enqueueFile(a, f.id, userId)).jobId;
    if (!jobId) { skipped++; continue; }
    const d = await dispatchJob(a, jobId, origin);
    d.dispatched ? started++ : waiting++;
  }
  await logEvent(a, packageId, null, userId, "processing_requested", { started, waiting, skipped });
  return { started, waiting, skipped, configured: processorConfig().configured };
}

/** Csomagjelentés a hívó saját jogával (RLS). */
export async function packageReport(sb: Sb, packageId: string): Promise<PackageReport & { configured: boolean }> {
  if (!isUuid(packageId)) throw new ProcessingError("Érvénytelen csomag");
  const { data: pkg } = await sb.from("document_packages").select("id").eq("id", packageId).maybeSingle();
  if (!pkg) throw new ProcessingError("A csomag nem található vagy nem elérhető", 403, "forbidden");
  const files: any[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data } = await sb.from("package_files").select("id,relative_path,size_bytes,status,processing_status,error_code,extracted_from,duplicate_of").eq("package_id", packageId).order("relative_path").range(from, from + 999);
    files.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const ids = files.map((f) => f.id);
  const extracts: any[] = [], jobs: any[] = [];
  for (let i = 0; i < ids.length; i += 300) {
    const slice = ids.slice(i, i + 300);
    const [e, j] = await Promise.all([
      sb.from("package_file_extracts").select("file_id,status,parser,page_count,text_pages,ocr_pages,ocr_skipped,unreadable_pages,sheet_count,formula_count,entry_count,extracted_count,has_macros,encrypted,problems,summary").in("file_id", slice),
      sb.from("package_processing_jobs").select("file_id,status,error_code,heartbeat_at,dispatched_at,created_at").in("file_id", slice),
    ]);
    extracts.push(...(e.data ?? [])); jobs.push(...(j.data ?? []));
  }
  const report = buildReport(
    files.map((f) => ({ id: f.id, relativePath: f.relative_path, size: Number(f.size_bytes), status: f.status, processingStatus: f.processing_status, errorCode: f.error_code, extractedFrom: f.extracted_from, duplicateOf: f.duplicate_of })),
    extracts, jobs,
  );
  return { ...report, configured: processorConfig().configured };
}
