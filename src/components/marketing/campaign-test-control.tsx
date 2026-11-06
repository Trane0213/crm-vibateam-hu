import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { CAMPAIGN_TEST_RECIPIENTS } from '@/lib/marketing/campaign-send-policy';
import { sendCampaignTest,listCampaignTestResults } from '@/lib/marketing/campaign-safety.functions';
import { toast } from 'sonner';
export function CampaignTestControl({campaignId,revision,disabled}:{campaignId:string;revision:string;disabled:boolean}) {
 const send=useServerFn(sendCampaignTest),list=useServerFn(listCampaignTestResults),qc=useQueryClient();
 const [recipient,setRecipient]=useState<typeof CAMPAIGN_TEST_RECIPIENTS[number]>('viktor.csotai@gmail.com');
 const [confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);
 const [result,setResult]=useState<string|null>(null);
 const q=useQuery({queryKey:['campaign-test-results',campaignId],queryFn:()=>list({data:{campaignId}})});
 async function run(){
  if(!confirmed) return;
  setBusy(true);setConfirmed(false);
  try {const r=await send({data:{campaignId,expectedUpdatedAt:revision,recipient,confirmed:true}});setResult(r.status);if(r.status==='verified')toast.success('TESZT igazoltan elküldve');else toast.warning(r.status==='not_started'?'A TESZT-küldés nem indult el.':'Az eredmény bizonytalan; ne küldd újra.');}
  catch(e){toast.error(e instanceof Error?e.message:'TESZT-küldés sikertelen.');}
  finally{setBusy(false);qc.invalidateQueries({queryKey:['campaign-test-results',campaignId]});}
 }
 const labels:Record<string,string>={verified:'Igazoltan elküldött TESZT',uncertain:'Eredmény bizonytalan – ne küldd újra',not_started:'Nem indult el'};
 return <section className="border-t pt-3 space-y-2"><h3 className="text-sm font-medium">TESZT-küldés · napi keret 40/fiók</h3><div className="flex flex-wrap items-center gap-2"><select aria-label="TESZT-címzett" className="max-w-full h-9 border rounded-md bg-background px-2" value={recipient} disabled={busy} onChange={e=>{const v=e.target.value;if(v==='viktor.csotai@gmail.com'||v==='info@vibateam.hu'){setRecipient(v);setConfirmed(false);}}}>{CAMPAIGN_TEST_RECIPIENTS.map(r=><option key={r}>{r}</option>)}</select><label className="flex items-center gap-2 text-sm"><Checkbox checked={confirmed} disabled={busy||disabled} onCheckedChange={v=>setConfirmed(v===true)}/>Egy TESZT-levelet jóváhagyok</label><Button size="sm" variant="outline" disabled={disabled||busy||!confirmed} onClick={run}><Send className="h-4 w-4 mr-2"/>{busy?'Folyamatban…':'TESZT küldése'}</Button></div>{result && <Badge variant={result==='verified'?'outline':'destructive'}>{labels[result]}</Badge>}{q.error && <p className="text-destructive text-sm">A küldési eredmények nem olvashatók.</p>}<ul className="divide-y text-xs">{(q.data??[]).map(r=><li key={r.id} className="py-2 break-words">{r.recipient} · {r.mailbox} · {labels[r.status] ?? r.status} · {new Date(r.claimed_at).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})}</li>)}</ul></section>;
}