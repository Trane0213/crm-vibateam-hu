import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { Sparkles, RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDailyWork } from '@/lib/sales/use-daily-work';
import { useAuth } from '@/hooks/use-auth';
import { runDailyBriefing } from '@/lib/ai-os/briefing.functions';
import { dailySalesFocus,dailySalesCounts,dailySalesFingerprint } from '@/lib/ai-os/daily-sales';
import { budapestDayBounds,isTestLabel } from '@/lib/owner-kpis';

export function TimothyDaily() {
  const daily = useDailyWork();
  const {user} = useAuth();
  const call = useServerFn(runDailyBriefing);
  const client = useQueryClient();
  const queryKey = ['ai-daily-sales',user?.id,budapestDayBounds(new Date()).start];
  const [fingerprint,setFingerprint] = useState<string|null>(null);
  const [manual,setManual] = useState(false);
  const [manualError,setManualError] = useState<string|null>(null);
  useEffect(()=>{ let active=true; if(daily.data) void dailySalesFingerprint(daily.data).then(h=>{if(active)setFingerprint(h);}); return()=>{active=false;}; },[daily.data]);
  const query=useQuery({queryKey,
    enabled:!!user && !!daily.data && !daily.isError,
    queryFn:()=>call({data:{mode:'sales',intent:client.getQueryData<{status:string}>(queryKey)?.status==='running'?'read':'automatic'}}),retry:false,staleTime:Infinity,
    refetchInterval:q=>q.state.data?.status==='running'?5000:false,
    refetchOnWindowFocus:false});
  async function refresh() {
    setManual(true);setManualError(null);
    try { const res=await call({data:{mode:'sales',intent:'manual'}});
      if (!res || typeof res.status !== 'string') throw new Error('A napi javaslat frissítése sikertelen.');
      client.setQueryData(queryKey,res);
      if(res.status !== 'ready') setManualError('A napi javaslat nem készült el; a futás eredménye nem igazolt.');
    } catch(e) {setManualError(e instanceof Error?e.message:'A frissítés sikertelen.');} finally {setManual(false);}
  }
  const result=query.data;
  const stale=result?.stale || (!!result?.fingerprint && !!fingerprint && result.fingerprint!==fingerprint);
  const focus=daily.data?dailySalesFocus(daily.data):[];
  const counts=daily.data?dailySalesCounts(daily.data):null;
  return <section aria-label="Timothy napi munkaszervező" className="border-y py-4 space-y-3">
    <div className="flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="h-4 w-4 text-primary"/>Timothy · Napi fókusz</h2>
      <Button variant="ghost" size="icon" title="Napi javaslat kézi frissítése" aria-label="Napi javaslat kézi frissítése" disabled={manual||query.isFetching||!counts||daily.isError||result?.status==='running'} onClick={refresh}><RefreshCw className={manual||query.isFetching?'h-4 w-4 animate-spin':'h-4 w-4'}/></Button></div>
    {daily.isError?<p role="alert" className="text-sm text-destructive">A napi adatok betöltése sikertelen.</p>:!counts?<p className="text-sm text-muted-foreground">Betöltés…</p>:<>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>Lejárt: {counts.overdue}</span><span>Ma: {counts.today}</span><span>Új: {counts.newLeads}</span><span>Ajánlatra vár: {counts.waiting}</span><span>Hiányos: {counts.incomplete}</span><span>Holnap: {counts.tomorrow}</span><span>Később: {counts.later}</span><span>Határidő nélkül: {counts.missing}</span></div>
      <ol className="divide-y">{focus.map(({lead,reason},i)=><li key={lead.id}><Link to="/leads" search={{lead:lead.id}} className="flex items-center gap-3 py-2 text-sm"><span className="text-muted-foreground tabular-nums">{i+1}.</span><div className="min-w-0 flex-1"><p className="truncate font-medium">{lead.company_name||lead.summary||`Ügy #${lead.id.slice(0,8)}`} {isTestLabel(lead.summary)&&<span className="text-xs text-muted-foreground">TESZT</span>}</p><p className="text-xs text-muted-foreground">{reason}{lead.next_step_due_at?` · ${new Date(lead.next_step_due_at).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})}`:''}</p></div><ArrowRight className="h-4 w-4 shrink-0"/></Link></li>)}</ol>
      {!focus.length&&<p className="text-sm text-muted-foreground">Nincs hozzád rendelt kiemelt teendő.</p>}
      {focus[0]&&<p className="text-sm"><span className="font-medium">Első teendő: </span>{focus[0].reason} · {focus[0].lead.company_name||focus[0].lead.summary||'ügy megnyitása'}</p>}
    </>}
    {query.isFetching||manual?<p className="text-xs text-muted-foreground">Timothy javaslata készül…</p>:manualError||query.isError?<p role="alert" className="text-sm text-destructive">{manualError||'A napi javaslat nem érhető el.'}</p>:stale?<p className="text-xs text-muted-foreground">A napi adatok változtak; a korábbi AI-javaslat elavult.</p>:result?.status==='ready'&&result.text?<p className="whitespace-pre-wrap text-sm"><span className="font-medium">Javaslat: </span>{result.text}</p>:result?.status==='running'?<p className="text-xs text-muted-foreground">A napi javaslat egy másik kérésben készül.</p>:result?.status==='unknown'||result?.status==='failed'?<p role="alert" className="text-xs text-destructive">A napi AI-javaslat eredménye nem igazolt; automatikusan nem ismételjük.</p>:null}
    {result?.generatedAt&&<p className="text-xs text-muted-foreground">Javaslat készítve: {new Date(result.generatedAt).toLocaleString('hu-HU',{timeZone:'Europe/Budapest'})}</p>}
  </section>;
}