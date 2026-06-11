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

function toEmailRow(userId: string, m: GmailMessage, ownerEmail: string) {
  const from = headerOf(m, "From");
  const to = headerOf(m, "To");
  const subject = headerOf(m, "Subject");
  const body = extractBody(m);
  const sentAt = m.internalDate ? new Date(Number(m.internalDate)).toISOString() : null;
  const direction = parseAddr(from)?.toLowerCase() === ownerEmail.toLowerCase() ? "out" : "in";
  return {
    gmail_message_id: m.id,
    gmail_thread_id: m.threadId,
    thread_id: m.threadId,
    gmail_label_ids: m.labelIds ?? [],
    gmail_history_id: m.historyId ? Number(m.historyId) : null,
    direction,
    subject: subject || null,
    summary: m.snippet ?? null,
    body: body || null,
    from_email: parseAddr(from),
    to_email: parseAddr(to),
    sent_at: sentAt,
    owner_user_id: userId,
  };
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

  for (const it of items) {
    if (have.has(it.id)) { result.skipped++; continue; }
    try {
      const m = await getMessage(accessToken, it.id, "full");
      const row = toEmailRow(userId, m, email);
      const { error } = await admin.from("emails").insert(row);
      if (error) {
        if (String(error.message).toLowerCase().includes("duplicate")) result.skipped++;
        else result.errors.push(`${it.id}: ${error.message}`);
      } else result.inserted++;
    } catch (e: any) {
      result.errors.push(`${it.id}: ${e?.message ?? String(e)}`);
    }
  }

  await admin.from("gmail_accounts").update({ last_sync_at: new Date().toISOString() }).eq("user_id", userId);
  return result;
}
