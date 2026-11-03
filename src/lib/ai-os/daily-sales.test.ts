import { describe,it,expect,vi } from 'vitest';
import { dailyWork,type DailyLead } from '@/lib/sales/daily-work';
import { allDailyRows } from '@/lib/sales/load-daily-work';
import { dailySalesFocus,dailySalesCounts,dailySalesFingerprint,dailySalesPrompt } from './daily-sales';
const base:DailyLead={id:'new',assigned_to:'sales',status:'new',summary:'TESZT',source:'email_inbound',company_id:null,contact_id:null,created_at:'2026-11-03T10:00Z',next_step_type:null,next_step_due_at:null,pipeline_entered_at:null};
const now=new Date('2026-11-03T12:00Z');
describe('Timothy daily priorities',()=>{
 it('uses exact existing priority and caps at five distinct own cases',()=>{
  const rows=[base,{...base,id:'overdue',next_step_due_at:'2026-11-02T10:00Z'}, {...base,id:'today',next_step_due_at:'2026-11-03T15:00Z'},
   {...base,id:'waiting',status:'quote_sent'},{...base,id:'missing',created_at:'2026-10-01T10:00Z'},{...base,id:'sixth',created_at:'2026-10-01T10:00Z'}, {...base,id:'other',assigned_to:'other'}];
  const d=dailyWork(rows,[{id:'q',lead_id:'waiting',status:'sent',is_current:true,title:'TESZT'}],'sales',false,now);
  expect(dailySalesFocus(d).map(r=>r.lead.id)).toEqual(['overdue','today','new','waiting','missing']);
  expect(dailySalesCounts(d)).toEqual({overdue:1,today:1,tomorrow:0,later:0,missing:4,newLeads:1,waiting:1,incomplete:6});
 });
 it('uses Budapest day for cached source changes',async()=>{
   const row={...base,next_step_due_at:'2026-11-03T23:30Z'};
   const before=dailyWork([row],[],'sales',false,new Date('2026-11-03T22:59Z'));
   const after=dailyWork([row],[],'sales',false,new Date('2026-11-03T23:01Z'));
   expect(dailySalesCounts(before).tomorrow).toBe(1);expect(dailySalesCounts(after).today).toBe(1);
   expect(await dailySalesFingerprint(before)).not.toBe(await dailySalesFingerprint(after));
 });
 it('hash stays stable when rows reorder and changes when an assignment is removed',async()=>{
  const other={...base,id:'second'};
  const d=(rows:DailyLead[])=>dailyWork(rows,[],'sales',false,now);
  expect(await dailySalesFingerprint(d([base,other]))).toBe(await dailySalesFingerprint(d([other,base])));
  expect(await dailySalesFingerprint(d([base,other]))).not.toBe(await dailySalesFingerprint(d([base,{...other,assigned_to:'other'}])));
 });
 it('does not pass secrets in CRM text to the model',()=>{
  const d=dailyWork([{...base,company_name:'password=NEVER_SEND_THIS'}],[],'sales',false,now);
  expect(dailySalesPrompt(d)).not.toContain('NEVER_SEND_THIS');
 });
 it('fails closed on data errors instead of zero',async()=>{
  await expect(allDailyRows(async()=>({data:null,error:new Error('RLS failure')}))).rejects.toThrow('RLS failure');
  await expect(allDailyRows(async()=>({data:null,error:null}))).rejects.toThrow('A napi adatok nem érhetők el.');
 });
 it('reads past the default thousand-row limit',async()=>{
   const query=vi.fn(async(from:number)=>({data:from===0?Array.from({length:1000},(_,id)=>({id})):[{id:1000}],error:null}));
   expect(await allDailyRows(query)).toHaveLength(1001);expect(query.mock.calls.map(c=>c[0])).toEqual([0,1000]);
 });
});