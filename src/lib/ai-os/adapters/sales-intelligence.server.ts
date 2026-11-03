import { z } from 'zod';
import type { ToolContext } from '../types';
import { authorizeAgent } from '../approval.server';
import { registerTool } from '../tool-registry';
import { toolError } from '../tool-errors';
import { CRM_PAGE_PROPERTIES,crmReadPage,LEAD_CONTEXT_SELECT,readWindow } from './crm-read-page';
import { QUOTE_SELECT,quoteContext,quoteSendEvidence } from './quote-context';
import { documentedOutcome,discrepancyFacts,historicalPriceItem } from './sales-intelligence';
import { safeAudit } from '../approval';
import { safeMailText } from './gmail-context';
const contextInput=z.object({quote_id:z.string().uuid(),limit:z.number().int().min(1).max(100).default(10),offset:z.number().int().min(0).default(0)}).strict();
const searchInput=z.object({search:z.string().trim().min(2).max(200),unit:z.string().trim().min(1).max(30).optional(),limit:z.number().int().min(1).max(30).default(10),offset:z.number().int().min(0).default(0)}).strict();
async function access(ctx:ToolContext) {
  if(ctx.agentId!=='timothy')throw new Error('Csak Timothy olvasóeszköze.');
  const role=await authorizeAgent(ctx.supabaseUser,ctx.userId,'timothy');
  if(role!=='owner'&&role!=='sales')throw new Error('Nincs Sales elemzési jogosultság.');
}
async function quoteLead(q:Record<string,unknown>,ctx:ToolContext) {
  if(!q.lead_id)return null;
  const r=await ctx.supabaseUser.from('leads').select(LEAD_CONTEXT_SELECT).eq('id',String(q.lead_id)).maybeSingle();
  if(r.error)throw r.error;
  return r.data as Record<string,unknown>|null;
}
export async function readSalesCase(args:Record<string,unknown>,ctx:ToolContext) {
  const input=contextInput.parse(args);await access(ctx);
  const r=await ctx.supabaseUser.from('quotes').select(QUOTE_SELECT).eq('id',input.quote_id).maybeSingle();
  if(r.error)throw r.error;if(!r.data)throw new Error('Az ajánlat nem hozzáférhető.');
  const raw=r.data as Record<string,unknown>,lead=await quoteLead(raw,ctx),window=readWindow(input);
  const [s,f]=await Promise.all([
    ctx.supabaseUser.from('quote_sends').select('id,quote_id,status,sent_at,gmail_message_id,thread_id,email_id',{count:'exact'}).eq('quote_id',input.quote_id).order('created_at',{ascending:false}).order('id').range(window.offset,window.offset+window.limit-1),
    ctx.supabaseUser.from('followups').select('id,quote_id,lead_id,completed,due_date',{count:'exact'}).eq('quote_id',input.quote_id).order('created_at',{ascending:false}).order('id').range(window.offset,window.offset+window.limit-1),
  ]);
  if(s.error||f.error)throw new Error('Az ajánlati bizonyítékok olvasása sikertelen.');
  const sends=crmReadPage((s.data??[]).map(quoteSendEvidence),s.count,window,'quote_sends',5000),followups=crmReadPage(f.data??[],f.count,window,'followups',3500);
  const complete=sends.completeness.page_complete&&followups.completeness.page_complete;
  return {quote:quoteContext(raw),lead:lead?safeAudit(lead):null,lead_access:raw.lead_id&&!lead?'not_visible':'available_or_unlinked',outcome:documentedOutcome(lead),sends,followups,
    consistency:discrepancyFacts(raw,lead,sends.items,followups.items,complete),
    next_reads:{mailboxes:'crm_email_mailboxes',threads:'crm_list_company_email_threads',message:'crm_read_email_thread',history:'crm_lead_history'},
    limitations:['A lapozott ajánlati utánkövetések nem a teljes lead-aktivitás. Hiányzó/idegen lead nem pótolható admin olvasással.','Ez a kontextus nem olvasott levél. Levélválasz és eredmény oka a meglévő pontos Gmail-olvasóval ellenőrizendő.']};
}
export async function searchHistoricalPrices(args:Record<string,unknown>,ctx:ToolContext) {
  const input=searchInput.parse(args);await access(ctx);
  if(safeMailText(input.search).status!=='cached')throw new Error('A keresés nem tartalmazhat hozzáférési titkot.');
  const window=readWindow(input);
  let q=ctx.supabaseUser.from('quote_items').select('id,quote_id,name,section,quantity,unit,unit_price,created_at,quotes!inner(id,lead_id,project_id,created_at,status,version,is_current,group_id,alternative_key,quote_kind,projects(title))',{count:'exact'}).eq('quotes.quote_kind','viba_offer');
  for(const term of input.search.split(/\s+/).filter(Boolean))q=q.ilike('name',`%${term.replace(/[\\%_]/g,'\\$&')}%`);
  if(input.unit)q=q.eq('unit',input.unit);
  const r=await q.order('created_at',{ascending:false,nullsFirst:false}).order('id').range(window.offset,window.offset+window.limit-1);
  if(r.error)throw r.error;
  const items=[];
  for(const row of r.data??[]) {
    const parent=row.quotes as unknown as Record<string,unknown>|null;
    if(!parent || parent.id!==row.quote_id)throw new Error('Az ajánlati szülő nem ellenőrizhető.');
    const lead=await quoteLead(parent,ctx);
    items.push(historicalPriceItem(row,parent,lead));
  }
  return {...crmReadPage(items,r.count,window,'quote_items',13000),search:input.search,unit:input.unit??null,
    limitations:['Csak látható, saját VIBA-ajánlatok mentett tételsorai; nem teljes vállalati ártár.','Anyag- és munkadíj külön oszlop nem áll rendelkezésre. Műszaki paraméter csak a mentett névből/munkarészből, hasonlóság nem azonosság.','Nettó ajánlati egységár nem önköltség/fedezet és nem automatikus végleges árazás. Verzió/alternatíva nem külön megnyert munka.','Szerződött ár és konkrét nyertes ajánlatverzió nem állapítható meg pusztán a lead won státuszából.']};
}
export function registerSalesIntelligenceTools() {
  const common={domain:'crm.quotes',allowed_agents:['timothy'],allowed_roles:['owner','sales']};
  registerTool({...common,name:'crm_sales_case_review',description:'Kérésre Gmail–CRM egyeztetés és ajánlati eredményelemzés forráskontextusa: pontos quote, visible lead, lapozott sends/followups, dokumentált ok. Nem olvas levelet és nem módosít; a meglévő Gmail/history olvasókkal folytass.',parameters:{type:'object',additionalProperties:false,properties:{quote_id:{type:'string'},...CRM_PAGE_PROPERTIES},required:['quote_id']}},async(args,ctx)=>{try{return {ok:true,data:await readSalesCase(args,ctx)};}catch(e){return toolError.fromException(e);}});
  registerTool({...common,name:'crm_historical_unit_prices',description:'Hasonló munkák korábbi nettó VIBA-ajánlati egységárainak lapozott keresése. search névben AND kifejezések, unit pontos egység. Nem önköltség vagy automatikus árazás; verziók/alternatívák nem külön nyertes munkák.',parameters:{type:'object',additionalProperties:false,properties:{search:{type:'string'},unit:{type:'string'},...CRM_PAGE_PROPERTIES,limit:{type:'integer',minimum:1,maximum:30,default:10}},required:['search']}},async(args,ctx)=>{try{return {ok:true,data:await searchHistoricalPrices(args,ctx)};}catch(e){return toolError.fromException(e);}});
}