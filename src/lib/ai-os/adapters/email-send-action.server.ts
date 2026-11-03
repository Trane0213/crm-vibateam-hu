import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolContext } from '../types';
import { registerTool } from '../tool-registry';
import { emailSendInput, emailSendAction, assertSameEmail, byteHash } from '../email-send-action';
import { normalizeRole } from '@/lib/permissions';
import { OWNER_ROLES } from '../roles';
import { authorizedDocument, fetchDocumentBytes, documentInput } from './document-access.server';
import { checkReferencedAttachment, checkOutboundSize, isVerifiedSentMessage } from '@/lib/quotes/send-policy';
import { hasSensitive } from '../approval';

export async function freezeEmailSend(user: SupabaseClient, args: Record<string, unknown>) {
  const message = emailSendInput.parse(args);
  const auth = await user.auth.getUser();
  const userId = auth.data.user?.id;
  if (!userId) throw new Error('Bejelentkezés szükséges.');
  const profile = await user.from('users_profile').select('active,gmail_email,roles:role_id(name)').eq('auth_user_id',userId).maybeSingle();
  const role = normalizeRole((profile.data as { roles?: {name?:string} } | null)?.roles?.name);
  if (profile.error || !profile.data?.active || profile.data.gmail_email?.toLowerCase() !== message.mailbox.toLowerCase() || !['owner','sales'].includes(role)) throw new Error('Csak aktív saját Gmail-fiókból küldhetsz.');
  message.mailbox = profile.data.gmail_email.toLowerCase();
  const l = await user.from('leads').select('id,summary,company_id,contact_id,assigned_to,status').eq('id',message.leadId).maybeSingle();
  if (l.error || !l.data?.company_id || (role === 'sales' && l.data.assigned_to !== userId)) throw new Error('Az ügy nem elérhető.');
  const company = await user.from('companies').select('id,name').eq('id',l.data.company_id).maybeSingle();
  if (company.error || !company.data) throw new Error('A cég nem elérhető.');
  const contact = l.data.contact_id ? await user.from('contacts').select('id,name,email,company_id').eq('id',l.data.contact_id).maybeSingle() : null;
  if (contact && (contact.error || contact.data?.company_id !== l.data.company_id)) throw new Error('A kapcsolattartó nem ellenőrizhető.');
  const quote = message.quoteId ? await user.from('quotes').select('id,lead_id,project_id,contact_id,version,alternative_key,status,locked_at,is_current').eq('id',message.quoteId).maybeSingle() : null;
  if (quote && (quote.error || !quote.data || quote.data.lead_id !== l.data.id || !quote.data.is_current || ['accepted','rejected','withdrawn'].includes(quote.data.status))) throw new Error('Az ajánlat nem aktuális vagy más ügyhöz tartozik.');
  if (quote?.data?.project_id) {
    const project = await user.from('projects').select('lead_id,company_id').eq('id',quote.data.project_id).maybeSingle();
    if (project.error || project.data?.lead_id !== l.data.id || project.data?.company_id !== l.data.company_id) throw new Error('Az ajánlati projekt más ügyhöz tartozik.');
  }
  const thread = message.threadId ? await user.from('email_threads').select('id,gmail_thread_id,company_id,lead_id,project_id,contact_id,last_message_at').eq('id',message.threadId).maybeSingle() : null;
  if (thread) {
    if (thread.error || !thread.data?.gmail_thread_id || thread.data.company_id !== l.data.company_id || thread.data.lead_id !== l.data.id || thread.data.contact_id !== l.data.contact_id || (thread.data.project_id && thread.data.project_id !== quote?.data?.project_id)) throw new Error('A válaszszál nem pontosan ehhez az ügyhöz tartozik.');
    const access = await user.from('email_thread_access').select('thread_id').eq('thread_id',thread.data.id).eq('user_id',userId).eq('mailbox_email',message.mailbox).maybeSingle();
    if (access.error || !access.data) throw new Error('A válaszszál nem a saját postafióké.');
  }
  const ctx: ToolContext = { userId,agentId:'timothy',runId:'',threadId:null,supabaseUser:user,supabaseAdmin:user };
  const attachments = [], buffers = new Map<string,{filename:string;mimeType:string;content:Buffer}>();
  for (const doc of message.documents) {
    if (doc.source === 'quote_documents' && !message.quoteId) throw new Error('Ajánlati melléklethez pontos ajánlat szükséges.');
    if (doc.source === 'project_documents') {
      const p = await user.from('projects').select('id,lead_id,company_id').eq('id',doc.project_id ?? '').maybeSingle();
      if (p.error || p.data?.lead_id !== l.data.id || p.data?.company_id !== l.data.company_id) throw new Error('A projektfájl más ügyhöz tartozik.');
    }
    const scope = documentInput.parse({ ...doc,quote_id:message.quoteId,company_id:l.data.company_id });
    const resolved = await authorizedDocument(scope,ctx);
    const bytes = await fetchDocumentBytes(resolved.key);
    const name = String(resolved.row.name ?? 'Melléklet');
    const mime = String(resolved.row.mime_type ?? 'application/octet-stream');
    attachments.push({source:doc.source,document_id:doc.document_id,key:resolved.key,name,mime,size:bytes.length,sha256:await byteHash(bytes),version:resolved.version});
    buffers.set(resolved.key,{filename:name,mimeType:mime,content:Buffer.from(bytes)});
  }
  const err = checkReferencedAttachment(message.body,attachments.length) || checkOutboundSize(attachments.map(a=>a.size));
  if (err) throw new Error(err);
  const frozen = emailSendAction.parse({message,context:{lead:l.data,company:company.data,contact:contact?.data??null,quote:quote?.data??null,thread:thread?.data??null},attachments});
  if (hasSensitive(frozen)) throw new Error('Védett tartalom nem küldhető.');
  return {frozen,buffers};
}

