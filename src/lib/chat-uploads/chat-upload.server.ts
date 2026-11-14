/**
 * AI chat-feltöltés (tulajdonosi döntés 2026-11-14): a fájl a feltöltő szerepkörének
 * mappájába kerül (`ai_chat_uploads`), kérésre a megnyitott ügy dokumentumai közé is.
 * A tárolási kulcsot és a mappát a szerver állítja elő; minden sor a hívó saját
 * jogosultságával (RLS) íródik, így a meglévő dokumentumszabályok nem bővülnek.
 */
import { buildKey, chatFolderOf, checkFile, isUuid, UPLOAD_ROLES, type ChatFolder } from "@/lib/r2-policy";

type Sb = { from: (t: string) => any; rpc: (fn: string, args?: Record<string, unknown>) => any };
export type ChatLinkKind = "project" | "company" | "quote";
const LINK_TABLE = { project: "project_documents", company: "company_documents", quote: "quote_documents" } as const;
const PARENT_TABLE = { project: "projects", company: "companies", quote: "quotes" } as const;
const UI_AGENTS = ["crm", "sales", "pm", "marketing", "ads"];

export type ChatUploadResult = {
  id: string; name: string; folder: ChatFolder; file_url: string; mime_type: string; size_bytes: number;
  link: { table: string; document_id: string; parent_id: string } | null;
};

function isImage(name: string) { return /\.(png|jpe?g|gif|webp|heic|heif)$/i.test(name); }

async function put(key: string, contentType: string, body: ArrayBuffer) {
  const { presignR2Url } = await import("@/lib/r2.server");
  const r = await fetch(presignR2Url({ method: "PUT", key, contentType, expiresIn: 300 }), { method: "PUT", headers: { "Content-Type": contentType }, body });
  if (!r.ok) throw Object.assign(new Error(`Tárhely hiba (${r.status})`), { status: 502 });
}
async function removeObject(key: string) {
  try { const { presignR2Url } = await import("@/lib/r2.server"); await fetch(presignR2Url({ method: "DELETE", key, expiresIn: 60 }), { method: "DELETE" }); } catch { /* a takarítás nem kritikus */ }
}

export class ChatUploadError extends Error { constructor(message: string, public status = 400) { super(message); } }

export async function handleChatUpload(args: {
  supabase: Sb; userId: string; isOwner: boolean; role: string | null; file: File;
  linkKind?: string | null; linkId?: string | null; agentId?: string | null;
}): Promise<ChatUploadResult> {
  const { supabase, userId, file } = args;
  const folder = chatFolderOf(args.role, args.isOwner);
  if (!folder) throw new ChatUploadError("Ehhez a feltöltéshez nincs jogosultságod", 403);
  const fileError = checkFile("chat", file.name, file.type, file.size);
  if (fileError) throw new ChatUploadError(fileError);
  const kind = args.linkKind ? (args.linkKind as ChatLinkKind) : null;
  if (kind) {
    if (!(kind in LINK_TABLE) || !isUuid(args.linkId)) throw new ChatUploadError("Érvénytelen ügyhivatkozás");
    if (!args.isOwner && !UPLOAD_ROLES[kind].includes(String(args.role ?? ""))) throw new ChatUploadError("Ehhez az ügyhöz nem tölthetsz fel dokumentumot", 403);
    const { data: parent } = await supabase.from(PARENT_TABLE[kind]).select("id").eq("id", args.linkId).maybeSingle();
    if (!parent) throw new ChatUploadError("Az ügy nem található vagy nem elérhető", 403);
  }
  const contentType = file.type || "application/octet-stream";
  const body = await file.arrayBuffer();
  const unique = () => crypto.randomUUID().slice(0, 8);
  const key = buildKey({ purpose: "chat", targetId: null, category: folder, userId, fileName: file.name, unique: unique() });
  await put(key, contentType, body);

  let link: ChatUploadResult["link"] = null, linkKey: string | null = null;
  try {
    if (kind && args.linkId) {
      const category = kind === "quote" ? "other" : isImage(file.name) ? "photo" : "other";
      linkKey = buildKey({ purpose: kind, targetId: args.linkId, category, userId, fileName: file.name, unique: unique() });
      await put(linkKey, contentType, body);
      const { data: profileId } = await supabase.rpc("current_profile_id");
      const row = kind === "project"
        ? { project_id: args.linkId, name: file.name, file_url: linkKey, document_type: category, uploaded_by: profileId ?? null }
        : kind === "company"
          ? { company_id: args.linkId, name: file.name, file_url: linkKey, document_type: category, mime_type: contentType, size_bytes: file.size, source: "ai_chat", uploaded_by: profileId ?? null }
          : { quote_id: args.linkId, name: file.name, file_url: linkKey, document_type: "other", mime_type: contentType, size_bytes: file.size };
      const { data: doc, error } = await supabase.from(LINK_TABLE[kind]).insert(row).select("id").single();
      if (error || !doc) throw new ChatUploadError("Az ügy dokumentumai közé nem sikerült menteni (jogosultság).", 403);
      link = { table: LINK_TABLE[kind], document_id: doc.id, parent_id: args.linkId };
    }
    const { data, error } = await supabase.from("ai_chat_uploads").insert({
      folder, name: file.name.slice(0, 255), file_url: key, mime_type: contentType, size_bytes: file.size,
      agent_id: args.agentId && UI_AGENTS.includes(args.agentId) ? args.agentId : null,
      link_table: link?.table ?? null, link_document_id: link?.document_id ?? null, link_parent_id: link?.parent_id ?? null,
    }).select("id").single();
    if (error || !data) throw new ChatUploadError("A fájl nem menthető a mappába (jogosultság).", 403);
    return { id: data.id, name: file.name, folder, file_url: key, mime_type: contentType, size_bytes: file.size, link };
  } catch (e) {
    // Részleges siker nincs: a már feltöltött fájlok és az ügy-sor visszavonása.
    if (link) await supabase.from(link.table).delete().eq("id", link.document_id);
    await removeObject(key); if (linkKey) await removeObject(linkKey);
    throw e;
  }
}
