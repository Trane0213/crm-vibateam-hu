import { z } from 'zod';
import { NEXT_STEP_TYPES } from '@/lib/sales/constants';

export const nextStepActionInput = z.object({
  leadId: z.string().uuid(),
  type: z.enum(NEXT_STEP_TYPES),
  dueAt: z.string().datetime({ offset: true }).refine(v => Number.isFinite(Date.parse(v))),
  note: z.string().trim().max(10000),
}).strict();
const savedStep = z.object({next_step_type:z.string().nullable(),next_step_due_at:z.string().datetime({offset:true}).nullable(),next_step_note:z.string().nullable()}).strict();
export const nextStepActionSchema = nextStepActionInput.extend({context:z.object({
  lead_name:z.string().max(300),company_id:z.string().uuid().nullable(),company_name:z.string().max(300).nullable(),
  contact_id:z.string().uuid().nullable(),contact_name:z.string().max(300).nullable(),assigned_to:z.string().uuid().nullable(),
  status:z.string(),pipeline_entered_at:z.string().datetime({offset:true}).nullable(),before:savedStep,
}).strict()}).strict();
export function verifyNextStepAction(value:unknown,args:Record<string,unknown>):boolean {
  const i=nextStepActionSchema.safeParse(args);
  const o=z.object({lead:savedStep.extend({id:z.string().uuid()}),before:savedStep,audit_id:z.string().uuid(),approval_id:z.string().uuid()}).safeParse(value);
  if(!i.success||!o.success)return false;
  const a=i.data,b=o.data;
  return b.audit_id===b.approval_id&&b.lead.id===a.leadId&&b.lead.next_step_type===a.type&&
    b.lead.next_step_due_at!==null&&Date.parse(b.lead.next_step_due_at)===Date.parse(a.dueAt)&&b.lead.next_step_note===(a.note||null)&&
    b.before.next_step_type===a.context.before.next_step_type&&b.before.next_step_note===a.context.before.next_step_note&&
    (b.before.next_step_due_at===a.context.before.next_step_due_at||(b.before.next_step_due_at!==null&&a.context.before.next_step_due_at!==null&&Date.parse(b.before.next_step_due_at)===Date.parse(a.context.before.next_step_due_at)));
}
export function nextStepBudapestTime(iso:string|null):string {
  return iso?new Intl.DateTimeFormat('hu-HU',{timeZone:'Europe/Budapest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',timeZoneName:'longOffset'}).format(new Date(iso))+' · Europe/Budapest':'Nincs megadva';
}