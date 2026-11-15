import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useDailyWork } from "@/lib/sales/use-daily-work";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { fetchPipelineLeads } from "@/components/pipeline/pipeline-data";
import { columnSummary } from "@/lib/workspace-v2/pipeline-dnd";
import { salesKpis, salesTasks, taskTarget, timothyDailyPrompt } from "@/lib/workspace-v2/sales-today";
import { wonNetThisMonth } from "@/lib/workspace-v2/won-this-month";
import { budapestMonthStart } from "@/lib/workspace-v2/targets";
import { wsHead } from "@/lib/workspace-v2/head";
import { KpiCard, AiSuggestionCard, NextActionCard, WsPageHeader } from "@/components/workspace-v2/parts";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { MonthlyTargetCard } from "@/components/workspace-v2/monthly-target";
import { formatDateTime, formatHuf } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";

export const Route = createFileRoute("/_authenticated/munka/sales/ma")({
  head: () => wsHead("Értékesítés – Ma", "Napi teendők, mutatók és Timothy napi összefoglalója."),
  component: SalesToday,
});

function SalesToday() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const team = role === "owner";
  const daily = useDailyWork();
  const pipeline = useQuery({ queryKey: ["pipeline", "board"], queryFn: fetchPipelineLeads });
  const won = useQuery({
    queryKey: ["leads", "won-month", team ? "team" : user?.id, budapestMonthStart()],
    enabled: !!user?.id,
    queryFn: () => wonNetThisMonth(supabase, budapestMonthStart(), team ? null : user!.id),
  });
  const today = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(new Date());

  if (daily.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Napi adatok betöltése…</div>;
  if (daily.isError || !daily.data) return <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">A napi adatok nem tölthetők be: {humanizeSupabaseError(daily.error)}</div>;

  const d = daily.data;
  const k = salesKpis(d);
  const tasks = salesTasks(d);
  const pv = pipeline.data ? columnSummary(pipeline.data) : null;
  const first = tasks[0];

  return (
    <>
      <WsPageHeader title="Értékesítés – Ma" subtitle={team ? `${today} · csapat` : today} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Aktív ügy" value={k.active} />
        <KpiCard label="Ma esedékes" value={k.today} tone="warning" />
        <KpiCard label="Lejárt teendő" value={k.overdue} tone={k.overdue ? "danger" : "default"} />
        <KpiCard label="Hiányzó adat" value={k.missing} tone={k.missing ? "danger" : "default"} />
        <KpiCard label={pv?.unknown ? `Folyamatban (${pv.unknown} érték nélkül)` : "Folyamatban (nettó)"} value={pipeline.isError ? "—" : pv ? formatHuf(pv.sum) : "…"} />
        <MonthlyTargetCard area="sales" actual={won.data?.net ?? null} actualLabel={won.data ? `${won.data.count} megnyert` : undefined} />
      </div>
      {first ? (
        <NextActionCard text={`${first.lead.company_name ?? first.lead.summary ?? "Ügy"} – ${first.label.toLowerCase()}.`}
          action={<Button asChild size="sm"><Link {...taskTarget(first.lead)}>Megnyitás<ArrowRight className="h-4 w-4" /></Link></Button>} />
      ) : <NextActionCard text="Nincs sürgős teendő. Nézd át a Pipeline-t vagy készíts új ajánlatot." />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-base font-semibold">Mai teendők ({tasks.length})</h2>
          {tasks.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Nincs nyitott teendő.</p> : (
            <ul className="mt-2 divide-y">
              {tasks.slice(0, 12).map((t) => (
                <li key={t.id}>
                  <Link {...taskTarget(t.lead)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{t.lead.company_name ?? t.lead.summary ?? "Névtelen ügy"}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.lead.summary}{t.due ? ` · ${formatDateTime(t.due)}` : ""}</div>
                    </div>
                    <StatusBadge status={t.status} label={t.label} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {tasks.length > 12 && <Link to="/sales/todo" search={{ bucket: "today" }} className="mt-2 inline-block text-xs text-primary hover:underline">További {tasks.length - 12} teendő a teljes listán</Link>}
        </section>
        <AiSuggestionCard agent="sales" title="Timothy – napi összefoglaló"
          lines={[`${k.overdue} lejárt, ${k.today} mai teendő`, `${k.missing} ügynél hiányzó adat`, "Timothy csak javasol; mentést, küldést te hagysz jóvá."]}
          prompt={timothyDailyPrompt(k)} cta="Részletek és javaslatok" />
      </div>
    </>
  );
}
