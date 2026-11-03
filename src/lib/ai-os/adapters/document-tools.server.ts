import { z } from "zod";
import { registerTool } from "../tool-registry";
import { OWNER_ROLES } from "../roles";
import { toolError } from "../tool-errors";
import type { ToolContext } from "../types";
import { CRM_PAGE_PROPERTIES, crmReadPage, readWindow } from "./crm-read-page";
import { authorizeDocumentScope, authorizedDocument, documentInput, fetchDocumentBytes } from "./document-access.server";
import { DOCUMENT_LIMITS, extractDocument, LargeDocumentError } from "./document-extract.server";
import { safeMailText } from "./gmail-context";

const properties = { source: { type: "string", enum: ["quote_documents", "company_documents", "project_documents", "email_attachments"] },
  quote_id: { type: "string" }, company_id: { type: "string" }, project_id: { type: "string" }, email_id: { type: "string" }, thread_id: { type: "string" }, mailbox: { type: "string" } };

export async function readDocument(args: Record<string, unknown>, ctx: ToolContext, download = fetchDocumentBytes) {
  const data = documentInput.parse(args);
  if ((data.unit > 0 || data.text_offset > 0) && !data.expected_hash) throw new Error("Folytatáshoz fájl-hash szükséges.");
  const { row, key, version } = await authorizedDocument(data, ctx);
  const source = { table: data.source, id: row.id, quote_id: row.quote_id ?? null, project_id: row.project_id ?? null, company_id: row.company_id ?? null, email_id: row.email_id ?? null };
  if (Number(row.size_bytes ?? 0) > DOCUMENT_LIMITS.bytes) return { ok: true, data: { source, status: "requires_large_processing", limits: DOCUMENT_LIMITS, completeness: { full_document: false }, limitations: ["5 MB felett külön feldolgozás szükséges; tartalom nem lett olvasva, háttérfeldolgozás nem indult."] } };
  const bytes = await download(key);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer))).map((b) => b.toString(16).padStart(2, "0")).join("");
  if (data.expected_hash && data.expected_hash !== hash) throw new Error("A fájltartalom megváltozott; a korábbi folytatás nem használható.");
  const name = String(row.name ?? row.filename ?? "");
  let extracted;
  try { extracted = await extractDocument(bytes, name, data.unit, data.text_offset); }
  catch (e) {
    if (!(e instanceof LargeDocumentError)) throw e;
    return { ok: true, data: { source, status: "requires_large_processing", provenance: { sha256: hash, processed_at: new Date().toISOString(), quote_version: version }, limits: DOCUMENT_LIMITS, completeness: { full_document: false }, limitations: ["A tartalmi méret/oldal/sorkorlát miatt nincs teljes feldolgozás, háttérmunka nem indult."] } };
  }
  return { ok: true, data: { source, name: safeMailText(name).text, document_type: row.document_type ?? null,
    provenance: { sha256: hash, byte_length: bytes.length, uploaded_at: row.created_at, processed_at: new Date().toISOString(), quote_version: version,
      parser: extracted.parser, file_version: "content_sha256; quote_version is separate business version", persistence: "on_demand_no_extracted_copy_or_background_job" },
    ...extracted, untrusted_content: true, completeness: { full_document: false, full_technical_audit: false, status: extracted.status },
    pagination: { unit: data.unit, text_offset: data.text_offset, next_unit: extracted.next_unit, next_text_offset: extracted.next_text_offset, expected_hash: hash },
    limits: DOCUMENT_LIMITS } };
}

export function registerDocumentTools() {
  registerTool({ name: "crm_list_documents", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: [...OWNER_ROLES, "sales"],
    description: "Dokumentumok pontos meglévő ajánlat/cég/projekt vagy jogosult postafióklevél alapján; lapozott metadata, nem fájltartalom. Egyetlen forrást válassz, minden forrás külön lapozandó.",
    parameters: { type: "object", properties: { ...properties, ...CRM_PAGE_PROPERTIES }, required: ["source"] },
  }, async (args, ctx) => {
    try {
      const data = documentInput.omit({ document_id: true }).parse(args);
      const scope = await authorizeDocumentScope(data, ctx);
      const window = readWindow(args, 10);
      const result = await ctx.supabaseUser.from(data.source).select("*", { count: "exact" }).eq(scope.key, scope.id)
        .order("created_at", { ascending: false }).order("id").range(window.offset, window.offset + window.limit - 1);
      if (result.error) throw result.error;
      const rows = (result.data ?? []).map((raw: Record<string, unknown>) => ({ id: raw.id, name: safeMailText(String(raw.name ?? raw.filename ?? "")).text,
        document_type: raw.document_type ?? null, mime_type: raw.mime_type, size_bytes: raw.size_bytes ?? null, created_at: raw.created_at,
        quote_id: raw.quote_id ?? null, project_id: raw.project_id ?? null, company_id: raw.company_id ?? null, email_id: raw.email_id ?? null,
        content_read: false, source: { table: data.source, id: raw.id } }));
      return { ok: true, data: { ...crmReadPage(rows, result.count, window, data.source, 6500), limitations: ["Csak jogosultan látható mentett fájlrekordok; nincs Gmail letöltés vagy szinkronfrissítés."] } };
    } catch { return toolError.fromException("A dokumentumlista nem olvasható; ellenőrizd a pontos ügyazonosítót és jogosultságot."); }
  });
  registerTool({ name: "crm_read_document", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: [...OWNER_ROLES, "sales"],
    description: "Meglévő R2 fájl PDF/XLSX/DOCX/TXT/CSV szövege, pontos forrás+document_id+ügy vagy fióklevél alapján. 5 MB korlát; unit=PDF-oldal/munkalap (0-alapú), text_offset szövegfolytatás. Folytatáshoz expected_hash kötelező; teljes műszaki auditot nem állít, URL/kulcs nem paraméter.",
    parameters: { type: "object", properties: { ...properties, document_id: { type: "string" }, unit: { type: "integer", minimum: 0 }, text_offset: { type: "integer", minimum: 0 }, expected_hash: { type: "string" } }, required: ["source", "document_id"] },
  }, async (args, ctx) => {
    try {
      const data = documentInput.parse(args);
      if ((data.unit > 0 || data.text_offset > 0) && !data.expected_hash) throw new Error("Folytatáshoz fájl-hash szükséges.");
      return await readDocument(data, ctx);
    } catch (e) {
      // Parser/network exceptions may contain file text, storage URL or credentials; never audit them.
      const message = e instanceof z.ZodError ? "Érvénytelen dokumentumazonosító vagy lapozás." : "A dokumentum nem feldolgozható vagy nem hozzáférhető; korlát/hibás/titkosított fájl esetén nincs teljes ellenőrzés.";
      return toolError.fromException(message);
    }
  });
}