import { z } from "zod";
import { registerTool } from "../tool-registry";
import { OWNER_ROLES } from "../roles";
import { toolError } from "../tool-errors";
import type { ToolContext } from "../types";
import { CRM_PAGE_PROPERTIES, crmReadPage, readWindow } from "./crm-read-page";
import { authorizeDocumentScope, authorizedDocument, documentInput, DOCUMENT_SOURCES, fetchDocumentBytes } from "./document-access.server";
import { DOCUMENT_LIMITS, extractDocument, LargeDocumentError, pdfTextLayerPages } from "./document-extract.server";
import { safeMailText } from "./gmail-context";
import { imageMime, isImageName, VISION_LIMITS, VISION_VERIFICATION, VisionFailure, visionExtract, type VisionCaller, type VisionResult } from "./vision-extract.server";

/** Dokumentumolvasás: minden chat-asszisztens, mindig a felhasználó saját (RLS) jogosultságával. Michael (Ads) nem. */
export const DOCUMENT_AGENTS = ["george", "timothy", "boss", "scarlet"];
export const DOCUMENT_ROLES = [...OWNER_ROLES, "sales", "marketing", "project_manager", "pm"];
const CHAT_FOLDERS = ["sales", "marketing", "pm", "owner"] as const;

const properties = { source: { type: "string", enum: [...DOCUMENT_SOURCES] }, folder: { type: "string", enum: [...CHAT_FOLDERS] },
  quote_id: { type: "string" }, company_id: { type: "string" }, project_id: { type: "string" }, email_id: { type: "string" }, thread_id: { type: "string" }, mailbox: { type: "string" } };

