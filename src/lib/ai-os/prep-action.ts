import { z } from 'zod';
import { prepActivityInput } from '@/lib/sales/prep-activity';
export const prepActionSchema = prepActivityInput.extend({context:z.object({
  lead_name:z.string().max(300),company_id:z.string().uuid().nullable(),company_name:z.string().max(300).nullable(),
  contact_id:z.string().uuid().nullable(),contact_name:z.string().max(300).nullable(),assigned_to:z.string().uuid().nullable(),
}).strict()}).strict();
export function verifyPrepAction(value:unknown,args:Record<string,unknown>):boolean {
 const input=prepActionSchema.safeParse(args);
 const output=z.object({activity:z.object({id:z.string().uuid(),lead_id:z.string().uuid(),followup_type:z.enum(['call','email']),result:z.string().nullable(),
  company_id:z.string().uuid().nullable(),assigned_to:z.string().uuid(),completed:z.literal(true),due_date:z.string().datetime({offset:true}),created_at:z.string().datetime({offset:true})}),
  audit_id:z.string().uuid(),approval_id:z.string().uuid()}).safeParse(value);
 if(!input.success||!output.success)return false;
 const a=output.data.activity;
 return a.id===output.data.approval_id&&a.lead_id===input.data.leadId&&a.followup_type===input.data.type&&
 a.result===(input.data.result||null)&&a.company_id===input.data.context.company_id&&
 (input.data.context.assigned_to===null||a.assigned_to===input.data.context.assigned_to)&&a.due_date===a.created_at;
}