import { z } from "zod";
import type { ToolContext } from "../types";
import { getTool } from "../tool-registry";
import { DOCUMENT_LIMITS } from "./document-extract.server";

export const documentInput = z.object({ source: z.enum(["quote_documents", "company_documents", "project_documents", "email_attachments"]), document_id: z.string().uuid(),
  quote_id: z.string().uuid().optional(), company_id: z.string().uuid().optional(), project_id: z.string().uuid().optional(),
  thread_id: z.string().uuid().optional(), email_id: z.string().uuid().optional(), mailbox: z.string().email().optional(),
  unit: z.number().int().min(0).default(0), text_offset: z.number().int().min(0).default(0), expected_hash: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export type DocumentInput = z.infer<typeof documentInput>;

export async function authorizeDocumentScope(data: Partial<DocumentInput> & { source: DocumentInput["source"] }, ctx: ToolContext) {
  const sb = ctx.supabaseUser;
  if (data.source === "email_attachments") {
    if (!data.email_id || !data.thread_id || !data.company_id || !data.mailbox) throw new Error("Melléklethez pontos levél/szál/cég/postafiók szükséges.");
    const tool = getTool("crm_read_email_thread");
    if (!tool) throw new Error("A levélhozzáférés nem ellenőrizhető.");
    const result = await tool.execute({ email_id: data.email_id, thread_id: data.thread_id, company_id: data.company_id, mailbox: data.mailbox, limit: 1 }, ctx) as { ok?: boolean; data?: { items?: { id: string }[] } };
    if (!result.ok || !result.data?.items?.some((m) => m.id === data.email_id)) throw new Error("A melléklet levele nem olvasható ebben a postafiókban/ügyben.");
    return { key: "email_id", id: data.email_id, version: null };
  }
  const table = data.source === "quote_documents" ? "quotes" : data.source === "company_documents" ? "companies" : "projects";
  const id = table === "quotes" ? data.quote_id : table === "companies" ? data.company_id : data.project_id;
  if (!id) throw new Error("Pontos kapcsolódó ügyazonosító szükséges.");
  const result = table === "quotes"
    ? await sb.from("quotes").select("id,version,group_id,alternative_key,lead_id,project_id").eq("id", id).maybeSingle()
    : await sb.from(table).select("id").eq("id", id).maybeSingle();
  if (result.error || !result.data) throw new Error("A dokumentum kapcsolódó ügye nem hozzáférhető.");
  return { key: table === "quotes" ? "quote_id" : table === "companies" ? "company_id" : "project_id", id, version: table === "quotes" ? result.data : null };
}

export async function authorizedDocument(data: DocumentInput, ctx: ToolContext) {
  const scope = await authorizeDocumentScope(data, ctx);
  const result = await ctx.supabaseUser.from(data.source).select("*").eq("id", data.document_id).eq(scope.key, scope.id).maybeSingle();
  if (result.error || !result.data) throw new Error("A dokumentum nem olvasható vagy más ügyhöz tartozik.");
  const row = result.data as Record<string, unknown>;
  const key = String(row.file_url ?? row.r2_key ?? "");
  if (!key || key.length > 1024 || key.includes("..") || key.startsWith("/") || key.includes("://")) throw new Error("Nem támogatott/érvénytelen tárolási kulcs; külső URL nem olvasható.");
  return { row, key, version: scope.version };
}

/** Existing R2 signer, only after identity + user-visible row + parent checks. No URL reaches the model. */
export async function fetchDocumentBytes(key: string): Promise<Uint8Array> {
  const { presignR2Url } = await import("../../r2.server");
  const response = await fetch(presignR2Url({ key, method: "GET", expiresIn: 60 }), { redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok || !response.body) throw new Error("A fájl nem tölthető le.");
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > DOCUMENT_LIMITS.bytes) { await response.body.cancel(); throw new Error("A fájl nagyfeldolgozást igényel (5 MB felett)."); }
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.length;
      if (total > DOCUMENT_LIMITS.bytes) { await reader.cancel(); throw new Error("A fájl nagyfeldolgozást igényel (5 MB felett)."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}