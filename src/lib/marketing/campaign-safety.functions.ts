import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { suppressionInput, campaignTestInput } from './campaign-send-policy';

export const getContactSuppression = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator(z.object({contactId:z.string().uuid()}))
 .handler(async({data,context})=>{
  const role=await context.supabase.rpc('crm_role_of',{_auth_user:context.userId});
  if(role.error || !['owner','marketing'].includes(role.data)) throw new Error('Nincs marketingjogosultság.');
  const contact=await context.supabase.from('contacts').select('id,email').eq('id',data.contactId).single();
  if(contact.error) throw new Error('A kontakt nem olvasható.');
  const email=(contact.data.email ?? '').trim().toLowerCase();
  const result=await context.supabase.from('marketing_email_suppressions' as any).select('blocked,reference,revision,changed_at').eq('email_norm',email).maybeSingle();
  if(result.error) throw new Error(result.error.message);
  return {email,role:role.data,suppression:result.data as {blocked:boolean;reference:string;revision:string;changed_at:string}|null};
 });

export const setContactSuppression=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator(suppressionInput).handler(async({data,context})=>{
  const role=await context.supabase.rpc('crm_role_of',{_auth_user:context.userId});
  const contact=await context.supabase.from('contacts').select('id,email').eq('id',data.contactId).single();
  if(role.error || !['owner','marketing'].includes(role.data) || contact.error || contact.data.email?.trim().toLowerCase()!==data.expectedEmail.trim().toLowerCase()) throw new Error('Nincs jogosultság vagy a kontakt megváltozott.');
  const {supabaseAdmin:db}=await import('@/integrations/supabase/client.server');
  const saved=await db.rpc('contact_set_marketing_suppression' as any,{p_user:context.userId,p_contact:data.contactId,p_email:data.expectedEmail,p_revision:data.expectedRevision,p_blocked:data.blocked,p_reference:data.reference} as any);
  if(saved.error) throw new Error(saved.error.message);
  const row=saved.data as {email_norm:string;blocked:boolean;revision:string}|null;
  if(!row || row.email_norm!==data.expectedEmail.trim().toLowerCase() || row.blocked!==data.blocked) throw new Error('A tiltás mentése nem igazolt.');
  return row;
 });

export const sendCampaignTest=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator(campaignTestInput).handler(async({data,context})=>{
  const {getRequest}=await import('@tanstack/react-start/server');
  const authorization=getRequest().headers.get('authorization');
  if(!authorization) throw new Error('Saját bejelentkezés szükséges.');
  const {executeCampaignTest}=await import('./campaign-test-send.server');
  return executeCampaignTest(data,{supabase:context.supabase,userId:context.userId,authorization});
 });

export const listCampaignTestResults=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
 .inputValidator(z.object({campaignId:z.string().uuid(),revision:z.string().min(1)}).strict()).handler(async({data,context})=>{
  const {readCampaignTestResults}=await import('./campaign-test-results.server');
  return readCampaignTestResults(context.supabase,data.campaignId,data.revision);
 });