import { useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ShieldBan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getContactSuppression,setContactSuppression } from '@/lib/marketing/campaign-safety.functions';
import { toast } from 'sonner';

export function ContactSuppression({contactId,disabled=false}:{contactId:string;disabled?:boolean}) {
 const get=useServerFn(getContactSuppression),set=useServerFn(setContactSuppression),qc=useQueryClient();
 const [reference,changeReference]=useState(''),[busy,setBusy]=useState(false);
 const q=useQuery({queryKey:['contact-suppression',contactId],queryFn:()=>get({data:{contactId}})});
 const d=q.data;
 if(q.error || !d?.email) return null;
 const blocked=d.suppression?.blocked===true;
 async function save() {
  if(!d) return;
  setBusy(true);
  try { await set({data:{contactId,expectedEmail:d.email,expectedRevision:d.suppression?.revision ?? null,blocked:!blocked,reference}});changeReference('');toast.success('Marketingtiltás mentve');qc.invalidateQueries({queryKey:['contact-suppression']});qc.invalidateQueries({queryKey:['campaign-draft']}); }
  catch(e){toast.error(e instanceof Error ? e.message : 'Mentés sikertelen.');}
  finally{setBusy(false);}
 }
 return <section className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium flex items-center gap-2"><ShieldBan className="h-4 w-4"/>Marketingküldés</h3><p className="break-words text-sm">{d.email} <Badge variant={blocked?'destructive':'outline'}>{blocked?'Tiltott':'Nincs rögzített tiltás'}</Badge></p>{d.suppression && <p className="text-xs text-muted-foreground">{d.suppression.reference}</p>}{(!blocked || d.role==='owner') && <><Input aria-label="Marketingtiltás igazoló hivatkozása" placeholder="Igazoló hivatkozás" value={reference} maxLength={500} onChange={e=>changeReference(e.target.value)} disabled={disabled||busy}/><Button variant="outline" size="sm" disabled={disabled||busy||reference.trim().length<5} onClick={save}>{blocked?'Tiltás feloldása':'Marketingküldés tiltása'}</Button></>}</section>;
}