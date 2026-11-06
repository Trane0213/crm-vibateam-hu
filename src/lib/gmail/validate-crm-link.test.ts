import {it,expect} from 'vitest';
import {validateCrmLink} from './validate-crm-link';
const company='00000000-0000-4000-8000-000000000001',contact='00000000-0000-4000-8000-000000000002';
function client(contactCompany=company){return {from:(table:string)=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:table==='contacts'?{id:contact,company_id:contactCompany}:{id:company},error:null})};return q;}} as any;}
it('derives visible company from selected contact',async()=>expect((await validateCrmLink(client(),{contact_id:contact})).company_id).toBe(company));
it('rejects conflicting company before sending or writing',async()=>expect(validateCrmLink(client('00000000-0000-4000-8000-000000000003'),{company_id:company,contact_id:contact})).rejects.toThrow('másik cég'));
it('rejects unobservable CRM data',async()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null,error:null})};await expect(validateCrmLink({from:()=>q} as any,{company_id:company})).rejects.toThrow('nem olvasható');});