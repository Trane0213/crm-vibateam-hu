import type { SupabaseClient } from '@supabase/supabase-js';
import { nextStepActionInput,nextStepActionSchema } from '../next-step-action';
import { normalizeRole } from '@/lib/permissions';
import { hasSensitive } from '../approval';
export async function freezeNextStepAction(user:SupabaseClient,args:Record<string,unknown>) {
  const input=nextStepActionInput.parse(args);
  const {data:l,error}=await user.from('leads').select('id,summary,company_id,contact_id,assigned_to,status,pipeline_entered_at,next_step_type,next_step_due_at,next_step_note').eq('id',input.leadId).maybeSingle();
  if(error||!l||l.status==='won'||l.status==='lost')throw new Error('Az ügy nem elérhető vagy lezárt.');
  const {data:auth}=await user.auth.getUser();
  if(!auth.user)throw new Error('Bejelentkezés szükséges.');
  const p=await user.from('users_profile').select('roles:role_id(name)').eq('auth_user_id',auth.user.id).maybeSingle();
  const role=normalizeRole((p.data as {roles?:{name?:string}}|null)?.roles?.name);
  if(p.error||!(role==='owner'||(role==='sales'&&l.assigned_to===auth.user.id)))throw new Error('Az ügyhöz nincs jogosultság.');
  const company=l.company_id?await user.from('companies').select('name').eq('id',l.company_id).maybeSingle():null;
  const contact=l.contact_id?await user.from('contacts').select('name').eq('id',l.contact_id).maybeSingle():null;
  if(company?.error||contact?.error)throw new Error('A kapcsolódó adatok olvasása sikertelen.');
  const frozen=nextStepActionSchema.parse({...input,dueAt:new Date(input.dueAt).toISOString(),context:{
    lead_name:(l.summary||'Érdeklődő').slice(0,300),company_id:l.company_id,company_name:company?.data?.name?.slice(0,300)??null,
    contact_id:l.contact_id,contact_name:contact?.data?.name?.slice(0,300)??null,assigned_to:l.assigned_to,status:l.status,pipeline_entered_at:l.pipeline_entered_at,
    before:{next_step_type:l.next_step_type,next_step_due_at:l.next_step_due_at,next_step_note:l.next_step_note}}});
  if(hasSensitive(frozen))throw new Error('A művelet hozzáférési titkot tartalmaz.');
  return frozen;
}