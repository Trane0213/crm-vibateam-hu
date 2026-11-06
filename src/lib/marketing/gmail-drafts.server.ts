import type { SupabaseClient } from '@supabase/supabase-js';
import { normEmail, isBusinessMailbox } from '@/lib/gmail/relink-analysis';
import { getValidAccessToken } from '@/lib/gmail/oauth.server';
import { getDraft, getProfile, listDrafts, headerOf, extractBodies, type GmailMessage } from '@/lib/gmail/gmail-api.server';
import type { DraftSource } from './gmail-draft-source';

export async function ownDraftMailbox(sb: SupabaseClient, userId: string) {
  const role = await sb.rpc('crm_role_of', { _auth_user: userId });
  if (role.error || !['owner', 'marketing'].includes(role.data)) throw new Error('Csak tulajdonos vagy marketing olvashat kampánypiszkozatot.');
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const profile = await supabaseAdmin.from('users_profile').select('gmail_email,active,gmail_auth_error').eq('auth_user_id', userId).single();
  const mailbox = normEmail(profile.data?.gmail_email);
  if (profile.error || !profile.data?.active || profile.data.gmail_auth_error || !isBusinessMailbox(mailbox)) throw new Error('Nincs aktív saját céges Gmail-fiók.');
  const token = await getValidAccessToken(userId);
  const live = await getProfile(token.accessToken);
  if (normEmail(token.email) !== mailbox || normEmail(live.emailAddress) !== mailbox) throw new Error('A Gmail-fiók azonossága nem igazolt.');
  return { mailbox, accessToken: token.accessToken };
}

/** Fail closed on large/unsupported MIME: no snippets, truncation or hidden attachment fetches. */
export function inspectDraftMessage(message: GmailMessage) {
  if (!message.id || !message.labelIds?.includes('DRAFT') || message.labelIds.some(l => ['SENT', 'TRASH', 'SPAM'].includes(l))) throw new Error('A forrás már nem aktív Gmail-piszkozat.');
  let attachments = 0, nodes = 0, total = 0;
  const walk = (part: any, depth: number) => {
    if (!part) return;
    if (++nodes > 100 || depth > 10) throw new Error('A piszkozat szerkezete túl összetett.');
    total += Number(part.body?.size ?? 0);
    if (total > 200000 || (part.body?.data?.length ?? 0) > 280000) throw new Error('A piszkozat túl nagy; nem csonkítjuk.');
    const disposition = (part.headers ?? []).find((h: { name: string }) => h.name?.toLowerCase() === 'content-disposition')?.value ?? '';
    if (part.filename || /attachment/i.test(disposition) || (!['text/plain', 'text/html'].includes(part.mimeType) && part.body?.attachmentId)) attachments++;
    if (['text/plain', 'text/html'].includes(part.mimeType) && part.body?.attachmentId && !part.body?.data) throw new Error('A teljes levélszöveg külön letöltést igényel; másolás nem engedélyezett.');
    for (const child of part.parts ?? []) walk(child, depth + 1);
  };
  walk(message.payload, 0);
  const bodies = extractBodies(message);
  if ((bodies.html?.length ?? 0) + (bodies.text?.length ?? 0) > 200000) throw new Error('A piszkozat túl nagy; nem csonkítjuk.');
  return { ...bodies, attachments, subject: headerOf(message, 'subject') };
}

export async function listOwnDrafts(sb: SupabaseClient, userId: string, pageToken?: string) {
  const account = await ownDraftMailbox(sb, userId);
  const page = await listDrafts(account.accessToken, pageToken);
  // Gmail draft list only contains IDs: no body reads until explicit selection.
  return { mailbox: account.mailbox, drafts: (page.drafts ?? []).map(d => ({ id: d.id })), nextPageToken: page.nextPageToken ?? null, estimate: page.resultSizeEstimate ?? null };
}

export async function readOwnDraft(sb: SupabaseClient, userId: string, draftId: string): Promise<DraftSource> {
  const account = await ownDraftMailbox(sb, userId);
  const draft = await getDraft(account.accessToken, draftId);
  if (draft.id !== draftId) throw new Error('A piszkozat azonossága nem igazolt.');
  const copy = inspectDraftMessage(draft.message);
  return { draftId, messageId: draft.message.id, mailbox: account.mailbox, readAt: new Date().toISOString(), ...copy };
}