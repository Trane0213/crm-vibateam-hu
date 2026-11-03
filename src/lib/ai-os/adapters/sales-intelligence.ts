import { quoteSendEvidence } from './quote-context';
import { dueBucket } from '@/lib/sales/daily-work';
import { safeMailText } from './gmail-context';

export function documentedOutcome(lead: Record<string,unknown>|null) {
  const status=lead?.status ?? null;
  const reasons:Record<string,string>={price:'price',chose_competitor:'competitor',project_cancelled:'cancelled_or_postponed',no_response:'no_response'};
  return {lead_status:status, category:status==='lost' ? reasons[String(lead?.lost_reason)] ?? 'unknown_or_other' : status==='won' ? 'won' : 'not_closed',
    documented_reason:lead?.lost_reason ?? null, documented_note:safeMailText(typeof lead?.lost_note==='string'?lead.lost_note:null),
    cause_scope:'lead_not_individual_quote_version', price_error_proven:false};
}
export function discrepancyFacts(quote:Record<string,unknown>,lead:Record<string,unknown>|null,sends:Record<string,unknown>[],followups:Record<string,unknown>[],complete:boolean,now=new Date()) {
  const evidence=sends.filter(s=>quoteSendEvidence(s).verified_send_record);
  const reviews: {kind:string;source:{table:string;id:unknown}}[]=[];
  if(['sent','negotiation','accepted'].includes(String(quote.status)) && !evidence.length) reviews.push({kind:complete?'no_visible_send_evidence':'send_evidence_incomplete',source:{table:'quotes',id:quote.id}});
  for(const f of followups) if(f.completed===false && dueBucket(typeof f.due_date==='string'?f.due_date:null,now)==='overdue') reviews.push({kind:'overdue_open_followup',source:{table:'followups',id:f.id}});
  if(lead && (!lead.next_step_type || !lead.next_step_due_at) && !['won','lost'].includes(String(lead.status))) reviews.push({kind:'missing_next_step_not_proof_of_unhandled_request',source:{table:'leads',id:lead.id}});
  return {verified_send_sources:evidence.map(s=>({table:'quote_sends',id:s.id,thread_id:s.thread_id,sent_at:s.sent_at})), verified_discrepancies:[], review_required:reviews,
    email_checked:false,customer_reply_proven:false,limitations:['Hiányzó levél/küldési napló nem bizonyítja, hogy nem volt telefonos vagy személyes egyeztetés.','CRM-státusz és tényleges ügyfélválasz eltérése csak pontos jogosult és megfelelően szinkronizált levéltartalom alapján értelmezhető.']};
}
export function historicalPriceItem(row:Record<string,unknown>,q:Record<string,unknown>,lead:Record<string,unknown>|null) {
  const safe=(v:unknown)=>safeMailText(typeof v==='string'?v:null);
  const price=typeof row.unit_price==='number' && Number.isFinite(row.unit_price) ? row.unit_price : null;
  return {id:row.id,quote_id:q.id,name:safe(row.name),section:safe(row.section),unit:safe(row.unit),quantity:row.quantity ?? null,
    quoted_net_unit_price:price, zero_price_requires_review:price===0, material_unit_price:null,labour_unit_price:null,
    quote_date:q.created_at ?? null,project_id:q.project_id ?? null,project_name:safe((q.projects as Record<string,unknown>|null)?.title),
    version:q.version,group_id:q.group_id,alternative_key:q.alternative_key,is_current:q.is_current,quote_status:q.status,
    lead_outcome:documentedOutcome(lead),deal_key:q.lead_id ?? q.project_id ?? q.group_id ?? q.id,
    source:{table:'quote_items',id:row.id,quote_id:q.id},link:`/quotes/${q.id}`,price_basis:'stored_net_unit_price_before_quote_level_discount_not_cost_or_margin'};
}