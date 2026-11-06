import type { SupabaseClient } from '@supabase/supabase-js';
import { marketingMailFacts, type MarketingMail } from './marketing-mail';
import { isMarketingCompany } from './marketing-universe';
import { readMarketingMeta } from './marketing-status';
export async function loadMarketingDaily(sb: SupabaseClient, userId: string, now = new Date()) {
  const [companies, contacts, emails, followups, calls, profile, suppressions] = await Promise.all([
    sb.from('companies').select('id,name,notes,marketing_status,marketing_status_changed_at,marketing_status_changed_by,marketing_status_source,marketing_handoff_lead_id').order('id').limit(1001),
    sb.from('contacts').select('id,name,email,phone,company_id,email_invalid').order('id').limit(1001),
    sb.from('emails').select('id,thread_id,company_id,owner_user_id,gmail_message_id,gmail_label_ids,from_email,to_emails,cc_emails,bcc_emails,is_outbound,internal_date,created_at').eq('owner_user_id',userId).order('internal_date',{ascending:false}).limit(1001),
    sb.from('followups').select('id,company_id,followup_type,due_date,result').eq('assigned_to',userId).eq('completed',false).order('due_date').limit(1001),
    sb.from('phone_calls').select('id,company_id,contact_id,outcome,callback_date,summary,created_at').eq('outcome','callback').not('callback_date','is',null).order('callback_date').limit(1001),
    sb.from('users_profile').select('gmail_email').eq('auth_user_id',userId).limit(1),
    sb.from('marketing_email_suppressions').select('email_norm').eq('blocked',true).order('email_norm').limit(1001),
  ]);
  for (const result of [companies,contacts,emails,followups,calls,profile,suppressions]) if (result.error) throw result.error;
  // Conservative coverage flag: PostgREST may cap limit(1001) at 1000.
  const partial = [companies,contacts,emails,followups,calls,suppressions].some(r => (r.data?.length ?? 0) >= 1000);
  const blockedEmails = new Set((suppressions.data ?? []).map(s => s.email_norm));
  const suppressionComplete = (suppressions.data?.length ?? 0) < 1000;
  const contactState = (companyId: string) => {
    const rows = (contacts.data ?? []).filter(c => c.company_id === companyId);
    const blocked = rows.some(c => c.email && blockedEmails.has(c.email.trim().toLowerCase()));
    const invalid = rows.some(c => c.email && c.email_invalid === true);
    const phoneAvailable = rows.some(c => !!c.phone?.trim());
    const emailAvailable = suppressionComplete && rows.some(c => !!c.email?.trim() && c.email_invalid !== true && !blockedEmails.has(c.email.trim().toLowerCase()));
    return { blocked_email: blocked, invalid_email: invalid, suppression_complete: suppressionComplete, phone_available: phoneAvailable, email_available: emailAvailable, email_send_permission: false as const };
  };
  const campaign = (companies.data ?? []).filter(isMarketingCompany).map(c => ({...c,meta:readMarketingMeta(c.notes, c)}));
  const campaignIds = new Set(campaign.map(c=>c.id));
  const recent = new Date(now.getTime()-7*86400000).toISOString();
  const facts = marketingMailFacts(((emails.data ?? []) as MarketingMail[]).filter(e=>e.company_id&&campaignIds.has(e.company_id)),contacts.data ?? [],recent,profile.data?.[0]?.gmail_email ?? '');
  const open = (followups.data ?? []).filter(f=>f.company_id && campaignIds.has(f.company_id));
  const name = (id: string | null) => companies.data?.find(c=>c.id===id)?.name ?? 'Ismeretlen cég';
  const select = (ids: string[]) => campaign.filter(c=>ids.includes(c.id)).map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`}));
  return { checked_at:now.toISOString(),timezone:'Europe/Budapest',partial, scope:'Felhasználó által látható kampánycégek, saját szinkronfiók levelei, saját utánkövetések és közösen látható visszahívások; legfeljebb 1000 sor forrásonként.',
    to_contact:campaign.filter(c=>c.meta.status==='new').map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`,contact_state:contactState(c.id)})),
    contact_warnings:campaign.map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`,contact_state:contactState(c.id)})).filter(c=>c.contact_state.blocked_email || c.contact_state.invalid_email || !c.contact_state.suppression_complete),
    qualified:campaign.filter(c=>c.meta.status==='qualified').map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`})),
    reply_pending:select(facts.replyCompanyIds),awaiting_reply:select(facts.awaitingCompanyIds),
    followups:open.map(f=>({...f,company_name:name(f.company_id),overdue:!!f.due_date && f.due_date<now.toISOString(),source_link:`/customers/${f.company_id}`})),
    callbacks:(calls.data??[]).filter(c=>c.company_id&&campaignIds.has(c.company_id)).map(c=>({...c,company_name:name(c.company_id),visibility_scope:'shared_visible_not_own' as const})),
    missing_contacts:campaign.filter(c=>{const s=contactState(c.id);return !s.phone_available && !s.email_available;}).map(c=>({id:c.id,name:c.name})),
    mail: facts, limitations:['Tárolt saját postafiókadat; nem teljes Gmail-lefedettség.','A válaszjelzés nem tartalmi elfogadás: a levélszöveget külön ellenőrizni kell.','A következő lépés javaslat, nem automatikusan mentett teendő.','A tiltott/hibás email nem használható megkeresési ajánláshoz; a telefon külön ellenőrzendő. A használható adat nem küldési engedély.','A visszahívások közösen látható sorok, nem kizárólag saját feladatok.'] };
}