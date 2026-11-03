import {z} from 'zod';
export const contactActionInput=z.object({leadId:z.string().uuid(),contactId:z.string().uuid()}).strict();
export const contactActionSchema=contactActionInput.extend({context:z.object({lead_name:z.string().max(300),company_id:z.string().uuid(),company_name:z.string().max(300),contact_id:z.string().uuid().nullable(),contact_name:z.string().max(300).nullable(),assigned_to:z.string().uuid().nullable(),status:z.string(),pipeline_entered_at:z.string().datetime({offset:true}).nullable(),new_contact_name:z.string().min(1).max(300)}).strict()}).strict();
export function verifyContactAction(value:unknown,args:Record<string,unknown>):boolean {
 const i=contactActionSchema.safeParse(args);
 const o=z.object({lead:z.object({id:z.string().uuid(),company_id:z.string().uuid(),contact_id:z.string().uuid(),assigned_to:z.string().uuid().nullable(),status:z.string(),pipeline_entered_at:z.string().datetime({offset:true}).nullable()}),before_contact_id:z.string().uuid().nullable(),audit_id:z.string().uuid(),approval_id:z.string().uuid()}).safeParse(value);
 if(!i.success||!o.success)return false;
 const a=i.data,b=o.data;
 return b.audit_id===b.approval_id&&b.lead.id===a.leadId&&b.lead.contact_id===a.contactId&&b.before_contact_id===a.context.contact_id&&b.lead.company_id===a.context.company_id&&b.lead.assigned_to===a.context.assigned_to&&b.lead.status===a.context.status&&
 (b.lead.pipeline_entered_at===a.context.pipeline_entered_at||(b.lead.pipeline_entered_at!==null&&a.context.pipeline_entered_at!==null&&Date.parse(b.lead.pipeline_entered_at)===Date.parse(a.context.pipeline_entered_at)));
}