export async function readDocument(args: Record<string, unknown>, ctx: ToolContext, download = fetchDocumentBytes, vision?: VisionCaller) {
  const data = documentInput.parse(args);
  if ((data.unit > 0 || data.text_offset > 0) && !data.expected_hash) throw new Error("Folytatáshoz fájl-hash szükséges.");
  const { row, key, version } = await authorizedDocument(data, ctx);
  const source = { table: data.source, id: row.id, quote_id: row.quote_id ?? null, project_id: row.project_id ?? null, company_id: row.company_id ?? null, email_id: row.email_id ?? null };
  if (Number(row.size_bytes ?? 0) > DOCUMENT_LIMITS.bytes) return { ok: true, data: { source, status: "requires_large_processing", limits: DOCUMENT_LIMITS, completeness: { full_document: false }, limitations: ["5 MB felett külön feldolgozás szükséges; tartalom nem lett olvasva, háttérfeldolgozás nem indult."] } };
  const bytes = await download(key);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (data.expected_hash && data.expected_hash !== hash) throw new Error("A fájltartalom megváltozott; a korábbi folytatás nem használható.");
  const name = String(row.name ?? row.filename ?? "");
  const provenanceBase = { sha256: hash, byte_length: bytes.length, uploaded_at: row.created_at, processed_at: new Date().toISOString(), quote_version: version };
  const visionResponse = (v: VisionResult) => ({ ok: true as const, data: { source, name: safeMailText(name).text, document_type: row.document_type ?? null,
    provenance: { ...provenanceBase, parser: v.parser, file_version: "content_sha256; quote_version is separate business version", persistence: "on_demand_no_extracted_copy_or_background_job",
      ocr: { model: v.ai.model, input_tokens: v.ai.input_tokens, output_tokens: v.ai.output_tokens, cache: v.ai.cache } },
    status: v.status, units: v.units, total_units: v.total_units, next_unit: null, next_text_offset: null, parser: v.parser, document_kind: v.document_kind, limitations: v.limitations,
    untrusted_content: true, ai_extracted: true, source_fact: false, verification: VISION_VERIFICATION,
    completeness: { full_document: v.status === "extracted", full_technical_audit: false, status: v.status, human_verified: false },
    pagination: { unit: 0, text_offset: 0, next_unit: null, next_text_offset: null, expected_hash: hash }, limits: { ...DOCUMENT_LIMITS, ocr_pdf_pages: VISION_LIMITS.pdfPages, ocr_output_chars: VISION_LIMITS.outputChars } } });
  const cacheKey = `${ctx.userId}:${hash}`;
  if (isImageName(name)) {
    const mime = imageMime(bytes);
    if (!mime) throw new Error("A fájl tartalma nem támogatott kép (PNG/JPEG/GIF/WEBP).");
    if (!data.ocr) return { ok: true, data: { source, name: safeMailText(name).text, document_type: row.document_type ?? null, provenance: { ...provenanceBase, parser: "none" },
      status: "requires_ocr", units: [], total_units: 1, untrusted_content: true, completeness: { full_document: false, status: "requires_ocr" },
      limitations: ["Kép: a tartalma csak ocr=true képfelismeréssel olvasható (kérésre futó OpenAI-hívás; az eredmény AI-kiolvasás, nem ellenőrzött forrás)."], limits: DOCUMENT_LIMITS } };
    if (data.unit > 0 || data.text_offset > 0) throw new Error("A képfelismerés egy lépésben fut, lapozás nélkül.");
    return visionResponse(await visionExtract(bytes, name, { type: "image", mime }, { cacheKey, call: vision }));
  }
  let extracted;
  try { extracted = await extractDocument(bytes, name, data.unit, data.text_offset); }
  catch (e) {
    if (!(e instanceof LargeDocumentError)) throw e;
    return { ok: true, data: { source, status: "requires_large_processing", provenance: { sha256: hash, processed_at: new Date().toISOString(), quote_version: version }, limits: DOCUMENT_LIMITS, completeness: { full_document: false }, limitations: ["A tartalmi méret/oldal/sorkorlát miatt nincs teljes feldolgozás, háttérmunka nem indult."] } };
  }
  const isPdf = name.toLowerCase().endsWith(".pdf");
  // Többoldalas szkennelt PDF első oldala "partial" (van következő oldal) — ezért nem a státuszt, hanem az összes oldal szövegrétegét nézzük.
  const scanned = data.ocr && isPdf && data.unit === 0 && data.text_offset === 0 && !extracted.units[0]?.text
    && (extracted.total_units === 1 ? extracted.status === "no_extractable_text" : extracted.total_units > VISION_LIMITS.pdfPages || (await pdfTextLayerPages(bytes, VISION_LIMITS.pdfPages)).textPages === 0);
  if (scanned) {
    if (extracted.total_units > VISION_LIMITS.pdfPages) return { ok: true, data: { source, status: "requires_large_processing", provenance: { ...provenanceBase, parser: extracted.parser }, limits: { ...DOCUMENT_LIMITS, ocr_pdf_pages: VISION_LIMITS.pdfPages }, completeness: { full_document: false },
      limitations: [`Kérésre futó képfelismerés legfeljebb ${VISION_LIMITS.pdfPages} oldalas PDF-en; ez ${extracted.total_units} oldalas, tartalom nem lett olvasva.`] } };
    return visionResponse(await visionExtract(bytes, name, { type: "pdf", pages: extracted.total_units }, { cacheKey, call: vision }));
  }
  if (data.ocr) extracted = { ...extracted, limitations: [...extracted.limitations, isPdf || ["docx", "xlsx", "txt", "csv"].some((e) => name.toLowerCase().endsWith(`.${e}`))
    ? "Képfelismerés nem futott: ennek az egységnek van olvasható szövegrétege, vagy nem szkennelt formátum."
    : "Képfelismerés ennél a formátumnál nem támogatott."] };
  return { ok: true, data: { source, name: safeMailText(name).text, document_type: row.document_type ?? null,
    provenance: { sha256: hash, byte_length: bytes.length, uploaded_at: row.created_at, processed_at: new Date().toISOString(), quote_version: version,
      parser: extracted.parser, file_version: "content_sha256; quote_version is separate business version", persistence: "on_demand_no_extracted_copy_or_background_job" },
    ...extracted, untrusted_content: true, completeness: { full_document: false, full_technical_audit: false, status: extracted.status },
    pagination: { unit: data.unit, text_offset: data.text_offset, next_unit: extracted.next_unit, next_text_offset: extracted.next_text_offset, expected_hash: hash },
    limits: DOCUMENT_LIMITS } };
}

/** Tool-level error mapping. Paid OCR is never retried automatically; provider/parser details are not exposed. */
export function readDocumentFailure(e: unknown) {
  if (e instanceof VisionFailure) { const failed = toolError.upstream(400, "vision_ocr_failed"); failed.error.user_safe_message = `${e.message} A tartalom nem lett kiolvasva, ezért nem állítható.`; return failed; }
  // Parser/network exceptions may contain file text, storage URL or credentials; never audit them.
  const message = e instanceof z.ZodError ? "Érvénytelen dokumentumazonosító vagy lapozás." : "A dokumentum nem feldolgozható vagy nem hozzáférhető; korlát/hibás/titkosított fájl esetén nincs teljes ellenőrzés.";
  return toolError.fromException(message);
}

