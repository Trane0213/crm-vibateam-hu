import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCUMENT_LIMITS, extractDocument, LargeDocumentError } from "@/lib/ai-os/adapters/document-extract.server";
import { fetchDocumentBytes } from "@/lib/ai-os/adapters/document-access.server";
import { documentTypeOf, finalStatus, INGEST_LIMITS, planIngest, type UnitResult } from "./ingest-model";

type Claimed = { id: string; claim_token: string; source_table: string; source_id: string };
const SOURCE_COLUMNS: Record<string, string> = {
  company_documents: "id,name,file_url,size_bytes,document_type",
  project_documents: "id,name,file_url,document_type",
  quote_documents: "id,name,file_url,size_bytes,document_type",
  email_attachments: "id,filename,r2_key,size_bytes,inline",
};

async function sha256(bytes: Uint8Array) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function store(admin: SupabaseClient, c: Claimed, r: { hash?: string | null; bytes?: number | null; parser?: string | null; status: string; code?: string | null; docType?: string | null; limitations?: string[]; chunks?: unknown[] | null; retry?: boolean }) {
  const { data, error } = await admin.rpc("knowledge_store_result" as never, {
    p_id: c.id, p_token: c.claim_token, p_hash: r.hash ?? null, p_bytes: r.bytes ?? null, p_parser: r.parser ?? null, p_status: r.status,
    p_error: r.code ?? null, p_doc_type: r.docType ?? null, p_limitations: r.limitations ?? [], p_chunks: r.chunks ?? null, p_retry: r.retry ?? false,
  } as never);
  if (error) throw new Error("Az eredmény rögzítése sikertelen.");
  return data as { stored: boolean; outcome?: string };
}

/** Extract every unit/window of a document (bounded). Text only, no model call. */
async function extractAll(bytes: Uint8Array, name: string) {
  const chunks: { index: number; label: string; text: string }[] = [];
  const units: UnitResult[] = [];
  let unit = 0, offset = 0, chars = 0, truncated = false, parser = "", limitations: string[] = [];
  for (let guard = 0; guard < 400; guard++) {
    const page = await extractDocument(bytes, name, unit, offset);
    parser = page.parser; limitations = page.limitations;
    if (page.status === "unsupported") return { unsupported: true as const, parser, limitations };
    const u = page.units[0];
    if (offset === 0) units.push({ status: u?.status ?? "missing", text: u?.text ?? null });
    else if (u?.text) units[units.length - 1].text = (units[units.length - 1].text ?? "") + u.text;
    if (u?.status === "sensitive_withheld") units[units.length - 1].status = "sensitive_withheld";
    if (u?.text) { chunks.push({ index: chunks.length, label: u.label, text: u.text }); chars += u.text.length; }
    if (chars >= INGEST_LIMITS.maxChars) { truncated = page.next_text_offset != null || page.next_unit != null; break; }
    if (page.next_text_offset != null) { offset = page.next_text_offset; continue; }
    if (page.next_unit == null) break;
    if (page.next_unit >= INGEST_LIMITS.maxUnits) { truncated = true; break; }
    unit = page.next_unit; offset = 0;
  }
  return { unsupported: false as const, chunks, units, truncated, parser, limitations };
}

export async function processOne(admin: SupabaseClient, c: Claimed, download = fetchDocumentBytes) {
  const cols = SOURCE_COLUMNS[c.source_table];
  if (!cols) return store(admin, c, { status: "error", code: "unknown_source" });
  const src = await admin.from(c.source_table).select(cols).eq("id", c.source_id).maybeSingle();
  if (src.error) return store(admin, c, { status: "error", code: "source_read_failed", retry: true });
  const row = src.data as Record<string, unknown> | null;
  if (!row) return store(admin, c, { status: "error", code: "source_missing" });
  const name = String(row.name ?? row.filename ?? "");
  const docType = documentTypeOf(name, (row.document_type as string | null) ?? null);
  const plan = planIngest(name, (row.size_bytes as number | null) ?? null);
  if (plan.action === "skip") return store(admin, c, { status: plan.status, code: plan.code, docType, limitations: [plan.limitation] });
  const key = String(row.file_url ?? row.r2_key ?? "");
  if (!key || key.length > 1024 || key.includes("..") || key.startsWith("/") || key.includes("://")) return store(admin, c, { status: "unsupported", code: "external_or_invalid_key", docType, limitations: ["Külső URL vagy érvénytelen tárolási kulcs; csak CRM-tárolt fájl dolgozható fel."] });
  let bytes: Uint8Array;
  try { bytes = await download(key); }
  catch (e) {
    const large = /5 MB/.test(String((e as Error)?.message));
    return large ? store(admin, c, { status: "needs_review", code: "too_large_ocr_pending", docType, limitations: ["5 MB feletti fájl: nagyfeldolgozás / OCR szükséges."] })
      : store(admin, c, { status: "error", code: "download_failed", docType, retry: true });
  }
  const hash = await sha256(bytes);
  try {
    const ex = await extractAll(bytes, name);
    if (ex.unsupported) return store(admin, c, { hash, bytes: bytes.length, parser: ex.parser, status: "unsupported", code: "unsupported_type", docType, limitations: ex.limitations });
    const fin = finalStatus(ex.units, ex.truncated);
    return store(admin, c, { hash, bytes: bytes.length, parser: ex.parser, status: fin.status, code: fin.code, docType,
      limitations: [...fin.limitations, ...ex.limitations], chunks: fin.code === "sensitive_withheld" ? [] : ex.chunks });
  } catch (e) {
    if (e instanceof LargeDocumentError) return store(admin, c, { hash, bytes: bytes.length, status: "needs_review", code: "large_document", docType, limitations: [`Méretkorlát (${DOCUMENT_LIMITS.pdfPages} oldal / munkalapméret) felett külön nagyfeldolgozás szükséges.`] });
    return store(admin, c, { hash, bytes: bytes.length, status: "error", code: "corrupt_or_unreadable", docType, limitations: ["A fájl sérült vagy nem olvasható; az eredeti fájl nem módosult."] });
  }
}

export async function processBatch(admin: SupabaseClient, limit: number = INGEST_LIMITS.batch) {
  const claim = await admin.rpc("knowledge_claim_batch" as never, { p_limit: limit } as never);
  if (claim.error) throw new Error("A feldolgozási sor nem foglalható.");
  const rows = (claim.data ?? []) as Claimed[];
  const outcomes: Record<string, number> = {};
  for (const c of rows) {
    let outcome = "failed";
    try { outcome = (await processOne(admin, c)).outcome ?? "not_stored"; } catch { outcome = "store_failed"; }
    outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
  }
  return { claimed: rows.length, outcomes };
}