export async function executeEmailSend(args: Record<string,unknown>, ctx: ToolContext) {
  if (ctx.agentId !== 'timothy' || !ctx.approvalActionId || !ctx.accessToken) throw new Error('Tartós jóváhagyás és hitelesítés szükséges.');
  const approved = emailSendAction.parse(args);
  const current = await freezeEmailSend(ctx.supabaseUser,approved.message as Record<string,unknown>);
  assertSameEmail(approved,current.frozen);
  const {handleGmailSend} = await import('@/lib/gmail/send.server');
  const m=approved.message;
  const projectId = approved.context.quote?.project_id as string | undefined;
  const html = m.body.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br/>');
  const request = new Request('https://internal.invalid/api/gmail/send',{method:'POST',headers:{authorization:`Bearer ${ctx.accessToken}`,'content-type':'application/json'},body:JSON.stringify({to:m.to.join(','),cc:m.cc.join(','),bcc:m.bcc.join(','),subject:m.subject,body:m.body,html,
    expectedMailbox:m.mailbox,lead_id:m.leadId,company_id:approved.context.company.id,contact_id:approved.context.contact?.id,project_id:projectId,
    threadId:approved.context.thread?.gmail_thread_id,quote_id:m.quoteId,idempotency_key:ctx.approvalActionId,
    quote_document_ids:approved.attachments.filter(a=>a.source==='quote_documents').map(a=>a.document_id),
    attachments:approved.attachments.filter(a=>a.source!=='quote_documents').map(a=>({key:a.key,filename:a.name,mime_type:a.mime,size_bytes:a.size}))})});
  let verified = false, dispatched = false;
  const response = await handleGmailSend(request,{
    trustedAttachments:current.buffers,
    beforeSend:async buffers=>{
      // Hash the actual transport bytes, not a second download, before durable dispatch.
      assertSameEmail(approved.attachments.map(a=>({name:a.name,mime:a.mime,sha256:a.sha256})).sort((a,b)=>a.name.localeCompare(b.name)),
        (await Promise.all(buffers.map(async a=>({name:a.filename,mime:a.mimeType,sha256:await byteHash(a.content)})))).sort((a,b)=>a.name.localeCompare(b.name)));
      const latest = await freezeEmailSend(ctx.supabaseUser,approved.message as Record<string,unknown>);
      assertSameEmail(approved,latest.frozen);
      const claim = await ctx.supabaseAdmin.rpc('ai_os_email_dispatch_claim',{p_action:ctx.approvalActionId,p_user:ctx.userId,p_args:args});
      if (claim.error || claim.data !== true) throw new Error('Ez a küldés már foglalt vagy nem engedélyezett; ne küldd újra.');
      dispatched = true;
    },
    verifySent:async (token,sent)=>{
      const {getMessage,getProfile} = await import('@/lib/gmail/gmail-api.server');
      const profile = await getProfile(token);
      const live = await getMessage(token,sent.id,'metadata');
      if (profile.emailAddress.toLowerCase() !== m.mailbox || !isVerifiedSentMessage(live,sent.id) || live.threadId !== sent.threadId || (approved.context.thread && sent.threadId !== approved.context.thread.gmail_thread_id)) throw new Error('A kiküldés még nem igazolt; ne küldd újra.');
      verified = true;
    },
  });
  const out = await response.json() as {ok?:boolean;id?:string;threadId?:string;warning?:string};
  const partial = {gmail_message_id:out.id??null,gmail_thread_id:out.threadId??null,mailbox:m.mailbox,lead_id:m.leadId,verified_sent:verified,proof_saved:false};
  if (!response.ok || !out.ok || !out.id || out.warning || !verified) return dispatched ? {ok:true,data:partial} : {ok:false,error:'Nem történt igazolt küldés.'};
  const saved = await ctx.supabaseUser.from('emails').select('id,thread_id,owner_user_id,lead_id,company_id,contact_id,project_id,from_email,gmail_message_id,to_emails,cc_emails,bcc_emails,subject,body').eq('gmail_message_id',out.id).eq('owner_user_id',ctx.userId).eq('lead_id',m.leadId).maybeSingle();
  if (saved.error || !saved.data || saved.data.from_email?.toLowerCase() !== m.mailbox) return {ok:true,data:partial};
  const e = saved.data;
  try {
    assertSameEmail({to:m.to.map(x=>x.toLowerCase()),cc:m.cc.map(x=>x.toLowerCase()),bcc:m.bcc.map(x=>x.toLowerCase()),subject:m.subject,body:html,company_id:approved.context.company.id,contact_id:approved.context.contact?.id??null,project_id:projectId??null},
      {to:e.to_emails,cc:e.cc_emails,bcc:e.bcc_emails,subject:e.subject,body:e.body,company_id:e.company_id,contact_id:e.contact_id,project_id:e.project_id});
    const thread = await ctx.supabaseUser.from('email_threads').select('company_id,lead_id').eq('id',e.thread_id).maybeSingle();
    if(thread.error || thread.data?.lead_id!==m.leadId || thread.data?.company_id!==approved.context.company.id) throw new Error('Hiányos szálbizonyíték.');
    const attachmentRows = await ctx.supabaseUser.from('email_attachments').select('filename,mime_type,size_bytes,r2_key').eq('email_id',e.id);
    if(attachmentRows.error)throw new Error('Hiányos mellékletbizonyíték.');
    assertSameEmail(approved.attachments.map(a=>({filename:a.name,mime_type:a.mime,size_bytes:a.size,r2_key:a.key})).sort((a,b)=>a.r2_key.localeCompare(b.r2_key)),
      (attachmentRows.data??[]).sort((a,b)=>a.r2_key.localeCompare(b.r2_key)));
    if(m.quoteId) {
      const send = await ctx.supabaseUser.from('quote_sends').select('quote_id,status,gmail_message_id,email_id').eq('idempotency_key',ctx.approvalActionId).maybeSingle();
      if(send.error || send.data?.quote_id!==m.quoteId || send.data?.status!=='sent' || send.data.gmail_message_id!==out.id || send.data.email_id!==e.id) throw new Error('Hiányos ajánlati bizonyíték.');
    }
  } catch {return {ok:true,data:partial};}
  return {ok:true,data:{gmail_message_id:out.id,email_id:saved.data.id,thread_id:saved.data.thread_id,mailbox:m.mailbox,lead_id:m.leadId,verified_sent:true,proof_saved:true}};
}
export function registerEmailSendTool() {
  registerTool({name:'sales_send_email',domain:'sales.email_send',allowed_agents:['timothy'],allowed_roles:[...OWNER_ROLES,'sales'],needs_approval:true,approval:'dangerous',supports_dry_run:false,
    description:'Teljes, előzetesen javítható levél külön P0 jóváhagyással a saját Gmail-fiókból, pontos leadhez. Melléklet csak mentett document_id, nincs új PDF, nincs automatikus újraküldés. quoteId csak az adott ajánlat tényleges küldésekor. Módosítás új jóváhagyást igényel.',
    parameters:{type:'object',properties:{leadId:{type:'string'},mailbox:{type:'string'},to:{type:'array',items:{type:'string'}},cc:{type:'array',items:{type:'string'}},bcc:{type:'array',items:{type:'string'}},subject:{type:'string'},body:{type:'string'},quoteId:{type:'string'},threadId:{type:'string'},documents:{type:'array',items:{type:'object',properties:{source:{enum:['quote_documents','company_documents','project_documents']},document_id:{type:'string'},project_id:{type:'string'}},required:['source','document_id'],additionalProperties:false}}},required:['leadId','mailbox','to','subject','body'],additionalProperties:false}},executeEmailSend);
}