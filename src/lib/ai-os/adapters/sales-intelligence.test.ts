import { describe,it,expect,beforeEach,vi } from 'vitest';
import { documentedOutcome,discrepancyFacts,historicalPriceItem } from './sales-intelligence';
import type { ToolContext } from '../types';
const auth=vi.hoisted(()=>vi.fn());
vi.mock('../approval.server',()=>({authorizeAgent:auth}));
import { readSalesCase,searchHistoricalPrices,registerSalesIntelligenceTools } from './sales-intelligence.server';
import { getTool,toolsForAgent } from '../tool-registry';
const id='11111111-1111-4111-8111-111111111111';
const quote={id,lead_id:'lead',project_id:'project',quote_kind:'viba_offer',group_id:'group',version:2,alternative_key:'A',status:'sent',created_at:'2026-11-01T10:00:00Z',projects:{title:'TESZT projekt'}};
const lead={id:'lead',status:'lost',lost_reason:'other',lost_note:'A generálkivitelező elvesztette a főpályázatot.'};
type Row=Record<string,unknown>;
function fixture(tables:Record<string,Row[]>,fail?:string) {
 const calls:{table:string;filters:[string,unknown][];columns:string}[]=[];
 const sb={from(table:string){
  const c={table,filters:[] as [string,unknown][],columns:''};calls.push(c);let start=0,end=999,single=false;
  const q={select(columns:string){c.columns=columns;return q;},eq(k:string,v:unknown){c.filters.push([k,v]);return q;},ilike(k:string,v:string){c.filters.push([`like:${k}`,v]);return q;},order(){return q;},range(a:number,b:number){start=a;end=b;return q;},maybeSingle(){single=true;return q;},then(resolve:(v:unknown)=>unknown){
   const rows=(tables[table]??[]).filter(r=>c.filters.every(([k,v])=>k.startsWith('like:') || (k==='quotes.quote_kind'?(r.quotes as Row)?.quote_kind===v:r[k]===v)));
   return Promise.resolve(resolve({data:fail===table?null:single?rows[0]??null:rows.slice(start,end+1),count:rows.length,error:fail===table?new Error('TESZT error'):null}));
  }};return q;
 }};
 return {calls,ctx:{supabaseUser:sb,supabaseAdmin:new Proxy({}, {get(){throw new Error('Admin forbidden');}}),userId:'own',agentId:'timothy'} as unknown as ToolContext};
}
beforeEach(()=>{vi.clearAllMocks();auth.mockResolvedValue('sales');registerSalesIntelligenceTools();});
describe('V3.1 source-faithful rules',()=>{
 it.each([['price','price'],['chose_competitor','competitor'],['project_cancelled','cancelled_or_postponed'],['no_response','no_response'],['other','unknown_or_other']])('preserves documented %s as %s without invented price error',(reason,category)=>{
  expect(documentedOutcome({...lead,lost_reason:reason})).toMatchObject({category,price_error_proven:false,cause_scope:'lead_not_individual_quote_version'});
 });
 it('does not turn general contractor tender loss into a VIBA price problem',()=>{
  const out=documentedOutcome(lead);expect(out.category).toBe('unknown_or_other');expect(out.price_error_proven).toBe(false);expect(out.documented_note.text).toContain('főpályázat');
 });
 it('missing send evidence/next step is review, never proof of missing customer response',()=>{
  const out=discrepancyFacts(quote,{id:'lead',status:'quote_sent'},[],[],false);
  expect(out.verified_discrepancies).toEqual([]);expect(out.review_required.map(r=>r.kind)).toEqual(['send_evidence_incomplete','missing_next_step_not_proof_of_unhandled_request']);expect(out.email_checked).toBe(false);
 });
 it('reuses successful send proof and Budapest followup rule',()=>{
  const out=discrepancyFacts(quote,lead,[{id:'send',status:'recorded',gmail_message_id:'m',sent_at:'2026-11-02'}],[{id:'old',completed:false,due_date:'2026-11-02T22:59Z'},{id:'today',completed:false,due_date:'2026-11-02T23:00Z'},{id:'done',completed:true,due_date:'2026-11-01'}],true,new Date('2026-11-03T12:00Z'));
  expect(out.verified_send_sources[0]?.id).toBe('send');expect(out.review_required.map(r=>r.source.id)).toEqual(['old']);
 });
 it('returns stored net unit price not total/cost or fabricated material/labour split',()=>{
  const row={id:'item',name:'300 mm kábeltálca-szerelés',unit:'m',unit_price:4500,total_price:90000};
  const out=historicalPriceItem(row,quote,{...lead,status:'won'});
  expect(out.quoted_net_unit_price).toBe(4500);expect(out.material_unit_price).toBeNull();expect(out.labour_unit_price).toBeNull();expect(out.version).toBe(2);expect(out.deal_key).toBe('lead');
  expect(historicalPriceItem(row,{...quote,version:3,alternative_key:'B'},lead).deal_key).toBe(out.deal_key);
 });
 it('withholds secrets and does not replace missing price with zero',()=>{
  const out=historicalPriceItem({id:'i',name:'password=NEVER',unit_price:null},quote,{...lead,lost_note:'api_key=NEVER'});
  expect(JSON.stringify(out)).not.toContain('NEVER');expect(out.quoted_net_unit_price).toBeNull();
 });
});
describe('V3.1 user-RLS read flows',()=>{
 it.each(['marketing','pm',null])('rejects %s before business reads',async role=>{
  auth.mockResolvedValue(role);const f=fixture({});await expect(readSalesCase({quote_id:id},f.ctx)).rejects.toThrow('jogosultság');expect(f.calls).toEqual([]);
 });
 it('checks parent access before history/children',async()=>{
  const f=fixture({quote_sends:[{id:'secret'}]});await expect(readSalesCase({quote_id:id},f.ctx)).rejects.toThrow('hozzáférhető');expect(f.calls.map(c=>c.table)).toEqual(['quotes']);
 });
 it('reads exact quote child scope and leaves hidden lead unknown',async()=>{
  const f=fixture({quotes:[quote],leads:[],quote_sends:[{id:'s',quote_id:id,status:'sent',sent_at:'2026-11-02',gmail_message_id:'m'},{id:'foreign',quote_id:'other'}],followups:[]});
  const out=await readSalesCase({quote_id:id},f.ctx);expect(out.lead_access).toBe('not_visible');expect(out.sends.items.map(r=>r.id)).toEqual(['s']);expect(out.consistency.email_checked).toBe(false);
 });
 it('searches VIBA-only bounded items, escapes wildcards and preserves versions',async()=>{
  const rows=Array.from({length:4},(_,i)=>({id:`i${i}`,quote_id:id,name:'TESZT',unit:'m',unit_price:4500,quotes:quote}));
  const f=fixture({quote_items:rows,leads:[lead]});const out=await searchHistoricalPrices({search:'300 %_',unit:'m',limit:2},f.ctx);
  expect(out.items).toHaveLength(2);expect(out.pagination.next_offset).toBe(2);expect(out.pagination.total_visible).toBe(4);
  expect(f.calls[0]?.filters).toContainEqual(['quotes.quote_kind','viba_offer']);expect(f.calls[0]?.filters).toContainEqual(['like:name','%\\%\\_%']);expect(f.calls[0]?.columns).toContain('quotes!inner');
 });
 it('errors are not fake empty success and sensitive searches are rejected',async()=>{
  const f=fixture({},'quote_items');await expect(searchHistoricalPrices({search:'300 tálca'},f.ctx)).rejects.toThrow('TESZT error');
  const secret=fixture({});await expect(searchHistoricalPrices({search:'password=NEVER'},secret.ctx)).rejects.toThrow('titkot');expect(secret.calls).toEqual([]);
 });
 it('both new tools are read-only Timothy owner/sales only',()=>{
  for(const name of ['crm_sales_case_review','crm_historical_unit_prices']){
   expect(getTool(name)?.needs_approval).toBeUndefined();
   for(const role of ['marketing','pm',null])expect(toolsForAgent({agentId:'timothy',agentDomains:['crm.quotes'],userRole:role}).some(t=>t.name===name)).toBe(false);
  }
 });
});