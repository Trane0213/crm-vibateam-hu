import {z} from 'zod';
import {STATUS_TRANSITIONS, type LeadStatus, NEXT_STEP_TYPES} from '@/lib/sales/constants';
export const OPEN_PIPELINE_STATUSES=['quote_prep','quote_sent','follow_up','contract'] as const;
const stage=z.enum(OPEN_PIPELINE_STATUSES),uuid=z.string().uuid(),instant=z.string().datetime({offset:true});
export function allowedPipelineTransition(from:string,to:string):boolean {
 return OPEN_PIPELINE_STATUSES.some(s=>s===from)&&OPEN_PIPELINE_STATUSES.some(s=>s===to)&&(STATUS_TRANSITIONS[from as LeadStatus]??[]).some(s=>s===to);
}
export const pipelineStatusInput=z.object({leadId:uuid,status:stage}).strict();
export const pipelineStatusSchema=pipelineStatusInput.extend({context:z.object({lead_name:z.string().max(300),company_id:uuid.nullable(),company_name:z.string().max(300).nullable(),contact_id:uuid.nullable(),assigned_to:uuid.nullable(),status:stage,pipeline_entered_at:instant,next_step_type:z.enum(NEXT_STEP_TYPES),next_step_due_at:instant,next_step_note:z.string().max(10000).nullable()}).strict()}).strict().refine(a=>allowedPipelineTransition(a.context.status,a.status),'Tiltott Pipeline-átmenet');
export function verifyPipelineStatus(value:unknown,args:Record<string,unknown>):boolean {
 const i=pipelineStatusSchema.safeParse(args);
 const o=z.object({lead:z.object({id:uuid,company_id:uuid.nullable(),contact_id:uuid.nullable(),assigned_to:uuid.nullable(),status:stage,pipeline_entered_at:instant,next_step_type:z.enum(NEXT_STEP_TYPES),next_step_due_at:instant,next_step_note:z.string().nullable()}),before_status:stage,audit_id:uuid,approval_id:uuid}).safeParse(value);
 if(!i.success||!o.success)return false;
 const a=i.data,b=o.data;
 return b.audit_id===b.approval_id&&b.lead.id===a.leadId&&b.before_status===a.context.status&&b.lead.status===a.status&&b.lead.company_id===a.context.company_id&&b.lead.contact_id===a.context.contact_id&&b.lead.assigned_to===a.context.assigned_to&&Date.parse(b.lead.pipeline_entered_at)===Date.parse(a.context.pipeline_entered_at)&&b.lead.next_step_type===a.context.next_step_type&&Date.parse(b.lead.next_step_due_at)===Date.parse(a.context.next_step_due_at)&&b.lead.next_step_note===a.context.next_step_note;
}