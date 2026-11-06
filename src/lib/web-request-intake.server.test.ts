import {it,expect} from 'vitest';
import {verifyIntakeResult} from './web-request-intake.server';
const company='11111111-1111-4111-8111-111111111111',contact='22222222-2222-4222-8222-222222222222',user='33333333-3333-4333-8333-333333333333';
function client(visible=true,audit=true){return {from:(table:string)=>{const q:any={select:()=>q,eq:()=>q,limit:()=>q,maybeSingle:()=>q,then:(resolve:any)=>Promise.resolve({data:!visible?null:table==='activities'?(audit?[{id:'TESZT-audit'}]:[]):{id:table==='contacts'?contact:company,company_id:company},error:null}).then(resolve)};return q;}} as any;}
const receipt={kind:'saved',company_id:company,contact_id:contact,by:user,at:'2026-11-06T16:00:00Z'};
it('verified saved receipt requires user-visible company/contact and audit',async()=>expect(await verifyIntakeResult(receipt,client(),'TESZT-request')).toEqual({kind:'saved',companyId:company,contactId:contact}));
it('missing user-RLS result never reports verified success',async()=>expect((await verifyIntakeResult(receipt,client(false),'TESZT-request')).kind).toBe('uncertain'));
it('missing mandatory audit never reports verified success',async()=>expect((await verifyIntakeResult(receipt,client(true,false),'TESZT-request')).kind).toBe('uncertain'));
it('incomplete durable receipt never reports verified success',async()=>expect((await verifyIntakeResult({...receipt,contact_id:null},client(),'TESZT-request')).kind).toBe('uncertain'));