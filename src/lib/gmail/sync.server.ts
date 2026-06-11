/**
 * Gmail -> meglevo `emails` tabla szinkron. Csak az emails tablat irja
 * (gmail_message_id alapjan idempotens upsert).
 */
import { getAdminClient } from "@/lib/gmail/admin.server";
import { listMessages, getMessage, headerOf, extractBody, type GmailMessage } from "@/lib/gmail/gmail-api.server";
import { getValidAccessToken } from "@/lib/gmail/oauth.server";

export type SyncResult = { fetched: number; inserted: number; skipped: number; errors: string[] };

function parseAddr(raw: string): string | null {
  if (!raw) return null;
  const m = raw.match(/<([^>]+)>/);
  return (m ? m[1] : raw).trim() || null;
}

export async function syncInbox(userId: string, opts: { max?: number } = {}): Promise<SyncResult> {
  const { accessToken, email } = await getValidAccessToken(userId);
  const admin = getAdminClient();
  const result: SyncResult = { fetched: 0, inserted: 0, skipped: 0, errors: [] };

  const list = await listMessages(accessToken, { maxResults: Math.min(opts.max ?? 25, 100) });
  const items = list.messages ?? [];
  result.fetched = items.length;
  if (!items.length) return result;

  const ids = items.map((i) => i.id);
  const { data: existing } = await admin.from("emails").select("gmail_message_id").in("gmail_message_id", ids);
  const have = new Set((existing ?? []).map((r: any) => r.gmail_message_id));

  // gmail_thread_id -> email_threads.id (uuid) cache a futás során
  const threadCache = new Map<string, string>();
  async function ensureThread(gmailThreadId: string, subject: string | null): Promise<string> {
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
      .insert({ gmail_thread_id: gmailThreadId, subject })
      .select("id")
      .single();
    if (insErr || !inserted) throw new Error(`email_threads insert: ${insErr?.message ?? "unknown"}`);
    threadCache.set(gmailThreadId, inserted.id);
    return inserted.id;
  }

  for (const it of items) {
    if (have.has(it.id)) { result.skipped++; continue; }
    try {
      const m = await getMessage(accessToken, it.id, "full");
      const from = headerOf(m, "From");
      const to = headerOf(m, "To");
      const subject = headerOf(m, "Subject") || null;
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
      const { error } = await admin.from("emails").insert(row);
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate")) result.skipped++;
        else {
          console.error("[gmail/sync] emails insert error", { id: it.id, error });
          result.errors.push(`${it.id}: ${error.message}`);
        }
      } else result.inserted++;
    } catch (e: any) {
      console.error("[gmail/sync] message error", { id: it.id, error: e?.message ?? e, stack: e?.stack });
      result.errors.push(`${it.id}: ${e?.message ?? String(e)}`);
    }
  }

  await admin
    .from("users_profile")
    .update({ gmail_last_sync_at: new Date().toISOString() })
    .eq("auth_user_id", userId);
  void email;
  return result;
}
