import type { SupabaseClient } from '@supabase/supabase-js';
import { readOwnDraft } from './gmail-drafts.server';
import type { DraftSource } from './gmail-draft-source';
import { createHash } from 'node:crypto';

export function sourceHash(source: Pick<DraftSource, 'draftId' | 'messageId' | 'mailbox' | 'subject' | 'text' | 'html' | 'attachments'>) {
  return createHash('sha256').update(JSON.stringify([source.draftId, source.messageId, source.mailbox, source.subject, source.text, source.html, source.attachments])).digest('hex');
}
async function campaignScope(sb: SupabaseClient, userId: string, id: string, revision: string) {
  const role = await sb.rpc('crm_role_of', { _auth_user: userId });
  const row = await sb.from('email_campaigns').select('id,created_by,status,updated_at').eq('id', id).maybeSingle();
  if (role.error || !['owner', 'marketing'].includes(role.data) || row.error || !row.data || row.data.status === 'archived' || row.data.updated_at !== revision || (role.data === 'marketing' && row.data.created_by !== userId)) throw new Error('A kampány megváltozott vagy nem szerkeszthető; nyisd újra.');
}
export async function importCampaignSource(sb: SupabaseClient, userId: string, input: { campaignId: string; revision: string; draftId: string; expectedHash: string }) {
  await campaignScope(sb, userId, input.campaignId, input.revision);
  const source = await readOwnDraft(sb, userId, input.draftId);
  const hash = sourceHash(source);
  if (hash !== input.expectedHash) throw new Error('A Gmail-piszkozat megváltozott; tekintsd meg újra.');
  if (source.attachments || !source.subject.trim() || source.subject.length > 500 || (source.text?.length ?? 0) > 20000 || (source.html?.length ?? 0) > 200000 || (!source.text?.trim() && !source.html?.trim())) throw new Error('A teljes piszkozat nem menthető veszteség nélkül.');
  const metadata = { draft_id: source.draftId, message_id: source.messageId, mailbox: source.mailbox, read_at: source.readAt, imported_by: userId, sha256: hash };
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const save = await supabaseAdmin.rpc('campaign_import_gmail_source', { p_campaign: input.campaignId, p_user: userId, p_expected: input.revision, p_subject: source.subject, p_text: source.text ?? '', p_html: source.html, p_source: metadata });
  if (save.error) throw new Error('A mentés nem igazolt; nyisd újra a kampányt, ne ismételd vakon.');
  const read = await sb.from('email_campaigns').select('id,message_subject,message_body,message_html,gmail_draft_source').eq('id', input.campaignId).maybeSingle();
  const row = read.data;
  if (read.error || !row || row.message_subject !== source.subject || row.message_body !== (source.text ?? '') || row.message_html !== source.html || JSON.stringify(row.gmail_draft_source?.sha256) !== JSON.stringify(hash) || row.gmail_draft_source?.draft_id !== source.draftId || row.gmail_draft_source?.imported_by !== userId) throw new Error('A mentett forrás visszaolvasása nem igazolt; nyisd újra a kampányt.');
  return { campaignId: input.campaignId };
}
export async function detachCampaignSource(sb: SupabaseClient, userId: string, id: string, revision: string) {
  await campaignScope(sb, userId, id, revision);
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const result = await supabaseAdmin.rpc('campaign_detach_gmail_source', { p_campaign: id, p_user: userId, p_expected: revision });
  if (result.error) throw new Error('A szövegesre váltás nem igazolt; nyisd újra a kampányt.');
  const read = await sb.from('email_campaigns').select('id,message_html,gmail_draft_source').eq('id', id).maybeSingle();
  if (read.error || !read.data || read.data.message_html !== null || read.data.gmail_draft_source !== null) throw new Error('A szövegesre váltás visszaolvasása nem igazolt.');
  return { campaignId: id };
}