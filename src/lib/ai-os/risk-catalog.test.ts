import {describe,it,expect} from 'vitest';
import catalog from '../../../docs/qa/timothy-risk-catalog.json';
import {validateReadIds} from './read-quality';
import {quoteContext} from './adapters/quote-context';
import {crmRecordFacts,budapestTimestamp} from './adapters/crm-read-page';
import {toolsForAgent} from './tool-registry';
import {AGENTS} from './agents';
import {registerCrmTools} from './adapters/crm-tools.server';
registerCrmTools();
describe('Frozen deterministic subset of the risk catalog',()=>{
 for(const row of catalog.filter(r=>r.mode==='deterministic'))it(row.id,()=>{
  const input=row.input as Record<string,unknown>;const expected=row.expected as Record<string,unknown>;
  if(row.category==='identity'){
   let accepted=true;try{validateReadIds(input);}catch{accepted=false;}
   expect(accepted).toBe(expected.accepted);
  }else if(row.category==='quotes'){
   const result=quoteContext(input);expect(result.active).toBe(expected.active);expect(result.net).toBe(expected.net);
  }else if(row.category==='tasks'){
   const result=crmRecordFacts(input,'followups',new Date('2026-11-03T18:00:00Z'));
   expect(result.action_required).toBe(expected.action_required);expect(result.work_state).toBe(expected.work_state);
   const hour=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Budapest',hour:'2-digit',hourCycle:'h23'}).format(new Date(String(input.due_date)));
   expect(Number(hour)).toBe(expected.local_hour);expect(budapestTimestamp(input.due_date)).not.toBeNull();
  }else if(row.category==='security'){
   const agent=AGENTS[String(input.agent)];if(!agent)throw new Error('Unknown fixture agent');
   const tools=toolsForAgent({agentId:agent.id,agentDomains:agent.tool_domains,userRole:input.role as string|null});
   expect(tools.some(t=>t.name==='sales_reassign_lead')).toBe(expected.reassign);
  }
 });
});