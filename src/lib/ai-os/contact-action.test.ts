import {describe,it,expect} from 'vitest';
import {contactActionInput,contactActionSchema,verifyContactAction} from './contact-action';
import {verifyExecution} from './approval';
const id='00000000-0000-4000-8000-000000000001',target='00000000-0000-4000-8000-000000000009';
const args={leadId:id,contactId:target,context:{lead_name:'TESZT',company_id:id,company_name:'TESZT Cég',contact_id:null,contact_name:null,assigned_to:id,status:'new',pipeline_entered_at:null,new_contact_name:'TESZT új személy'}};
const saved={lead:{id,company_id:id,contact_id:target,assigned_to:id,status:'new',pipeline_entered_at:null},before_contact_id:null,audit_id:id,approval_id:id};
describe('Timothy existing lead contact selection',()=>{
 it('requires contact UUID',()=>expect(contactActionInput.safeParse({leadId:id,contactId:'név'}).success).toBe(false));
 it('cannot clear contact',()=>expect(contactActionInput.safeParse({leadId:id,contactId:null}).success).toBe(false));
 it('cannot edit person data',()=>expect(contactActionInput.safeParse({leadId:id,contactId:target,email:'test@example.com'}).success).toBe(false));
 it('requires frozen company',()=>expect(contactActionSchema.safeParse({...args,context:{...args.context,company_id:null}}).success).toBe(false));
 it('exact contact readback passes',()=>expect(verifyContactAction(saved,args)).toBe(true));
 it.each(['id','company_id','contact_id','assigned_to','status','pipeline_entered_at'])('wrong saved %s blocked',field=>expect(verifyContactAction({...saved,lead:{...saved.lead,[field]:'wrong'}},args)).toBe(false));
 it('must preserve old selection evidence',()=>expect(verifyContactAction({...saved,before_contact_id:id},args)).toBe(false));
 it('audit must match action',()=>expect(verifyContactAction({...saved,audit_id:target},args)).toBe(false));
 it('generic ok cannot claim success',()=>expect(verifyExecution('sales_set_lead_contact',{ok:true,data:{id}},args).status).toBe('unknown'));
});