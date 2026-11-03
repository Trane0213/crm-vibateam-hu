import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { readSalesWatch } from '@/lib/ai-os/sales-watch.functions';
import type { RecordContext } from '@/lib/ai-panel-context';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { WatchSignal } from '@/lib/ai-os/sales-watch';

export function SalesWatch({ context }: { context?: RecordContext | null }) {
  const { user } = useAuth();
  const { role, isLoading } = usePermissions();
  const call = useServerFn(readSalesWatch);
  const allowed = role === 'sales' || role === 'owner';
  const q = useQuery({ queryKey: ['sales-watch', user?.id], enabled: !!user && !isLoading && allowed,
    queryFn: () => call(), retry: false, staleTime: 60_000, refetchInterval: 60_000 });
  if (!allowed) return null;
  const signals = q.data?.signals.filter(s => !context || (context.kind === 'lead' && s.leadId === context.id) || (context.kind === 'company' && s.companyId === context.id) || (context.kind === 'quote' && s.quoteId === context.id)) ?? [];
  return <SalesWatchView signals={signals} error={q.isError} fetching={q.isFetching} data={q.data} />;
}

type WatchData = { checkedAt:string; partial:boolean; sync: {stale_or_unknown:boolean;authError:boolean}|null };
export function SalesWatchView({signals,error,fetching,data}:{signals:WatchSignal[];error:boolean;fetching:boolean;data?:WatchData}) {
  const [page,setPage] = useState(0);
  const last = Math.max(0,Math.ceil(signals.length/5)-1);
  const active = Math.min(page,last);
  return <section aria-label="Timothy Sales-figyelés" className="space-y-2 border-b py-3 text-xs">
    <h3 className="font-semibold">Timothy · Ügyjelzések</h3>
    {error ? <p role="alert" className="text-destructive">A figyelés adatai nem érhetők el.</p> : !data ? <p className="text-muted-foreground">Ellenőrzés…</p> : <>
      {fetching && <p className="text-muted-foreground">Frissítés… Az előző ellenőrzés jelzései láthatók.</p>}
      <ul className="space-y-2">{signals.slice(active*5, active*5+5).map(s => <li key={s.id}><Link to="/leads" search={{ lead: s.leadId }} className="block break-words text-primary underline underline-offset-2">{s.label} · #{s.leadId.slice(0, 8)}</Link>{s.threadId && <Link to="/emails/$threadId" params={{ threadId: s.threadId }} className="text-muted-foreground underline">Levél megnyitása</Link>}</li>)}</ul>
      {!signals.length && <p className="text-muted-foreground">Az ellenőrzött adatokban nincs kiemelt jelzés.</p>}
      {signals.length > 5 && <nav aria-label="Ügyjelzések lapozása" className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Előző jelzések" disabled={active===0} onClick={()=>setPage(active-1)}><ChevronLeft /></Button><span>{active+1}/{last+1} · {signals.length} jelzés</span><Button variant="ghost" size="icon" aria-label="Következő jelzések" disabled={active===last} onClick={()=>setPage(active+1)}><ChevronRight /></Button></nav>}
      <p className="text-muted-foreground">{data.partial ? 'Részleges levélfigyelés · ' : ''}{!data.sync ? 'Saját aktív postafiók nem elérhető.' : data.sync.stale_or_unknown || data.sync.authError ? 'A levelezés szinkronja elavult vagy hiányos.' : 'Tárolt levelezés, nem teljes Gmail-ellenőrzés.'}</p>
      <p className="text-muted-foreground">Ellenőrizve: {new Date(data.checkedAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}</p>
    </>}
  </section>;
}