/**
 * Gmail -> meglevo `emails` tabla szinkron. Csak az emails tablat irja
 * (gmail_message_id alapjan idempotens upsert).
 */
import { getAdminClient } from "@/lib/gmail/admin.server";
import {
  listMessages,
  getMessage,
  headerOf,
  extractBody,
  listAttachmentParts,
  getAttachment,
} from "@/lib/gmail/gmail-api.server";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";

export type SyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  attachments: number;
  errors: string[];
  pages: number;
  done: boolean;
};

function parseAddr(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim() || null;
}

function safeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180) || "file";
}

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB / fájl

export async function syncInbox(
  userId: string,
  opts: { max?: number; backfill?: boolean; query?: string } = {},
): Promise<SyncResult> {
  const { accessToken, email } = await getValidAccessToken(userId);
  const admin = getAdminClient();
  const result: SyncResult = {
    fetched: 0,
    inserted: 0,
    skipped: 0,
    attachments: 0,
    errors: [],
    pages: 0,
    done: true,
  };

  const targetMax = opts.backfill ? Math.min(opts.max ?? 5000, 10000) : Math.min(opts.max ?? 25, 100);
  // Per-page batch: Gmail max 500/req, mi 100-zal megyünk a stabilitás miatt.
  const perPage = opts.backfill ? 100 : Math.min(targetMax, 100);

  // gmail_thread_id -> email_threads.id (uuid) cache a futás során
  const threadCache = new Map<string, string>();
  async function ensureThread(gmailThreadId: string, subject: string | null): Promise<string> {
    const safeSubject = subject && subject.trim().length > 0 ? subject : "(nincs tárgy)";
    const cached = threadCache.get(gmailThreadId);
    if (cached) return cached;
    const { data: found } = await admin
      .from("email_threads")
      .select("id")
      .eq("gmail_thread_id", gmailThreadId)
      .maybeSingle();
    if (found?.id) { threadCache.set(gmailThreadId, found.id); return found.id; }
    const { data: inserted, error: insErr } = await admin
      .from("email_threads")
      .insert({ gmail_thread_id: gmailThreadId, subject: safeSubject })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(`email_threads insert: ${insErr?.message ?? "unknown"}`);
    threadCache.set(gmailThreadId, inserted.id);
    return inserted.id;
  }

  // Backfillnél időkorlát, hogy egy run ne menjen tovább kb. 4 percnél.
  const deadline = Date.now() + (opts.backfill ? 4 * 60 * 1000 : 60 * 1000);

  // R2 modul lazy import (csak server).
  const { presignR2Url } = await import("@/lib/r2.server");

  async function saveAttachments(emailDbId: string, gmailMessageId: string, m: any) {
    const parts = listAttachmentParts(m);
    if (!parts.length) return;
    // melyik attachmentId-k vannak már mentve?
    const ids = parts.map((p) => p.attachmentId);
    const { data: existing } = await admin
      .from("email_attachments")
      .select("gmail_attachment_id")
      .eq("email_id", emailDbId)
      .in("gmail_attachment_id", ids);
    const have = new Set((existing ?? []).map((r: any) => r.gmail_attachment_id));
    for (const att of parts) {
      if (have.has(att.attachmentId)) continue;
      if (att.size && att.size > MAX_ATTACHMENT_BYTES) {
        result.errors.push(`${gmailMessageId}: ${att.filename} túl nagy (${att.size}B), kihagyva`);
        continue;
      }
      try {
        const a = await getAttachment(accessToken, gmailMessageId, att.attachmentId);
        const buf = Buffer.from(a.data.replace(/-/g, "+").replace(/_/g, "/"), "base64");
        const key = `gmail-attachments/${userId}/${gmailMessageId}/${safeFilename(att.filename)}`;
        const url = presignR2Url({ method: "PUT", key, contentType: att.mimeType, expiresIn: 300 });
        const put = await fetch(url, { method: "PUT", body: buf, headers: { "content-type": att.mimeType } });
        if (!put.ok) throw new Error(`R2 upload ${put.status}`);
        const { error: insErr } = await admin.from("email_attachments").insert({
          email_id: emailDbId,
          gmail_attachment_id: att.attachmentId,
          filename: att.filename,
          mime_type: att.mimeType,
          size_bytes: buf.length,
          r2_key: key,
          inline: att.inline,
          content_id: att.contentId,
        });
        if (insErr) throw insErr;
        result.attachments++;
      } catch (e: any) {
        result.errors.push(`${gmailMessageId} att(${att.filename}): ${e?.message ?? String(e)}`);
      }
    }
  }

  let pageToken: string | undefined = undefined;
  while (result.fetched < targetMax) {
    if (Date.now() > deadline) { result.done = false; break; }
    const remaining = targetMax - result.fetched;
    const list = await listMessages(accessToken, {
      maxResults: Math.min(perPage, remaining),
      pageToken,
      q: opts.query,
    });
    result.pages++;
    const items = list.messages ?? [];
    if (!items.length) { break; }

    const ids = items.map((i) => i.id);
    const { data: existing } = await admin
      .from("emails")
      .select("id,gmail_message_id")
      .in("gmail_message_id", ids);
    const haveMap = new Map<string, string>(
      (existing ?? []).map((r: any) => [r.gmail_message_id as string, r.id as string]),
    );

    for (const it of items) {
      result.fetched++;
      if (Date.now() > deadline) { result.done = false; break; }
      const knownId = haveMap.get(it.id);
      if (knownId) {
        // meglevo email — csak az esetleg hianyzo csatolmanyokat probaljuk leszedni
        try {
          const m = await getMessage(accessToken, it.id, "full");
          await saveAttachments(knownId, it.id, m);
        } catch {}
        result.skipped++;
        continue;
      }
      try {
        const m = await getMessage(accessToken, it.id, "full");
        const from = headerOf(m, "From");
        const to = headerOf(m, "To");
        const subjectHdr = headerOf(m, "Subject");
        const subject = subjectHdr && subjectHdr.trim().length > 0 ? subjectHdr : null;
        const body = extractBody(m);
        const threadDbId = await ensureThread(m.threadId, subject);
        const row = {
          gmail_message_id: m.id,
          thread_id: threadDbId,
          from_email: parseAddr(from),
          to_email: parseAddr(to),
          body: body || null,
          summary: m.snippet ?? null,
        };
        const { data: inserted, error } = await admin
          .from("emails")
          .insert(row)
          .select("id")
          .single();
        if (error || !inserted) {
          if (String(error?.message ?? "").toLowerCase().includes("duplicate")) result.skipped++;
          else {
            console.error("[gmail/sync] emails insert error", { id: it.id, error });
            result.errors.push(`${it.id}: ${error?.message ?? "unknown"}`);
          }
        } else {
          result.inserted++;
          await saveAttachments(inserted.id, it.id, m);
        }
      } catch (e: any) {
        console.error("[gmail/sync] message error", { id: it.id, error: e?.message ?? e });
        result.errors.push(`${it.id}: ${e?.message ?? String(e)}`);
      }
    }

    if (!list.nextPageToken) break;
    pageToken = list.nextPageToken;
  }

  if (result.fetched >= targetMax && pageToken) result.done = false;

  await admin
    .from("users_profile")
    .update({ gmail_last_sync_at: new Date().toISOString() })
    .eq("auth_user_id", userId);
  void email;
  return result;
}
