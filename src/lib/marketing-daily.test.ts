import {it,expect} from 'vitest';
import {loadMarketingDaily} from './marketing-daily';
function client(){const tables:Record<string,any[]>={companies:[{id:'campaign',name:'TESZT kampány',notes:'[MKT:new]'},{id:'other',name:'TESZT másik',notes:null}],contacts:[],emails:[],followups:[{id:'done',assigned_to:'user',completed:true,company_id:'campaign'},{id:'open',assigned_to:'user',completed:false,company_id:'campaign',due_date:'2026-11-06T08:00:00Z'},{id:'other-user',assigned_to:'other',completed:false,company_id:'campaign'}],phone_calls:[{id:'callback',company_id:'campaign',outcome:'callback',callback_date:'2026-11-06T10:00:00Z'}]};
 return {from:(table:string)=>{const filters:[string,unknown][]=[];const q={select:()=>q,order:()=>q,limit:()=>q,not:()=>q,eq:(k:string,v:unknown)=>{filters.push([k,v]);return q;},then:(resolve:any)=>Promise.resolve({data:(tables[table]??[]).filter(r=>filters.every(([k,v])=>r[k]===v)),error:null}).then(resolve)};return q;}} as any;}
it('marketing daily excludes noncampaign companies and completed/other-user followups',async()=>{const data=await loadMarketingDaily(client(),'user',new Date('2026-11-06T09:00:00Z'));expect(data.to_contact.map(c=>c.id)).toEqual(['campaign']);expect(data.followups.map(f=>f.id)).toEqual(['open']);expect(data.followups[0]?.overdue).toBe(true);expect(data.callbacks[0]?.id).toBe('callback');});
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