export function registerDocumentTools() {
  registerTool({ name: "crm_list_documents", domain: "crm.documents", allowed_agents: DOCUMENT_AGENTS, allowed_roles: DOCUMENT_ROLES,
    description: "Dokumentumok pontos meglévő ajánlat/cég/projekt vagy jogosult postafióklevél alapján; source=ai_chat_uploads: a chatbe feltöltött fájlok szerepköri mappája (folder opcionális; mindenki csak a saját szerepköre mappáját látja). Lapozott metadata, nem fájltartalom. Egyetlen forrást válassz, minden forrás külön lapozandó.",
    parameters: { type: "object", properties: { ...properties, ...CRM_PAGE_PROPERTIES }, required: ["source"] },
  }, async (args, ctx) => {
    try {
      const data = documentInput.omit({ document_id: true }).parse(args);
      const window = readWindow(args, 10);
      let result;
      if (data.source === "ai_chat_uploads") {
        // Szerepköri mappák: a hívó csak a saját szerepköre mappáját látja (Tulajdonos mindet) — RLS.
        const folder = z.enum(CHAT_FOLDERS).optional().parse(args.folder ?? undefined);
        let q = ctx.supabaseUser.from("ai_chat_uploads").select("id,name,mime_type,size_bytes,created_at,folder,uploader_name,link_table,link_parent_id", { count: "exact" });
        if (folder) q = q.eq("folder", folder);
        result = await q.order("created_at", { ascending: false }).order("id").range(window.offset, window.offset + window.limit - 1);
      } else {
        const scope = await authorizeDocumentScope(data, ctx);
        result = await ctx.supabaseUser.from(data.source).select("*", { count: "exact" }).eq(scope.key, scope.id)
          .order("created_at", { ascending: false }).order("id").range(window.offset, window.offset + window.limit - 1);
      }
      if (result.error) throw result.error;
      const rows = (result.data ?? []).map((raw: Record<string, unknown>) => ({ id: raw.id, name: safeMailText(String(raw.name ?? raw.filename ?? "")).text,
        document_type: raw.document_type ?? null, mime_type: raw.mime_type, size_bytes: raw.size_bytes ?? null, created_at: raw.created_at,
        quote_id: raw.quote_id ?? null, project_id: raw.project_id ?? null, company_id: raw.company_id ?? null, email_id: raw.email_id ?? null,
        ...(data.source === "ai_chat_uploads" ? { folder: raw.folder, uploader: raw.uploader_name ? safeMailText(String(raw.uploader_name)).text : null, linked_to: raw.link_table ? { table: raw.link_table, parent_id: raw.link_parent_id } : null } : {}),
        content_read: false, source: { table: data.source, id: raw.id } }));
      return { ok: true, data: { ...crmReadPage(rows, result.count, window, data.source, 6500), limitations: ["Csak jogosultan látható mentett fájlrekordok; nincs Gmail letöltés vagy szinkronfrissítés."] } };
    } catch { return toolError.fromException("A dokumentumlista nem olvasható; ellenőrizd a pontos ügyazonosítót és jogosultságot."); }
  });
  registerTool({ name: "crm_read_document", domain: "crm.documents", allowed_agents: DOCUMENT_AGENTS, allowed_roles: DOCUMENT_ROLES,
    description: "Meglévő R2 fájl PDF/XLSX/DOCX/TXT/CSV szövege, pontos forrás+document_id+ügy vagy fióklevél alapján (ai_chat_uploads: csak document_id). 5 MB korlát; unit=PDF-oldal/munkalap (0-alapú), text_offset szövegfolytatás. Folytatáshoz expected_hash kötelező; teljes műszaki auditot nem állít, URL/kulcs nem paraméter. ocr=true: kép (PNG/JPEG/GIF/WEBP) vagy szövegréteg nélküli (szkennelt, legfeljebb 20 oldalas) PDF képfelismerése egy lépésben; az eredmény AI-kiolvasás (ai_extracted, source_fact=false), nem ellenőrzött forrás.",
    parameters: { type: "object", properties: { ...properties, document_id: { type: "string" }, unit: { type: "integer", minimum: 0 }, text_offset: { type: "integer", minimum: 0 }, expected_hash: { type: "string" }, ocr: { type: "boolean" } }, required: ["source", "document_id"] },
  }, async (args, ctx) => {
    try {
      const data = documentInput.parse(args);
      if ((data.unit > 0 || data.text_offset > 0) && !data.expected_hash) throw new Error("Folytatáshoz fájl-hash szükséges.");
      return await readDocument(data, ctx);
    } catch (e) { return readDocumentFailure(e); }
  });
}