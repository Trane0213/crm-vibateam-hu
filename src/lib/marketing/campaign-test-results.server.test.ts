import { beforeEach, expect, it } from 'vitest';
import { readCampaignTestResults } from './campaign-test-results.server';
let calls:unknown[][]=[],error=false;
const campaignId='11111111-1111-4111-8111-111111111111';
function client(){return {from:(table:string)=>{
 const q:any={select:()=>q,eq:(key:string,value:unknown)=>{calls.push([table,key,value]);return q;},single:async()=>({data:{id:campaignId},error:null}),order:()=>q,limit:async()=>({data:[],error:error?{message:'read failure'}:null})};return q;
}} as any;}
beforeEach(()=>{calls=[];error=false;});
it('reads exact campaign and revision evidence, not only the newest revisions',async()=>{
 await readCampaignTestResults(client(),campaignId,'2026-11-06T17:00:00Z');
 expect(calls).toContainEqual(['campaign_send_audit','campaign_id',campaignId]);
 expect(calls).toContainEqual(['campaign_send_audit','campaign_revision','2026-11-06T17:00:00Z']);
});
it('does not turn unreadable audit evidence into an empty result',async()=>{
 error=true;await expect(readCampaignTestResults(client(),campaignId,'rev')).rejects.toThrow('read failure');
});