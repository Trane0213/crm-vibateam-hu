import {describe,it,expect} from 'vitest';
import {allowedPipelineTransition,pipelineStatusInput,pipelineStatusSchema,verifyPipelineStatus} from './pipeline-status-action';
import {verifyExecution} from './approval';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000009';
const args={leadId:id,status:'quote_sent',context:{lead_name:'TESZT',company_id:id,company_name:'TESZT Cég',contact_id:null,assigned_to:id,status:'quote_prep',pipeline_entered_at:'2026-11-03T17:00:00Z',next_step_type:'phone',next_step_due_at:'2026-11-05T09:00:00Z',next_step_note:'TESZT hívás'}};
const saved={lead:{...args.context,id,status:'quote_sent'},before_status:'quote_prep',audit_id:id,approval_id:id};
describe('Timothy existing open Pipeline edges',()=>{
 it.each([['quote_prep','quote_sent'],['quote_sent','follow_up'],['quote_sent','contract'],['follow_up','quote_sent'],['follow_up','contract']])('%s → %s accepted', (from,to)=>expect(allowedPipelineTransition(from,to)).toBe(true));
 it.each([['new','quote_prep'],['contacted','follow_up'],['quote_prep','contract'],['quote_sent','quote_prep'],['contract','won'],['quote_sent','lost'],['won','quote_sent'],['quote_sent','quote_sent']])('%s → %s blocked',(from,to)=>expect(allowedPipelineTransition(from,to)).toBe(false));
 it.each(['new','contacted','won','lost'])('no %s target',status=>expect(pipelineStatusInput.safeParse({leadId:id,status}).success).toBe(false));
 it('cannot set pipeline timestamp',()=>expect(pipelineStatusInput.safeParse({leadId:id,status:'quote_sent',pipeline_entered_at:'2026-11-03T17:00:00Z'}).success).toBe(false));
 it.each(['pipeline_entered_at','next_step_type','next_step_due_at'])('missing %s blocked',key=>expect(pipelineStatusSchema.safeParse({...args,context:{...args.context,[key]:null}}).success).toBe(false));
 it('saved exact status verifies',()=>expect(verifyPipelineStatus(saved,args)).toBe(true));
 it.each(['id','status','assigned_to','company_id','contact_id','pipeline_entered_at','next_step_type','next_step_due_at','next_step_note'])('wrong %s cannot succeed',key=>expect(verifyPipelineStatus({...saved,lead:{...saved.lead,[key]:'wrong'}},args)).toBe(false));
 it('before status evidence required',()=>expect(verifyPipelineStatus({...saved,before_status:'follow_up'},args)).toBe(false));
 it('audit must match action',()=>expect(verifyPipelineStatus({...saved,audit_id:other},args)).toBe(false));
 it('generic ok is not status success',()=>expect(verifyExecution('sales_change_pipeline_status',{ok:true,data:{id}},args).status).toBe('unknown'));
 it('draft does not add a sending prerequisite',()=>expect(pipelineStatusSchema.safeParse(args).success).toBe(true));
});