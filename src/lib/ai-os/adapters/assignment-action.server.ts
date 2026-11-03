import type {SupabaseClient} from '@supabase/supabase-js';
import {assignmentActionInput,assignmentActionSchema,eligibleAssignmentTarget} from '../assignment-action';
import {normalizeRole} from '@/lib/permissions';
import {hasSensitive} from '../approval';
export async function freezeAssignmentAction(user:SupabaseClient,args:Record<string,unknown>) {
 const input=assignmentActionInput.parse(args);
 const auth=await user.auth.getUser();
 if(!auth.data.user)throw new Error('Bejelentkezés szükséges.');
 const actor=await user.from('users_profile').select('roles:role_id(name)').eq('auth_user_id',auth.data.user.id).maybeSingle();
 if(actor.error||normalizeRole((actor.data as {roles?:{name?:string}}|null)?.roles?.name)!=='owner')throw new Error('Csak tulajdonos adhat át ügyet.');
 const read=await user.from('leads').select('id,summary,company_id,contact_id,assigned_to,assigned_at,status,pipeline_entered_at').eq('id',input.leadId).maybeSingle();
 const l=read.data;
 if(read.error||!l||['won','lost'].includes(l.status)||l.assigned_to===input.assigneeId)throw new Error('A nyitott ügy nem elérhető, vagy már ez a felelőse.');
 const target=await user.from('users_profile').select('auth_user_id,full_name,email,active,roles:role_id(name)').eq('auth_user_id',input.assigneeId).maybeSingle();
 const old=l.assigned_to?await user.from('users_profile').select('full_name,email').eq('auth_user_id',l.assigned_to).maybeSingle():null;
 const company=l.company_id?await user.from('companies').select('name').eq('id',l.company_id).maybeSingle():null;
 if(target.error||!eligibleAssignmentTarget(target.data)||old?.error||(l.assigned_to&&!old?.data)||company?.error||(l.company_id&&!company?.data))throw new Error('Az aktív értékesítő vagy az ügy adatai nem ellenőrizhetők.');
 const frozen=assignmentActionSchema.parse({...input,context:{lead_name:(l.summary||'Érdeklődő').slice(0,300),company_id:l.company_id,company_name:company?.data?.name?.slice(0,300)??null,contact_id:l.contact_id,assigned_to:l.assigned_to,assigned_at:l.assigned_at,assignee_name:(old?.data?.full_name||old?.data?.email)?.slice(0,300)??null,new_assignee_name:(target.data?.full_name||target.data?.email||'').slice(0,300),status:l.status,pipeline_entered_at:l.pipeline_entered_at}});
 if(hasSensitive(frozen))throw new Error('A művelet védett adatot tartalmaz.');
 return frozen;
}