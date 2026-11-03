import {z} from 'zod';
const uuid=z.string().uuid();
const instant=z.string().datetime({offset:true});
export const assignmentActionInput=z.object({leadId:uuid,assigneeId:uuid}).strict();
export const assignmentActionSchema=assignmentActionInput.extend({context:z.object({lead_name:z.string().max(300),company_id:uuid.nullable(),company_name:z.string().max(300).nullable(),contact_id:uuid.nullable(),assigned_to:uuid.nullable(),assigned_at:instant.nullable(),assignee_name:z.string().max(300).nullable(),new_assignee_name:z.string().min(1).max(300),status:z.string(),pipeline_entered_at:instant.nullable()}).strict()}).strict();
export function eligibleAssignmentTarget(value:unknown):boolean {
 const p=z.object({auth_user_id:uuid,active:z.literal(true),roles:z.object({name:z.literal('sales')})}).safeParse(value);
 return p.success;
}
const sameInstant=(a:string|null,b:string|null)=>a===b||(a!==null&&b!==null&&Date.parse(a)===Date.parse(b));
export function verifyAssignmentAction(value:unknown,args:Record<string,unknown>):boolean {
 const i=assignmentActionSchema.safeParse(args);
 const o=z.object({lead:z.object({id:uuid,company_id:uuid.nullable(),contact_id:uuid.nullable(),assigned_to:uuid,assigned_at:instant,status:z.string(),pipeline_entered_at:instant.nullable()}),before_assigned_to:uuid.nullable(),audit_id:uuid,approval_id:uuid}).safeParse(value);
 if(!i.success||!o.success)return false;
 const a=i.data,b=o.data;
 return b.audit_id===b.approval_id&&b.lead.id===a.leadId&&b.lead.assigned_to===a.assigneeId&&b.before_assigned_to===a.context.assigned_to&&b.lead.company_id===a.context.company_id&&b.lead.contact_id===a.context.contact_id&&b.lead.status===a.context.status&&sameInstant(b.lead.pipeline_entered_at,a.context.pipeline_entered_at)&&(a.context.assigned_at===null||sameInstant(b.lead.assigned_at,a.context.assigned_at));
}