import type {SupabaseClient} from '@supabase/supabase-js';
import {createHash} from 'node:crypto';
import {handleGmailSend} from '@/lib/gmail/send.server';
import {getMessage,getProfile,headerOf} from '@/lib/gmail/gmail-api.server';
/** Explicit authenticated TESZT processor; no external scheduler or customer activation. */
export async function processCampaignTestItem(sb:SupabaseClient<any>,userId:string,authorization:string,itemId:string){
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const item=await db.from('campaign_delivery_items').select('*').eq('id',itemId).eq('user_id',userId).single();
 const a=item.data;
 if(item.error||!a||a.mode!=='test')throw new Error('Csak saját ütemezett TESZT dolgozható fel; ügyfélküldés nincs aktiválva.');
 const role=await sb.rpc('crm_role_of',{_auth_user:userId});
 const camp=await sb.from('email_campaigns').select('id,created_by').eq('id',a.campaign_id).single();
 if(role.error||!['owner','marketing'].includes(role.data)||camp.error||(role.data==='marketing'&&camp.data.created_by!==userId))throw new Error('Nincs kampányjogosultság.');
 const copy=a.snapshot as {subject:string;body:string;html:string};
 const hash=createHash('sha256').update(JSON.stringify(copy)).digest('hex');
 if(hash!==a.snapshot_hash)throw new Error('A mentett levélmásolat megváltozott.');
 let token:string|null=null,live=false,gmail:string|null=null,emailId:string|null=null;
 try{
  const result=await handleGmailSend(new Request('https://internal.invalid/api/gmail/send',{method:'POST',headers:{authorization,'content-type':'application/json'},body:JSON.stringify({to:a.recipient_email,subject:copy.subject,body:copy.body,html:copy.html,expectedMailbox:a.mailbox})}),{
   beforeSend:async()=>{const claim=await db.rpc('campaign_delivery_claim',{p_item:a.id,p_user:userId,p_hash:hash});const out=claim.data as {claimed?:boolean;token?:string}|null;if(claim.error||!out?.claimed||!out.token)throw new Error('A foglalás nem indítható.');token=out.token;},
   verifySent:async(access,sent)=>{const m=await getMessage(access,sent.id,'metadata');const profile=await getProfile(access);if(profile.emailAddress.toLowerCase()!==a.mailbox||m.id!==sent.id||!m.labelIds?.includes('SENT')||m.labelIds.some(l=>['DRAFT','SPAM','TRASH'].includes(l))||![a.recipient_email,`<${a.recipient_email}>`].includes(headerOf(m,'to').toLowerCase().trim())||headerOf(m,'cc')||headerOf(m,'bcc'))throw new Error('Hiányos saját SENT-bizonyíték.');live=true;gmail=sent.id;}
  });
  const out=await result.json();
  if(live&&out.ok&&out.id===gmail&&!out.warning){const saved=await sb.from('emails').select('id,subject,body,company_id,contact_id,lead_id,project_id').eq('gmail_message_id',gmail).eq('owner_user_id',userId).maybeSingle();if(!saved.error&&saved.data?.subject===copy.subject&&saved.data.body===copy.html&&!saved.data.company_id&&!saved.data.contact_id&&!saved.data.lead_id&&!saved.data.project_id)emailId=saved.data.id;}
 }catch{ /* A claimed provider effect is never retried. */ }
 if(!token)return {state:'not_started'};
 const finish=await db.rpc('campaign_delivery_finish',{p_item:a.id,p_user:userId,p_token:token,p_gmail:gmail as any,p_email:emailId as any,p_verified:live&&!!emailId});
 if(finish.error)return {state:'uncertain'};
 return finish.data as {state:string};
}