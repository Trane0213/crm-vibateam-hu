import type {SupabaseClient} from '@supabase/supabase-js';
import {pipelineStatusInput,pipelineStatusSchema} from '../pipeline-status-action';
import {normalizeRole} from '@/lib/permissions';
import {hasSensitive} from '../approval';
export async function freezePipelineStatus(user:SupabaseClient,args:Record<string,unknown>) {
 const input=pipelineStatusInput.parse(args);
 const auth=await user.auth.getUser();
 if(!auth.data.user)throw new Error('Bejelentkezés szükséges.');
 const actor=await user.from('users_profile').select('roles:role_id(name)').eq('auth_user_id',auth.data.user.id).maybeSingle();
 const role=normalizeRole((actor.data as {roles?:{name?:string}}|null)?.roles?.name);
 const read=await user.from('leads').select('id,summary,company_id,contact_id,assigned_to,status,pipeline_entered_at,next_step_type,next_step_due_at,next_step_note').eq('id',input.leadId).maybeSingle();
 const l=read.data;
 if(actor.error||read.error||!l||!(role==='owner'||(role==='sales'&&l.assigned_to===auth.data.user.id)))throw new Error('Az ügy nem elérhető.');
 const company=l.company_id?await user.from('companies').select('name').eq('id',l.company_id).maybeSingle():null;
 if(company?.error||(l.company_id&&!company?.data))throw new Error('A cég nem ellenőrizhető.');
 const frozen=pipelineStatusSchema.parse({...input,context:{lead_name:(l.summary||'Érdeklődő').slice(0,300),company_id:l.company_id,company_name:company?.data?.name?.slice(0,300)??null,contact_id:l.contact_id,assigned_to:l.assigned_to,status:l.status,pipeline_entered_at:l.pipeline_entered_at,next_step_type:l.next_step_type,next_step_due_at:l.next_step_due_at,next_step_note:l.next_step_note}});
 if(hasSensitive(frozen))throw new Error('A művelet védett adatot tartalmaz.');
 return frozen;
}