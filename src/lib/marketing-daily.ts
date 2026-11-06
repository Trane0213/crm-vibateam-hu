import type { SupabaseClient } from '@supabase/supabase-js';
import { marketingMailFacts, type MarketingMail } from './marketing-mail';
import { isMarketingCompany } from './marketing-universe';
import { readMarketingMeta } from './marketing-status';
export async function loadMarketingDaily(sb: SupabaseClient, userId: string, now = new Date()) {
  const [companies, contacts, emails, followups, calls] = await Promise.all([
    sb.from('companies').select('id,name,notes').order('id').limit(1001),
    sb.from('contacts').select('id,name,email,phone,company_id,email_invalid').order('id').limit(1001),
    sb.from('emails').select('id,thread_id,company_id,owner_user_id,from_email,to_emails,is_outbound,internal_date,created_at').eq('owner_user_id',userId).order('internal_date',{ascending:false}).limit(1001),
    sb.from('followups').select('id,company_id,followup_type,due_date,result').eq('assigned_to',userId).eq('completed',false).order('due_date').limit(1001),
    sb.from('phone_calls').select('id,company_id,contact_id,outcome,callback_date,summary,created_at').eq('outcome','callback').not('callback_date','is',null).order('callback_date').limit(1001),
  ]);
  for (const result of [companies,contacts,emails,followups,calls]) if (result.error) throw result.error;
  // Conservative coverage flag: PostgREST may cap limit(1001) at 1000.
  const partial = [companies,contacts,emails,followups,calls].some(r => (r.data?.length ?? 0) >= 1000);
  const campaign = (companies.data ?? []).filter(isMarketingCompany).map(c => ({...c,meta:readMarketingMeta(c.notes)}));
  const campaignIds = new Set(campaign.map(c=>c.id));
  const recent = new Date(now.getTime()-7*86400000).toISOString();
  const facts = marketingMailFacts(((emails.data ?? []) as MarketingMail[]).filter(e=>e.company_id&&campaignIds.has(e.company_id)),contacts.data ?? [],recent);
  const open = (followups.data ?? []).filter(f=>f.company_id && campaignIds.has(f.company_id));
  const name = (id: string | null) => companies.data?.find(c=>c.id===id)?.name ?? 'Ismeretlen cég';
  const select = (ids: string[]) => campaign.filter(c=>ids.includes(c.id)).map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`}));
  return { checked_at:now.toISOString(),timezone:'Europe/Budapest',partial, scope:'Felhasználó által látható kampánycégek, saját szinkronfiók levelei és saját utánkövetések; legfeljebb 1000 sor forrásonként.',
    to_contact:campaign.filter(c=>c.meta.status==='new').map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`})),
    qualified:campaign.filter(c=>c.meta.status==='qualified').map(c=>({id:c.id,name:c.name,source_link:`/customers/${c.id}`})),
    reply_pending:select(facts.replyCompanyIds),awaiting_reply:select(facts.awaitingCompanyIds),
    followups:open.map(f=>({...f,company_name:name(f.company_id),overdue:!!f.due_date && f.due_date<now.toISOString(),source_link:`/customers/${f.company_id}`})),
    callbacks:(calls.data??[]).filter(c=>c.company_id&&campaignIds.has(c.company_id)).map(c=>({...c,company_name:name(c.company_id)})),
    missing_contacts:campaign.filter(c=>!(contacts.data??[]).some(k=>k.company_id===c.id&& (k.email||k.phone))).map(c=>({id:c.id,name:c.name})),
    mail: facts, limitations:['Tárolt saját postafiókadat; nem teljes Gmail-lefedettség.','A válaszjelzés nem tartalmi elfogadás: a levélszöveget külön ellenőrizni kell.','A következő lépés javaslat, nem automatikusan mentett teendő.'] };
}