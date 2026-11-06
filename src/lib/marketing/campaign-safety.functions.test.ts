import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({context:null as any,calls:[] as unknown[][],error:false}));
vi.mock('@tanstack/react-start',()=>({createServerFn:()=>{
 let validate:(input:unknown)=>unknown=(v)=>v;
 const builder:any={middleware:()=>builder,inputValidator:(schema:any)=>{validate=(v)=>schema.parse(v);return builder;},handler:(handler:any)=>(args:any)=>handler({data:validate(args.data),context:m.context})};
 return builder;
}}));
vi.mock('@/integrations/supabase/auth-middleware',()=>({requireSupabaseAuth:{}}));
import { listCampaignTestResults } from './campaign-safety.functions';
const campaignId='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{
 m.calls=[];m.error=false;
 m.context={supabase:{from:(table:string)=>{
 const q:any={select:()=>q,eq:(key:string,value:unknown)=>{m.calls.push([table,key,value]);return q;},single:async()=>({data:{id:campaignId},error:null}),order:()=>q,limit:async()=>({data:[],error:m.error?{message:'read failure'}:null})};return q;
 }}};
});
it('reads only the requested campaign revision, rather than hiding an attempt behind recent revisions',async()=>{
 await listCampaignTestResults({data:{campaignId,revision:'2026-11-06T17:00:00Z'}});
 expect(m.calls).toContainEqual(['campaign_send_audit','campaign_id',campaignId]);
 expect(m.calls).toContainEqual(['campaign_send_audit','campaign_revision','2026-11-06T17:00:00Z']);
});
it('does not turn unreadable audit evidence into an empty result',async()=>{
 m.error=true;
 await expect(listCampaignTestResults({data:{campaignId,revision:'rev'}})).rejects.toThrow('read failure');
});
it('requires an explicit revision for the repeat guard',async()=>{
 await expect(listCampaignTestResults({data:{campaignId} as any})).rejects.toThrow();
});