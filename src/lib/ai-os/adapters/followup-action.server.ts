import type {SupabaseClient} from '@supabase/supabase-js';
import {followupActionInput,followupActionSchema} from '../followup-action';
import {freezeNextStepAction} from './next-step-action.server';
export async function freezeFollowupAction(user:SupabaseClient,args:Record<string,unknown>) {
 const input=followupActionInput.parse(args);
 const frozen=await freezeNextStepAction(user,{...input,type:input.type==='call'?'phone':input.type});
 const open=await user.from('followups').select('id').eq('lead_id',input.leadId).or('completed.is.null,completed.eq.false').limit(1);
 if(open.error)throw new Error('Az utánkövetések ellenőrzése sikertelen.');
 if(open.data?.length)throw new Error('Az ügynek már van nyitott utánkövetése; újat nem hozok létre.');
 return followupActionSchema.parse({...input,dueAt:frozen.dueAt,context:frozen.context});
}