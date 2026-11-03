import {describe,it,expect} from 'vitest';
import {followupActionInput,verifyFollowupAction} from './followup-action';
const id='00000000-0000-4000-8000-000000000001';
const args={leadId:id,type:'call',dueAt:'2026-11-05T10:00:00+01:00',note:'TESZT',context:{lead_name:'TESZT',company_id:null,company_name:null,contact_id:null,contact_name:null,assigned_to:id,status:'new',pipeline_entered_at:null,before:{next_step_type:null,next_step_due_at:null,next_step_note:null}}};
const saved={followup:{id,lead_id:id,company_id:null,assigned_to:id,project_id:null,quote_id:null,followup_type:'call',due_date:'2026-11-05T09:00:00Z',result:'TESZT',completed:false},audit_id:id,approval_id:id};
describe('Timothy planned followup',()=>{
 it.each(['call','email','meeting','other'])('existing type %s',type=>expect(followupActionInput.safeParse({leadId:id,type,dueAt:args.dueAt,note:''}).success).toBe(true));
 it('requires full timezone timestamp',()=>expect(followupActionInput.safeParse({leadId:id,type:'call',dueAt:'2026-11-05',note:''}).success).toBe(false));
 it('no completed input',()=>expect(followupActionInput.safeParse({leadId:id,type:'call',dueAt:args.dueAt,note:'',completed:true}).success).toBe(false));
 it('exact saved evidence',()=>expect(verifyFollowupAction(saved,args)).toBe(true));
 it('rejects completed activity',()=>expect(verifyFollowupAction({...saved,followup:{...saved.followup,completed:true}},args)).toBe(false));
 it('rejects quote substitution',()=>expect(verifyFollowupAction({...saved,followup:{...saved.followup,quote_id:id}},args)).toBe(false));
 it('rejects wrong lead',()=>expect(verifyFollowupAction({...saved,followup:{...saved.followup,lead_id:'00000000-0000-4000-8000-000000000009'}},args)).toBe(false));
 it('rejects wrong date',()=>expect(verifyFollowupAction({...saved,followup:{...saved.followup,due_date:'2026-11-05T08:00:00Z'}},args)).toBe(false));
 it('requires bound audit',()=>expect(verifyFollowupAction({...saved,audit_id:'00000000-0000-4000-8000-000000000009'},args)).toBe(false));
});