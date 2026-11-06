import {it,expect} from 'vitest';
import {loadMarketingDaily,marketingDayBucket} from './marketing-daily';
function client(){const tables:Record<string,any[]>={companies:[{id:'campaign',name:'TESZT kampány',notes:'[MKT:new]'},{id:'other',name:'TESZT másik',notes:null}],contacts:[],emails:[],followups:[{id:'done',assigned_to:'user',completed:true,company_id:'campaign'},{id:'open',assigned_to:'user',completed:false,company_id:'campaign',due_date:'2026-11-06T08:00:00Z'},{id:'other-user',assigned_to:'other',completed:false,company_id:'campaign'}],phone_calls:[{id:'callback',company_id:'campaign',outcome:'callback',callback_date:'2026-11-06T10:00:00Z'}]};
 return {from:(table:string)=>{const filters:[string,unknown][]=[];const q={select:()=>q,order:()=>q,limit:()=>q,not:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},then:(resolve:any)=>Promise.resolve({data:(tables[table]??[]).filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}).then(resolve)};return q;}} as any;}
it('marketing daily excludes noncampaign companies and completed/other-user followups',async()=>{const data=await loadMarketingDaily(client(),'user',new Date('2026-11-06T09:00:00Z'));expect(data.to_contact.map(c=>c.id)).toEqual(['campaign']);expect(data.followups.map(f=>f.id)).toEqual(['open']);expect(data.followups[0]?.overdue).toBe(false);expect(data.followups[0]?.bucket).toBe('today');expect(data.callbacks[0]?.id).toBe('callback');});
it('daily buckets use Budapest dates, including midnight and invalid/undated rows',()=>{
 const now=new Date('2026-11-06T09:00:00Z');
 expect(marketingDayBucket('2026-11-05T22:59:59Z',now)).toBe('overdue');
 expect(marketingDayBucket('2026-11-05T23:00:00Z',now)).toBe('today');
 expect(marketingDayBucket('2026-11-06T22:59:59Z',now)).toBe('today');
 expect(marketingDayBucket('2026-11-06T23:00:00Z',now)).toBe('upcoming');
 expect(marketingDayBucket(null,now)).toBe('undated');expect(marketingDayBucket('invalid',now)).toBe('undated');
});
it('own daily tasks use profile UUID, omit completed, other owner and project tasks; completion reads back absent',async()=>{
 const rows=[{id:'own',title:'TESZT',assigned_user:'profile',project_id:null,status:'open',due_date:null},{id:'done',assigned_user:'profile',project_id:null,status:'done'},{id:'other',assigned_user:'other',project_id:null,status:'open'},{id:'project',assigned_user:'profile',project_id:'p',status:'open'}];
 const sb=client(),from=sb.from;
 sb.from=(table:string)=>{if(table==='users_profile'){const q:any={select:()=>q,eq:()=>q,limit:()=>q,then:(fn:any)=>Promise.resolve({data:[{id:'profile'}],error:null}).then(fn)};return q;}if(table!=='tasks')return from(table);
 const filters:((r:any)=>boolean)[]=[];const q:any={select:()=>q,order:()=>q,limit:()=>q,eq:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},is:(k:string,v:any)=>{filters.push(r=>r[k]===v);return q;},neq:(k:string,v:any)=>{filters.push(r=>r[k]!==v);return q;},then:(fn:any)=>Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r))),error:null}).then(fn)};return q;};
 const first=await loadMarketingDaily(sb,'user');expect(first.tasks.map(t=>t.id)).toEqual(['own']);expect(first.tasks[0]?.bucket).toBe('undated');
 rows[0].status='done';expect((await loadMarketingDaily(sb,'user')).tasks).toEqual([]);
});
function contactFixture(contact: Record<string, unknown>, blocked = false) {
  const sb = client(); const from = sb.from;
  sb.from = (table: string) => {
    if (table !== 'contacts' && table !== 'marketing_email_suppressions') return from(table);
    const q: any = { select: () => q, order: () => q, limit: () => q, eq: () => q, then: (resolve: any) => Promise.resolve({data: table === 'contacts' ? [contact] : blocked ? [{email_norm:'blocked@example.invalid',blocked:true}] : [],error:null}).then(resolve) }; return q;
  }; return sb;
}
it('blocked email is explicit and does not authorize email contact', async () => {
  const out = await loadMarketingDaily(contactFixture({company_id:'campaign',email:'Blocked@example.invalid',phone:null},true),'user');
  expect(out.to_contact[0]?.contact_state).toMatchObject({blocked_email:true,email_available:false,email_send_permission:false});
  expect(out.missing_contacts.map(c=>c.id)).toEqual(['campaign']);
});
it('email suppression does not forbid the separately saved phone', async () => {
  const out = await loadMarketingDaily(contactFixture({company_id:'campaign',email:'blocked@example.invalid',phone:'TESZT-phone'},true),'user');
  expect(out.to_contact[0]?.contact_state.phone_available).toBe(true); expect(out.missing_contacts).toEqual([]);
});
it('invalid only email is not a usable contact and callbacks retain shared scope', async () => {
  const out = await loadMarketingDaily(contactFixture({company_id:'campaign',email:'invalid@example.invalid',email_invalid:true}),'user');
  expect(out.to_contact[0]?.contact_state.email_available).toBe(false);expect(out.contact_warnings[0]?.contact_state.invalid_email).toBe(true);
  expect(out.callbacks[0]?.visibility_scope).toBe('shared_visible_not_own');
});
it('a failed daily source is an error, not an empty successful workday',async()=>{
 const sb=client(),from=sb.from;
 sb.from=(table:string)=>{if(table!=='followups')return from(table);const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,then:(fn:any)=>Promise.resolve({data:null,error:new Error('TESZT read failure')}).then(fn)};return q;};
 await expect(loadMarketingDaily(sb,'user')).rejects.toThrow('TESZT read failure');
});