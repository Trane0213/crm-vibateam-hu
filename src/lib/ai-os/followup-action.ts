import { z } from 'zod';
import { nextStepActionSchema } from './next-step-action';
export const followupActionInput=z.object({leadId:z.string().uuid(),type:z.enum(['call','email','meeting','other']),dueAt:z.string().datetime({offset:true}),note:z.string().trim().max(10000)}).strict();
export const followupActionSchema=followupActionInput.extend({context:nextStepActionSchema.shape.context}).strict();
export function verifyFollowupAction(value:unknown,args:Record<string,unknown>):boolean {
 const i=followupActionSchema.safeParse(args);
 const o=z.object({followup:z.object({id:z.string().uuid(),lead_id:z.string().uuid(),company_id:z.string().uuid().nullable(),assigned_to:z.string().uuid(),project_id:z.null(),quote_id:z.null(),followup_type:z.string(),due_date:z.string().datetime({offset:true}),result:z.string().nullable(),completed:z.literal(false)}),audit_id:z.string().uuid(),approval_id:z.string().uuid()}).safeParse(value);
 if(!i.success||!o.success)return false;
 const f=o.data.followup;
 return f.id===o.data.approval_id&&o.data.audit_id===o.data.approval_id&&f.lead_id===i.data.leadId&&f.company_id===i.data.context.company_id&&
  (i.data.context.assigned_to===null||f.assigned_to===i.data.context.assigned_to)&&f.followup_type===i.data.type&&Date.parse(f.due_date)===Date.parse(i.data.dueAt)&&f.result===(i.data.note||null);
}