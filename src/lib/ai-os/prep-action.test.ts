import {it,expect} from 'vitest';
import {prepActionSchema,verifyPrepAction} from './prep-action';
import {verifyExecution} from './approval';
import {registerCrmTools} from './adapters/crm-tools.server';
import {getTool,toolsForAgent} from './tool-registry';
const id='00000000-0000-4000-8000-000000000001';
const args={leadId:id,type:'call',result:'TESZT beszéltem',context:{lead_name:'TESZT',company_id:null,company_name:null,contact_id:null,contact_name:null,assigned_to:id}};
const saved={activity:{id,lead_id:id,company_id:null,assigned_to:id,followup_type:'call',result:args.result,completed:true,due_date:'2026-11-03T17:00:00Z',created_at:'2026-11-03T17:00:00Z'},audit_id:id,approval_id:id};
it('rejects backdating and unsupported completed meetings',()=>{
 expect(prepActionSchema.safeParse({...args,due_date:'2020-01-01'}).success).toBe(false);
 expect(prepActionSchema.safeParse({...args,type:'meeting'}).success).toBe(false);
 expect(prepActionSchema.safeParse({...args,type:'email'}).success).toBe(true);
});
it('requires exact persisted lead, result, completion, timestamp and audit',()=>{
 expect(verifyPrepAction(saved,args)).toBe(true);
 expect(verifyExecution('sales_record_prep_activity',{ok:true,data:saved},args).status).toBe('succeeded');
 for(const patch of [{lead_id:'00000000-0000-4000-8000-000000000002'},{result:'different'},{completed:false},{due_date:'2020-01-01T00:00:00Z'}]) {
  expect(verifyPrepAction({...saved,activity:{...saved.activity,...patch}},args)).toBe(false);
 }
 expect(verifyPrepAction({...saved,audit_id:null},args)).toBe(false);
});
it('only Timothy Owner/Sales can see the activity tool and no direct execution without P0 action',async()=>{
 registerCrmTools();const tool=getTool('sales_record_prep_activity');if(!tool)throw new Error('missing');
 for(const role of ['marketing','project_manager',null])expect(toolsForAgent({agentId:'timothy',agentDomains:['sales.prep_activity'],userRole:role}).some(t=>t.name===tool.name)).toBe(false);
 expect(toolsForAgent({agentId:'timothy',agentDomains:['sales.prep_activity'],userRole:'sales'}).some(t=>t.name===tool.name)).toBe(true);
 await expect(tool.execute(args,{userId:id,agentId:'timothy',runId:id,threadId:null,supabaseUser:{} as never,supabaseAdmin:{} as never})).rejects.toThrow('Tartós jóváhagyás');
});