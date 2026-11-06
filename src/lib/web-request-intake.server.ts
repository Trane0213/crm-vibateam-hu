import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
export const intakeReceipt = z.object({kind:z.literal('saved'),company_id:z.string().uuid(),contact_id:z.string().uuid(),by:z.string().uuid(),at:z.string().min(1)});
export type VerifiedIntake = {kind:'saved';companyId:string;contactId:string} | {kind:'existing';companyId:string} | {kind:'ambiguous'|'blocked';reason:string} | {kind:'uncertain';reason:string};
export async function verifyIntakeResult(raw: unknown, sb: SupabaseClient, requestId: string): Promise<VerifiedIntake> {
  const existing=z.object({kind:z.literal('existing'),company_id:z.string().uuid()}).safeParse(raw);
  const receipt=intakeReceipt.safeParse(raw);
  if(existing.success || receipt.success) {
    const companyId=existing.success ? existing.data.company_id : receipt.success ? receipt.data.company_id : '';
    const company=await sb.from('companies').select('id').eq('id',companyId).maybeSingle();
    if(company.error || !company.data) return {kind:'uncertain',reason:'A mentett cég a jogosultságoddal nem igazolható. Ellenőrizd az eredményt, ne vedd fel újra.'};
    if(existing.success) return {kind:'existing',companyId};
    if(!receipt.success) return {kind:'uncertain',reason:'Hiányos felvételi eredmény.'};
    const r=receipt.data;
    const [contact,audit]=await Promise.all([
      sb.from('contacts').select('id,company_id').eq('id',r.contact_id).eq('company_id',companyId).maybeSingle(),
      sb.from('activities').select('id,user_id,details').eq('user_id',r.by).eq('action','create').eq('details->>entity_type','quote_requests').eq('details->>entity_id',requestId).eq('details->>company_id',companyId).eq('details->>contact_id',r.contact_id).eq('details->>intake','web_request_atomic').limit(1),
    ]);
    if(contact.error || !contact.data || audit.error || !audit.data?.length) return {kind:'uncertain',reason:'A cég mentve lehet, de a kontakt és napló teljes visszaellenőrzése nem sikerült. Csak eredményellenőrzés szükséges.'};
    return {kind:'saved',companyId,contactId:r.contact_id};
  }
  const review=z.object({kind:z.enum(['ambiguous','blocked']),reason:z.string()}).safeParse(raw);
  return review.success ? review.data : {kind:'uncertain',reason:'A felvételi eredmény nem igazolható.'};
}