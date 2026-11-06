import type { SupabaseClient } from '@supabase/supabase-js';
export async function readCampaignTestResults(sb:SupabaseClient<any>,campaignId:string,revision:string) {
 const campaign=await sb.from('email_campaigns').select('id').eq('id',campaignId).single();
 if(campaign.error) throw new Error('A kampány nem olvasható.');
 const rows=await sb.from('campaign_send_audit').select('id,recipient,mailbox,status,claimed_at,finished_at,campaign_revision').eq('campaign_id',campaignId).eq('campaign_revision',revision).order('claimed_at',{ascending:false}).limit(40);
 if(rows.error) throw new Error(rows.error.message);
 return (rows.data ?? []) as {id:string;recipient:string;mailbox:string;status:string;claimed_at:string;finished_at:string|null;campaign_revision:string}[];
}