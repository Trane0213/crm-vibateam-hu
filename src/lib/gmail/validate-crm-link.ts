import type { SupabaseClient } from '@supabase/supabase-js';
import {z} from 'zod';
/** User-RLS relation validation, shared by manual association and outbound send before Gmail side effects. */
export async function validateCrmLink(sb: SupabaseClient, input: {company_id?:string|null;contact_id?:string|null;lead_id?:string|null}) {
  for(const id of [input.company_id,input.contact_id,input.lead_id])if(id)z.string().uuid().parse(id);
  let companyId=input.company_id??null;
  if(input.contact_id){const r=await sb.from('contacts').select('id,company_id').eq('id',input.contact_id).maybeSingle();if(r.error||!r.data)throw new Error('A kapcsolattartó nem olvasható.');if(companyId&&companyId!==r.data.company_id)throw new Error('A kapcsolattartó másik céghez tartozik.');companyId=r.data.company_id;}
  if(input.lead_id){const r=await sb.from('leads').select('id,company_id,contact_id').eq('id',input.lead_id).maybeSingle();if(r.error||!r.data)throw new Error('A lead nem olvasható.');if(companyId&&companyId!==r.data.company_id)throw new Error('A lead másik céghez tartozik.');if(input.contact_id&&r.data.contact_id&&input.contact_id!==r.data.contact_id)throw new Error('Eltérő lead-kapcsolattartó.');companyId=r.data.company_id;}
  if(companyId){const r=await sb.from('companies').select('id').eq('id',companyId).maybeSingle();if(r.error||!r.data)throw new Error('A cég nem olvasható.');}
  return {company_id:companyId,contact_id:input.contact_id??null,lead_id:input.lead_id??null};
}