import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { Link } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { usePermissions } from '@/hooks/use-permissions';
import { readSalesWatch } from '@/lib/ai-os/sales-watch.functions';
import type { RecordContext } from '@/lib/ai-panel-context';

export function SalesWatch({ context }: { context?: RecordContext | null }) {
  const { user } = useAuth();
  const { role, isLoading } = usePermissions();
  const call = useServerFn(readSalesWatch);
  const allowed = role === 'sales' || role === 'owner';
  const q = useQuery({ queryKey: ['sales-watch', user?.id], enabled: !!user && !isLoading && allowed,
    queryFn: () => call(), retry: false, staleTime: 60_000, refetchInterval: 60_000 });
  if (!allowed) return null;
  const signals = q.data?.signals.filter(s => !context || (context.kind === 'lead' && s.leadId === context.id) || (context.kind === 'company' && s.companyId === context.id) || (context.kind === 'quote' && s.quoteId === context.id)) ?? [];
  return <section aria-label="Timothy Sales-figyelés" className="space-y-2 border-b py-3 text-xs">
    <h3 className="font-semibold">Timothy · Ügyjelzések</h3>
    {q.isError ? <p role="alert" className="text-destructive">A figyelés adatai nem érhetők el.</p> : !q.data ? <p className="text-muted-foreground">Ellenőrzés…</p> : <>
      <ul className="space-y-2">{signals.slice(0, 5).map(s => <li key={s.id}><Link to="/leads" search={{ lead: s.leadId }} className="block break-words text-primary underline underline-offset-2">{s.label} · #{s.leadId.slice(0, 8)}</Link>{s.threadId && <Link to="/emails/$threadId" params={{ threadId: s.threadId }} className="text-muted-foreground underline">Levél megnyitása</Link>}</li>)}</ul>
      {!signals.length && <p className="text-muted-foreground">Az ellenőrzött adatokban nincs kiemelt jelzés.</p>}
      {signals.length > 5 && <p className="text-muted-foreground">További jelzések: {signals.length - 5}</p>}
      <p className="text-muted-foreground">{q.data.partial ? 'Részleges levélfigyelés · ' : ''}{!q.data.sync ? 'Saját aktív postafiók nem elérhető.' : q.data.sync.stale_or_unknown || q.data.sync.authError ? 'A levelezés szinkronja elavult vagy hiányos.' : 'Tárolt levelezés, nem teljes Gmail-ellenőrzés.'}</p>
      <p className="text-muted-foreground">Ellenőrizve: {new Date(q.data.checkedAt).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}</p>
    </>}
  </section>;
}