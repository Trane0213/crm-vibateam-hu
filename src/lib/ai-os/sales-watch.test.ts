import { describe, it, expect } from 'vitest';
import { salesWatchSignals, type WatchMessage, type WatchQuote, type WatchSend } from './sales-watch';
import type { DailyLead } from '@/lib/sales/daily-work';
const now = new Date('2026-11-03T12:00:00Z');
const lead: DailyLead = { id:'TESZT-lead',assigned_to:'sales',status:'quote_sent',summary:'TESZT',source:null,company_id:'TESZT-company',contact_id:'TESZT-contact',created_at:null,next_step_type:'phone',next_step_due_at:'2026-11-05T12:00:00Z',pipeline_entered_at:'2026-11-01T12:00:00Z' };
const sent: WatchMessage = { id:'TESZT-sent',thread_id:'TESZT-thread',internal_date:'2026-11-02T12:00:00Z',gmail_message_id:'gmail-sent',direction:'sent' };
const reply: WatchMessage = { id:'TESZT-reply',thread_id:'TESZT-thread',internal_date:'2026-11-03T10:00:00Z',gmail_message_id:'gmail-reply',direction:'customer_inbound' };
const quote: WatchQuote = { id:'TESZT-quote',lead_id:lead.id,title:'TESZT',status:'sent',is_current:true,valid_until:'2026-11-10' };
const proof: WatchSend = {quote_id:quote.id,gmail_message_id:'gmail-sent',thread_id:'TESZT-thread',status:'sent',sent_at:sent.internal_date};
function run(messages: WatchMessage[] = [reply,sent], opts: { complete?: boolean; leads?: DailyLead[]; quotes?: WatchQuote[]; sends?: WatchSend[]; companyId?:string } = {}) {
 return salesWatchSignals(opts.leads ?? [lead], opts.quotes ?? [], [], [{id:'TESZT-thread',lead_id:lead.id,company_id:opts.companyId ?? 'TESZT-company',complete:opts.complete ?? true,messages}], opts.sends ?? [], now);
}
describe('Timothy P4 deterministic TESZT signals',()=>{
 it('detects exact cached customer reply after sent message once per source',()=>{
   expect(run().map(s=>[s.kind,s.sourceId])).toEqual([['reply','TESZT-reply']]);
   const t={id:'TESZT-thread',lead_id:lead.id,company_id:'TESZT-company',complete:true,messages:[reply,sent]};
   expect(salesWatchSignals([lead],[],[],[t,t],[],now)).toHaveLength(1);
 });
 it('withholds unanswered claims after newer outbound or unknown/automated message',()=>{
   expect(run([{...sent,id:'new',internal_date:'2026-11-03T11:00:00Z'},reply,sent])).toEqual([]);
   expect(run([{...reply,id:'auto',direction:'unknown_or_automated',internal_date:'2026-11-03T11:00:00Z'},reply,sent])).toEqual([]);
 });
 it('requires exact company, complete thread, open lead and prior sent evidence',()=>{
   expect(run([reply])).toEqual([]);
   expect(run(undefined,{complete:false})).toEqual([]);
   expect(run(undefined,{companyId:'other'})).toEqual([]);
   expect(run(undefined,{leads:[{...lead,status:'won'}]})).toEqual([]);
   expect(run([{...reply,direction:'unverified_sender'},sent])).toEqual([]);
 });
 it('ties quote feedback candidate only to exact quote_sends Gmail ID in that thread',()=>{
   expect(run(undefined,{quotes:[quote]}).map(s=>s.kind)).toEqual(['reply']);
   expect(run(undefined,{quotes:[quote],sends:[{...proof,gmail_message_id:'wrong'}]}).map(s=>s.kind)).toEqual(['reply']);
   expect(run(undefined,{quotes:[quote],sends:[proof]}).map(s=>[s.kind,s.quoteId])).toEqual([['quote_reply',quote.id]]);
   expect(run(undefined,{quotes:[{...quote,status:'draft'}],sends:[proof]}).map(s=>s.kind)).toEqual(['reply']);
   expect(run(undefined,{quotes:[quote],sends:[{...proof,status:'failed'}]}).map(s=>s.kind)).toEqual(['reply']);
   expect(run(undefined,{quotes:[quote],sends:[{...proof,thread_id:'other'}]}).map(s=>s.kind)).toEqual(['reply']);
 });
 it('withholds ambiguous equal timestamps and future/missing timestamps',()=>{
   expect(run([reply,{...sent,internal_date:reply.internal_date}])).toEqual([]);
   expect(run([{...reply,internal_date:null},sent])).toEqual([]);
   expect(run([{...reply,internal_date:'2027-01-01T10:00:00Z'},sent])).toEqual([]);
 });
 it('reuses Budapest overdue rule and only open incomplete followups',()=>{
   const f={id:'TESZT-followup',lead_id:lead.id,completed:false,due_date:'2026-11-02T22:59:00Z'};
   expect(salesWatchSignals([lead],[],[f,{...f,id:'done',completed:true},{...f,id:'today',due_date:'2026-11-02T23:00:00Z'}],[],[],now).map(s=>s.sourceId)).toEqual(['TESZT-followup']);
 });
 it('detects missing/overdue next-step without inventing age threshold',()=>{
   expect(run([],{leads:[{...lead,next_step_type:null}]}).map(s=>s.kind)).toEqual(['stalled']);
   expect(run([],{leads:[{...lead,next_step_due_at:'2026-11-01T10:00:00Z'}]}).map(s=>s.kind)).toEqual(['stalled']);
 });
 it('surfaces current sent quote expiry through tomorrow, not draft/old/future',()=>{
   const qs=[{...quote,valid_until:'2026-11-04'}, {...quote,id:'future',valid_until:'2026-11-05'}, {...quote,id:'draft',status:'draft',valid_until:'2026-11-03'}, {...quote,id:'old',is_current:false,valid_until:'2026-11-03'}];
   expect(run([],{quotes:qs}).map(s=>s.quoteId)).toEqual([quote.id]);
 });
});