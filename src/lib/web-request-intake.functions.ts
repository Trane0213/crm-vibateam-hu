import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
const input=z.object({id:z.string().uuid()}).strict();

export const createWebsiteIntake=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input).handler(async({data,context})=>{
  const role=await context.supabase.rpc('crm_role_of',{_auth_user:context.userId});
  if(role.error || !['owner','marketing'].includes(String(role.data))) throw new Error('Csak tulajdonos vagy marketinges vehet fel webes igényt.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {verifyIntakeResult}=await import('./web-request-intake.server');
  const result=await supabaseAdmin.rpc('website_request_intake',{p_request:data.id,p_user:context.userId});
  if(result.error) return {kind:'uncertain' as const,reason:'A felvétel nem igazolható. Ellenőrizd a mentett eredményt; ne indíts újabb felvételt.'};
  return verifyIntakeResult(result.data,context.supabase,data.id);
});
export const readWebsiteIntake=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(input).handler(async({data,context})=>{
  const role=await context.supabase.rpc('crm_role_of',{_auth_user:context.userId});
  if(role.error || !['owner','marketing'].includes(String(role.data))) throw new Error('Nincs felvételi ellenőrzési jogosultságod.');
  const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
  const {verifyIntakeResult}=await import('./web-request-intake.server');
  const result=await supabaseAdmin.from('quote_requests').select('intake_company_id,intake_contact_id,intake_by,intake_at').eq('id',data.id).maybeSingle();
  if(result.error || !result.data) throw new Error('Az igény nem ellenőrizhető.');
  const r=result.data;
  if(!r.intake_company_id) return {kind:'uncertain' as const,reason:'Nincs teljes mentett felvételi eredmény. Kézi ellenőrzés szükséges; ez nem bizonyítja, hogy korábbi írás nem történt.'};
  return verifyIntakeResult({kind:'saved',company_id:r.intake_company_id,contact_id:r.intake_contact_id,by:r.intake_by,at:r.intake_at},context.supabase,data.id);
});