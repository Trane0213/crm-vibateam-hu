import type { SupabaseClient } from '@supabase/supabase-js';
import { campaignTestInput,testCopy,escapedMailHtml,campaignOutcome } from './campaign-send-policy';
import { isBusinessMailbox, normEmail } from '@/lib/gmail/relink-analysis';

export async function executeCampaignTest(input: unknown,ctx:{supabase:SupabaseClient<any>;userId:string;authorization:string}) {
 const data=campaignTestInput.parse(input);
 const role=await ctx.supabase.rpc('crm_role_of',{_auth_user:ctx.userId});
 if(role.error || !['owner','marketing'].includes(role.data)) throw new Error('Csak Owner/Marketing küldhet TESZT-et.');
 const c=await ctx.supabase.from('email_campaigns').select('id,created_by,updated_at,status,message_subject,message_body').eq('id',data.campaignId).single();
 if(c.error || c.data.status==='archived' || c.data.updated_at!==data.expectedUpdatedAt) throw new Error('A kampány megváltozott; nyisd újra.');
 if(role.data==='marketing' && c.data.created_by!==ctx.userId) throw new Error('Csak saját kampány küldhető.');
 const copy=testCopy(c.data.message_subject ?? '',c.data.message_body ?? '');
 const html=escapedMailHtml(copy.body);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const profile=await db.from('users_profile').select('gmail_email,active,gmail_auth_error').eq('auth_user_id',ctx.userId).single();
 const mailbox=normEmail(profile.data?.gmail_email);
 if(profile.error || !profile.data.active || profile.data.gmail_auth_error || !isBusinessMailbox(mailbox)) throw new Error('Nincs aktív saját céges Gmail-fiók.');
 const {handleGmailSend}=await import('@/lib/gmail/send.server');
 let claim:string|null=null,liveVerified=false;
 let out:{ok?:boolean;id?:string;threadId?:string;warning?:string}={};
 try {
  const response=await handleGmailSend(new Request('https://internal.invalid/api/gmail/send',{method:'POST',headers:{authorization:ctx.authorization,'content-type':'application/json'},body:JSON.stringify({to:data.recipient,expectedMailbox:mailbox,subject:copy.subject,body:copy.body,html})}),{
   beforeSend:async()=>{
    const result=await db.rpc('campaign_test_claim' as any,{p_campaign:data.campaignId,p_user:ctx.userId,p_revision:data.expectedUpdatedAt,p_mailbox:mailbox,p_recipient:data.recipient} as any);
    if(result.error || typeof result.data!=='string') throw new Error('A küldés foglalt, tiltott vagy a napi keret elfogyott.');
    claim=result.data;
   },
   verifySent:async(token,sent)=>{
    const {getMessage,getProfile}=await import('@/lib/gmail/gmail-api.server');
    const live=await getMessage(token,sent.id,'metadata');
    const actual=await getProfile(token);
    const header=(key:string)=>(live.payload?.headers ?? []).find(h=>h.name.toLowerCase()===key)?.value ?? '';
    const labels=live.labelIds ?? [];
    const to=header('to').trim().toLowerCase();
    if(normEmail(actual.emailAddress)!==mailbox || live.id!==sent.id || live.threadId!==sent.threadId || !labels.includes('SENT') || labels.some(l=>['DRAFT','TRASH','SPAM'].includes(l)) || ![data.recipient,`<${data.recipient}>`].includes(to) || header('cc') || header('bcc')) throw new Error('A saját Gmail SENT-bizonyíték nem teljes.');
    liveVerified=true;
   },
  });
  out=await response.json();
 } catch { /* A claimed effect may have happened: never retry. */ }
 let savedVerified=false,emailId:string|null=null;
 if(claim && liveVerified && out.ok && out.id && !out.warning) {
  const saved=await ctx.supabase.from('emails').select('id,from_email,to_emails,cc_emails,bcc_emails,subject,body,company_id,contact_id,lead_id,project_id').eq('gmail_message_id',out.id).eq('owner_user_id',ctx.userId).maybeSingle();
  const e=saved.data;
  savedVerified=!saved.error && !!e && normEmail(e.from_email)===mailbox && JSON.stringify(e.to_emails)===JSON.stringify([data.recipient]) && !(e.cc_emails?.length) && !(e.bcc_emails?.length) && e.subject===copy.subject && e.body===html && !e.company_id && !e.contact_id && !e.lead_id && !e.project_id;
  emailId=savedVerified ? e?.id ?? null : null;
 }
 let status=campaignOutcome(!!claim,liveVerified,savedVerified);
 if(claim) {
  const finished=await db.rpc('campaign_test_finish' as any,{p_id:claim,p_user:ctx.userId,p_gmail:out.id ?? null,p_email:emailId,p_verified:status==='verified'} as any);
  if(finished.error || finished.data!=='verified') status='uncertain';
 }
 return {status,mailbox,recipient:data.recipient};
}