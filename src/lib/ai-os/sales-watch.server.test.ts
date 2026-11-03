import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
const mocks=vi.hoisted(()=>({role:vi.fn(),daily:vi.fn()}));
vi.mock('./approval.server',()=>({authorizeAgent:mocks.role}));
vi.mock('@/lib/sales/load-daily-work',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/sales/load-daily-work')>(),loadDailyWork:mocks.daily}));
import { loadSalesWatch } from './sales-watch.server';
const lead={id:'TESZT-lead',company_id:'TESZT-company',assigned_to:'own',status:'quote_sent',next_step_type:'phone',next_step_due_at:'2026-11-05T12:00:00Z'};
const own={userId:'own',email:'test@example.com',active:true,authError:false,lastSync:'2026-11-03T10:00:00Z'};
function client(accounts:unknown[]= [own], failTable?:string) {
 const calls:{table:string;filters:[string,unknown][];select:string}[]=[];
 const from=vi.fn((table:string)=>{
  const entry={table,filters:[] as [string,unknown][],select:''};calls.push(entry);
  const q:Record<string,unknown>={};
  for(const op of ['eq','in','order','limit','range']) q[op]=(...args:unknown[])=>{entry.filters.push([op,args]);return q;};
  q.select=(s:string)=>{entry.select=s;return q;};
  q.then=(resolve:(v:unknown)=>unknown)=>{
   let rows:unknown[]=[];
   if(table==='email_threads')rows=[{id:'TESZT-thread',lead_id:lead.id,company_id:lead.company_id,last_message_at:'2026-11-03T10:00:00Z'}];
   if(table==='contacts')rows=[{email:'customer@example.com'}];
   if(table==='emails')rows=[{id:'TESZT-reply',thread_id:'TESZT-thread',company_id:lead.company_id,lead_id:lead.id,from_email:'customer@example.com',gmail_label_ids:['INBOX'],internal_date:'2026-11-03T10:00:00Z'}, {id:'TESZT-sent',thread_id:'TESZT-thread',company_id:lead.company_id,lead_id:lead.id,from_email:own.email,gmail_label_ids:['SENT'],internal_date:'2026-11-02T10:00:00Z'}];
   return Promise.resolve(resolve({data:failTable===table?null:rows,error:failTable===table?new Error('denied'):null}));
  };return q;
 });
 return {sb:{from,rpc:vi.fn(async()=>({data:accounts,error:null}))} as unknown as SupabaseClient,calls,from};
}
beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue('sales');mocks.daily.mockResolvedValue({leads:[lead]});});
describe('P4 authenticated metadata boundaries',()=>{
 it.each(['marketing','pm',null])('rejects %s before daily or mailbox read',async(role)=>{
  mocks.role.mockResolvedValue(role);const c=client();
  await expect(loadSalesWatch(c.sb,'own')).rejects.toThrow('nincs jogosultság');
  expect(mocks.daily).not.toHaveBeenCalled();expect(c.from).not.toHaveBeenCalled();
 });
 it.each(['sales','owner'])('keeps %s own-only and uses exact own message owner',async()=>{
  const c=client();const res=await loadSalesWatch(c.sb,'own',new Date('2026-11-03T12:00:00Z'));
  expect(mocks.daily).toHaveBeenCalledWith(c.sb,'own',false,new Date('2026-11-03T12:00:00Z'));
  expect(res.signals[0]?.sourceId).toBe('TESZT-reply');
  const reads=c.calls.filter(c=>c.table==='emails');
  expect(reads[0]?.filters).toContainEqual(['eq',['owner_user_id','own']]);
  expect(reads[0]?.filters).toContainEqual(['eq',['thread_id','TESZT-thread']]);
  expect(reads[0]?.select.split(',')).not.toContain('body');
  expect(reads[0]?.select.split(',')).not.toContain('snippet');
  expect(JSON.stringify(res)).not.toContain('customer@example.com');
 });
 it('never falls back to colleague or disabled mailbox',async()=>{
  const c=client([{...own,userId:'other'},{...own,active:false}]);
  const res=await loadSalesWatch(c.sb,'own');expect(res.sync).toBeNull();
  expect(c.calls.some(c=>c.table==='emails')).toBe(false);
 });
 it('fails closed on metadata query error, never returns fake zero',async()=>{
  const c=client([own],'emails');await expect(loadSalesWatch(c.sb,'own')).rejects.toThrow('nem ellenőrizhető');
 });
});