import {createServerFn} from '@tanstack/react-start';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {z} from 'zod';
import {withCampaignSignature} from './campaign-message';
import {campaignPreview} from './campaign-preparation';
import {campaignTestCopy} from './campaign-test-copy';
async function scope(sb:any,userId:string,id:string,revision?:string){
 const role=await sb.rpc('crm_role_of',{_auth_user:userId});
 const c=await sb.from('email_campaigns').select('id,created_by,status,updated_at,message_subject,message_body,message_html,signature_html,signature_text,approved_revision,delivery_state').eq('id',id).single();
 if(role.error || !['owner','marketing'].includes(role.data) || c.error || !c.data || (role.data==='marketing'&&c.data.created_by!==userId) || (revision&&c.data.updated_at!==revision))throw new Error('A kampány megváltozott vagy nem elérhető.');
 return c.data;
}
export const saveCampaignMessage=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({campaignId:z.string().uuid(),revision:z.string().min(1),subject:z.string().max(500),body:z.string().max(20000),html:z.string().max(200000).nullable(),signatureHtml:z.string().max(50000).nullable(),signatureText:z.string().max(10000).nullable()}).strict()).handler(async({data,context})=>{
 await scope(context.supabase,context.userId,data.campaignId,data.revision);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const saved=await db.rpc('campaign_save_message',{p_campaign:data.campaignId,p_user:context.userId,p_expected:data.revision,p_subject:data.subject,p_body:data.body,p_html:data.html as any,p_signature_html:data.signatureHtml as any,p_signature_text:data.signatureText as any});
 if(saved.error)throw new Error(saved.error.message);
 const read=await scope(context.supabase,context.userId,data.campaignId);
 if(read.message_subject!==data.subject||read.message_body!==data.body||read.message_html!==data.html||read.signature_html!==data.signatureHtml||read.signature_text!==data.signatureText)throw new Error('A mentett üzenet nem igazolt; frissítsd a kampányt.');
 return {campaignId:data.campaignId};
});
export const readCampaignDelivery=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({campaignId:z.string().uuid()}).strict()).handler(async({data,context})=>{
 await scope(context.supabase,context.userId,data.campaignId);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const result=await db.from('campaign_delivery_items').select('id,recipient_email,mode,state,scheduled_at,claimed_at,finished_at,reason,mailbox').eq('campaign_id',data.campaignId).eq('user_id',context.userId).order('created_at',{ascending:false}).limit(500);
 if(result.error)throw new Error('A küldési munkasor nem olvasható.');
 return {rows:result.data,automaticActive:false};
});
export const scheduleCampaign=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({campaignId:z.string().uuid(),revision:z.string().min(1),mode:z.enum(['test','customer']),recipient:z.enum(['viktor.csotai@gmail.com','info@vibateam.hu']).optional(),at:z.string().datetime({offset:true}),confirmed:z.literal(true)}).strict()).handler(async({data,context})=>{
 const c=await scope(context.supabase,context.userId,data.campaignId,data.revision);
 const {ownDraftMailbox}=await import('./gmail-drafts.server');
 const account=await ownDraftMailbox(context.supabase,context.userId);
 const {createHash}=await import('node:crypto');
 const complete=withCampaignSignature(c.message_body??'',c.message_html,c.signature_html,c.signature_text);
 const rows:any[]=[];
 if(data.mode==='test'){
  if(!data.recipient)throw new Error('TESZT-címzett szükséges.');
  const snapshot=campaignTestCopy(c.message_subject??'',complete.body,complete.html);
  rows.push({recipient_email:data.recipient,mode:'test',scheduled_at:data.at,snapshot,snapshot_hash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')});
 }else{
  const recipients=await context.supabase.from('email_campaign_recipients').select('contact_id,contacts(id,company_id,name,contact_kind,verification_state,verified_by,verified_at,companies(name))').eq('campaign_id',c.id).eq('selected',true).limit(41);
  if(recipients.error || !recipients.data?.length || recipients.data.length>40)throw new Error('1–40 mentett címzett ütemezhető egyszerre.');
  const companyIds=[...new Set(recipients.data.map((r:any)=>r.contacts?.company_id).filter(Boolean))] as string[];
  const {runCampaignPrecheck}=await import('./campaign-precheck.server');
  const check=await runCampaignPrecheck(context.supabase,companyIds);
  for(const row of recipients.data){
   const fresh=check.rows.find(r=>r.contact_id===row.contact_id);
   if(!fresh || fresh.status!=='ready')throw new Error('A kijelölt címzettek között tiltott vagy bizonytalan előzményű kontakt van; ügyfélütemezés nem indult.');
   const k=row.contacts as any;
   const copy=campaignPreview(c.message_subject??'',complete.body,{...k,company_name:k.companies?.name},complete.html);
   const snapshot={subject:copy.subject,body:copy.body,html:copy.html};
   rows.push({contact_id:row.contact_id,company_id:k.company_id,recipient_email:fresh.norm,mode:'customer',scheduled_at:data.at,snapshot,snapshot_hash:createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')});
  }
 }
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const result=await db.rpc('campaign_schedule',{p_campaign:c.id,p_user:context.userId,p_expected:data.revision,p_mailbox:account.mailbox,p_rows:rows});
 if(result.error)throw new Error(result.error.message);
 const verify=await db.from('campaign_delivery_items').select('recipient_email,snapshot_hash').eq('campaign_id',c.id).eq('campaign_revision',data.revision).eq('user_id',context.userId);
 if(verify.error || rows.some(row=>!verify.data?.some(v=>v.recipient_email===row.recipient_email&&v.snapshot_hash===row.snapshot_hash)))throw new Error('Az ütemezés visszaolvasása nem igazolt.');
 return {stored:rows.length,automaticActive:false};
});
export const controlCampaignDelivery=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({campaignId:z.string().uuid(),revision:z.string().min(1),action:z.enum(['pause','resume','stop'])}).strict()).handler(async({data,context})=>{
 await scope(context.supabase,context.userId,data.campaignId,data.revision);
 const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
 const result=await db.rpc('campaign_delivery_control',{p_campaign:data.campaignId,p_user:context.userId,p_expected:data.revision,p_action:data.action});
 if(result.error)throw new Error(result.error.message);
 const c=await scope(context.supabase,context.userId,data.campaignId);
 const expected={pause:'paused',resume:'scheduled',stop:'stopped'}[data.action];
 if(c.delivery_state!==expected)throw new Error('A vezérlés eredménye nem igazolt.');
 return {state:expected};
});
export const processScheduledTest=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator(z.object({itemId:z.string().uuid(),confirmed:z.literal(true)}).strict()).handler(async({data,context})=>{
 const {getRequest}=await import('@tanstack/react-start/server');
 const authorization=getRequest().headers.get('authorization');
 if(!authorization)throw new Error('Saját bejelentkezés szükséges.');
 const {processCampaignTestItem}=await import('./campaign-delivery.server');
 return processCampaignTestItem(context.supabase,context.userId,authorization,data.itemId);
});