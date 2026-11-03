import type {SupabaseClient} from '@supabase/supabase-js';
import {contactActionInput,contactActionSchema} from '../contact-action';
import {normalizeRole} from '@/lib/permissions';
import {hasSensitive} from '../approval';
export async function freezeContactAction(user:SupabaseClient,args:Record<string,unknown>) {
 const input=contactActionInput.parse(args);
 const read=await user.from('leads').select('id,summary,company_id,contact_id,assigned_to,status,pipeline_entered_at').eq('id',input.leadId).maybeSingle();
 const l=read.data;
 if(read.error||!l||!l.company_id||['won','lost'].includes(l.status))throw new Error('A nyitott, céghez kapcsolt ügy nem elérhető.');
 const auth=await user.auth.getUser();
 if(!auth.data.user)throw new Error('Bejelentkezés szükséges.');
 const p=await user.from('users_profile').select('roles:role_id(name)').eq('auth_user_id',auth.data.user.id).maybeSingle();
 const role=normalizeRole((p.data as {roles?:{name?:string}}|null)?.roles?.name);
 if(p.error||!(role==='owner'||(role==='sales'&&l.assigned_to===auth.data.user.id)))throw new Error('Nincs jogosultság az ügyhöz.');
 const company=await user.from('companies').select('name').eq('id',l.company_id).maybeSingle();
 const target=await user.from('contacts').select('id,name,company_id').eq('id',input.contactId).eq('company_id',l.company_id).maybeSingle();
 const old=l.contact_id?await user.from('contacts').select('name').eq('id',l.contact_id).maybeSingle():null;
 if(company.error||!company.data||target.error||!target.data||old?.error||(l.contact_id&&!old?.data))throw new Error('A céghez tartozó kapcsolattartó nem ellenőrizhető.');
 const frozen=contactActionSchema.parse({...input,context:{lead_name:(l.summary||'Érdeklődő').slice(0,300),company_id:l.company_id,company_name:company.data.name.slice(0,300),contact_id:l.contact_id,contact_name:old?.data?.name?.slice(0,300)??null,assigned_to:l.assigned_to,status:l.status,pipeline_entered_at:l.pipeline_entered_at,new_contact_name:target.data.name.slice(0,300)}});
 if(hasSensitive(frozen))throw new Error('A művelet védett adatot tartalmaz.');
 return frozen;
}