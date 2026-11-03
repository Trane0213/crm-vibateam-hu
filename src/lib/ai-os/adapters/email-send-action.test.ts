import {describe,it,expect,vi,beforeEach} from 'vitest';
import {executeEmailSend,freezeEmailSend,registerEmailSendTool} from './email-send-action.server';
import {emailSendAction} from '../email-send-action';
import {getTool,toolsForAgent} from '../tool-registry';
import type {ToolContext} from '../types';
const mocks=vi.hoisted(()=>({send:vi.fn(),profile:vi.fn(),message:vi.fn()}));
vi.mock('@/lib/gmail/send.server',()=>({handleGmailSend:mocks.send}));
vi.mock('@/lib/gmail/gmail-api.server',()=>({getProfile:mocks.profile,getMessage:mocks.message}));
const id='11111111-1111-4111-8111-111111111111',gid='gmail-test';
const input={leadId:id,mailbox:'test@example.com',to:['customer@example.com'],subject:'TESZT',body:'Teljes TESZT levél.'};
const lead={id,summary:'TESZT ügy',company_id:id,contact_id:null,assigned_to:id,status:'new'};
const fixture=emailSendAction.parse({message:input,context:{lead,company:{id,name:'TESZT cég'},contact:null,quote:null,thread:null},attachments:[]});
let role='sales',own=true,proof=true;
const rpc=vi.fn();
function client(){return {auth:{getUser:async()=>({data:{user:{id}}})},rpc,from:(table:string)=>{
 const rows:Record<string,unknown>={users_profile:{active:true,gmail_email:own?input.mailbox:'other@example.com',roles:{name:role}},leads:{...lead,assigned_to:own?id:'22222222-2222-4222-8222-222222222222'},companies:fixture.context.company,
 emails:{id,thread_id:id,owner_user_id:id,lead_id:id,company_id:id,contact_id:null,project_id:null,from_email:input.mailbox,gmail_message_id:gid,to_emails:input.to,cc_emails:[],bcc_emails:[],subject:input.subject,body:proof?input.body:'changed'},email_threads:{company_id:id,lead_id:id}};
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:rows[table]??null,error:null}),then:(resolve:any)=>Promise.resolve({data:table==='email_attachments'?[]:rows[table],error:null}).then(resolve)};return q;
}};}
function ctx():ToolContext {const sb=client() as any;return {userId:id,agentId:'timothy',runId:id,threadId:null,approvalActionId:id,accessToken:'synthetic-test-only',supabaseUser:sb,supabaseAdmin:sb};}
beforeEach(()=>{vi.clearAllMocks();role='sales';own=true;proof=true;rpc.mockResolvedValue({data:true,error:null});mocks.profile.mockResolvedValue({emailAddress:input.mailbox});mocks.message.mockResolvedValue({id:gid,threadId:gid,labelIds:['SENT'],internalDate:'1793725200000'});});
describe('approved shared Gmail send',()=>{
 it('requires durable action and authentication before transport',async()=>{await expect(executeEmailSend(fixture,{...ctx(),approvalActionId:undefined})).rejects.toThrow();expect(mocks.send).not.toHaveBeenCalled();});
 it.each(['marketing','project_manager'])('blocks %s before transport',async r=>{role=r;await expect(freezeEmailSend(ctx().supabaseUser,input)).rejects.toThrow();expect(mocks.send).not.toHaveBeenCalled();});
 it('blocks foreign sender/assigned lead',async()=>{own=false;await expect(executeEmailSend(fixture,ctx())).rejects.toThrow();expect(mocks.send).not.toHaveBeenCalled();});
 it('rejects stale context before transport',async()=>{await expect(executeEmailSend({...fixture,context:{...fixture.context,company:{id,name:'changed'}}},ctx())).rejects.toThrow();});
 it('does not dispatch when transport validation fails',async()=>{mocks.send.mockResolvedValue(Response.json({error:'rejected'},{status:403}));expect((await executeEmailSend(fixture,ctx())).ok).toBe(false);expect(rpc).not.toHaveBeenCalled();});
 it('blocks duplicate dispatch claim',async()=>{rpc.mockResolvedValue({data:false,error:null});mocks.send.mockImplementation(async (_r,h)=>{try{await h.beforeSend([]);}catch{return Response.json({error:'blocked'},{status:409});}});expect((await executeEmailSend(fixture,ctx())).ok).toBe(false);});
 it('preserves unknown outcome after dispatch',async()=>{mocks.send.mockImplementation(async (_r,h)=>{await h.beforeSend([]);return Response.json({ok:true,id:gid,threadId:gid,warning:'incomplete'});});const out=await executeEmailSend(fixture,ctx());expect(out).toMatchObject({ok:true,data:{gmail_message_id:gid,verified_sent:false,proof_saved:false}});expect(rpc).toHaveBeenCalledTimes(1);});
 it('requires exact saved content and retains verified Gmail ID on partial proof',async()=>{proof=false;mocks.send.mockImplementation(async (_r,h)=>{await h.beforeSend([]);await h.verifySent('synthetic',{id:gid,threadId:gid});return Response.json({ok:true,id:gid,threadId:gid});});expect(await executeEmailSend(fixture,ctx())).toMatchObject({ok:true,data:{gmail_message_id:gid,verified_sent:true,proof_saved:false}});});
 it('returns success only after live Gmail and exact CRM readback',async()=>{mocks.send.mockImplementation(async (_r,h)=>{await h.beforeSend([]);await h.verifySent('synthetic',{id:gid,threadId:gid});return Response.json({ok:true,id:gid,threadId:gid});});expect(await executeEmailSend(fixture,ctx())).toMatchObject({ok:true,data:{gmail_message_id:gid,email_id:id,lead_id:id,verified_sent:true,proof_saved:true}});});
 it('registers only Timothy owner/Sales with dangerous P0 and no dry-run bypass',()=>{registerEmailSendTool();expect(getTool('sales_send_email')).toMatchObject({approval:'dangerous',supports_dry_run:false,allowed_agents:['timothy']});expect(toolsForAgent({agentId:'timothy',agentDomains:['sales.email_send'],userRole:'marketing'})).toEqual([]);});
});