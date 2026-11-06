import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
export const saveThreadCompany = createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input=>z.object({threadId:z.string().uuid(),companyId:z.string().uuid(),oldCompanyId:z.string().uuid().nullable()}).parse(input)).handler(async({data,context})=>{
  const sb=context.supabase;
  const current=await sb.from('email_threads').select('id,company_id,contact_id,lead_id').eq('id',data.threadId).maybeSingle();
  if(current.error||!current.data)throw new Error('A szál nem olvasható.');
  if(current.data.company_id!==data.oldCompanyId)throw new Error('A szál kapcsolata megváltozott; töltsd újra.');
  const {validateCrmLink}=await import('./validate-crm-link');
  await validateCrmLink(sb,{company_id:data.companyId,contact_id:current.data.contact_id,lead_id:current.data.lead_id});
  let q=sb.from('email_threads').update({company_id:data.companyId}).eq('id',data.threadId);
  q=data.oldCompanyId?q.eq('company_id',data.oldCompanyId):q.is('company_id',null);
  const r=await q.select('id,company_id').single();
  if(r.error||r.data?.company_id!==data.companyId)throw new Error('A hozzárendelés nem sikerült; a jogosultság vagy kapcsolat ellenőrizendő.');
  return r.data;
});