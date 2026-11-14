/**
 * AI chat-feltöltések — tiszta, tesztelhető szabályok a felülethez.
 * Jogosultságot NEM adnak: a mappát és a kulcsot a szerver (`/api/r2-upload`, purpose=chat)
 * állítja elő, a láthatóságot az `ai_chat_uploads` RLS adja. Ezek a tükrök csak elrejtik,
 * amit az adatbázis úgyis elutasítana.
 */
import type { RoleSlug } from "@/lib/permissions";
import type { ChatFolder } from "@/lib/r2-policy";
import { canUploadDoc } from "@/lib/documents/document-access";
import type { RecordContext } from "@/lib/ai-panel-context";

export type ChatAttachment = {
  id: string; name: string; folder: ChatFolder; fileKey: string; mime: string | null; size: number | null;
  /** Ha az ügy dokumentumai közé is mentve: az ügy felirata. */
  linkLabel?: string | null;
};

export const CHAT_FOLDER_LABEL: Record<ChatFolder, string> = {
  sales: "Sales mappa", marketing: "Marketing mappa", pm: "Projektvezetői mappa", owner: "Tulajdonosi mappa",
};
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const DEFAULT_ATTACHMENT_QUESTION = "Nézd meg a csatolt fájlt, és foglald össze, mi van rajta.";

/** A felhasználó saját mappája (az adatbázis `ai_chat_folder_of` tükre). */
export function ownChatFolder(role: RoleSlug | null | undefined): ChatFolder | null {
  if (role === "owner") return "owner";
  if (role === "sales") return "sales";
  if (role === "marketing") return "marketing";
  if (role === "project_manager") return "pm";
  return null;
}

/** Látható mappák: a saját szerepkör mappája; a Tulajdonos mindet látja. */
export function visibleChatFolders(role: RoleSlug | null | undefined): ChatFolder[] {
  if (role === "owner") return ["sales", "marketing", "pm", "owner"];
  const own = ownChatFolder(role);
  return own ? [own] : [];
}

/** Törlés gomb: a feltöltő (saját szerepkör mappájában) vagy a Tulajdonos — a DELETE RLS tükre. */
export function canDeleteChatUpload(role: RoleSlug | null | undefined, authUserId: string | null | undefined, row: { uploaded_by: string; folder: string }): boolean {
  if (role === "owner") return true;
  return !!authUserId && row.uploaded_by === authUserId && row.folder === ownChatFolder(role);
}

/** Michael (Google Ads) nem olvas dokumentumot, ezért nála nincs csatolás. */
export function agentAcceptsAttachments(agent: string): boolean {
  return agent === "crm" || agent === "sales" || agent === "pm" || agent === "marketing";
}

export type ChatLinkTarget = { kind: "project" | "company" | "quote"; id: string };
const KIND_SOURCE = { project: "project_documents", company: "company_documents", quote: "quote_documents" } as const;

/** Mely megnyitott ügyhöz ajánlható fel az ügyhöz mentés (csak ha a szerepkör oda egyébként is feltölthet). */
export function chatLinkTarget(ctx: RecordContext | null, role: RoleSlug | null | undefined): ChatLinkTarget | null {
  if (!ctx || (ctx.kind !== "project" && ctx.kind !== "company" && ctx.kind !== "quote")) return null;
  return canUploadDoc(role, KIND_SOURCE[ctx.kind]) ? { kind: ctx.kind, id: ctx.id } : null;
}

/** A modellnek küldött csatolmány-sorok: csak azonosító, a tartalmat az AI a jogosultság-ellenőrzött eszközzel olvassa. */
export function attachmentModelText(atts: ChatAttachment[]): string {
  return atts.map((a) => `[Csatolt fájl: „${a.name.replace(/[\[\]„”"]/g, "")}” — source=ai_chat_uploads, document_id=${a.id}, típus=${a.mime ?? "ismeretlen"}. Tartalma csak crm_read_document eszközzel olvasható (kép vagy szkennelt PDF: ocr=true).]`).join("\n");
}

/** Rejtett kontextus + kérdés + csatolmányok egy modellüzenetben; ha nincs rejtett rész, undefined (a látható szöveg megy). */
export function composeModelContent(prefix: string, question: string, atts: ChatAttachment[]): string | undefined {
  const extra = attachmentModelText(atts);
  if (!prefix && !extra) return undefined;
  return [prefix, question, extra].filter(Boolean).join("\n\n");
}
