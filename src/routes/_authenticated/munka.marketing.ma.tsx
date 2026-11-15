import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { getMarketingDaily } from "@/lib/marketing-daily.functions";
import { listCampaignDrafts } from "@/lib/marketing/campaign-drafts.functions";
import { listQuoteRequests } from "@/lib/quote-requests.functions";
import { receivedAt, isTestRequest } from "@/lib/quote-request-display";
import { campaignOverview, marketingFocus, marketingPriorityRows, marketingResultLines } from "@/lib/marketing/marketing-day-flow";
import { readMarketingHomeCompanies, marketingHomeSummary } from "@/lib/marketing-home-read";
import { budapestDayBounds } from "@/lib/owner-kpis";
import { budapestMonthStart } from "@/lib/workspace-v2/targets";
import { marketingRowLink, marketingRowStatus, scarletDailyPrompt } from "@/lib/workspace-v2/marketing-today";
import { KpiCard, AiSuggestionCard, NextActionCard, WsPageHeader } from "@/components/workspace-v2/parts";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { MonthlyTargetCard } from "@/components/workspace-v2/monthly-target";
import { formatDate } from "@/lib/format";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/marketing/ma")({
  head: () => wsHead("Marketing – Ma", "Napi marketingteendők, érdeklődők, kampányok és Scarlet javaslata."),
  component: MarketingToday,
});

const localDay = (iso: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date(iso));

function MarketingToday() {
  const { profile } = usePermissions();
  const listCampaigns = useServerFn(listCampaignDrafts);
  const listWeb = useServerFn(listQuoteRequests);
  const weekAgo = budapestDayBounds(new Date(), -7).start;
  const monthStart = budapestMonthStart();
  const daily = useQuery({ queryKey: ["mkt-home", "daily", "tasks", "followups", "phone_calls", profile?.auth_user_id], queryFn: () => getMarketingDaily(), enabled: !!profile?.auth_user_id });
  const campaigns = useQuery({ queryKey: ["campaign-drafts"], queryFn: () => listCampaigns() });
  const web = useQuery({ queryKey: ["mkt-home", "web-requests-7d"], staleTime: 120_000, queryFn: async () => (await listWeb()).filter((r) => receivedAt(r) >= weekAgo && !isTestRequest(r)).length });
  const companies = useQuery({ queryKey: ["mkt-home", "marketing-companies"], queryFn: () => readMarketingHomeCompanies(supabase, { marketing: true }) });

  const d = daily.data;
  const dailyReady = daily.isSuccess && !d?.partial;
  const rows = marketingPriorityRows(d);
  const focus = marketingFocus(rows, d);
  const overview = campaignOverview(campaigns.data?.campaigns);
  const handoffMonth = companies.isSuccess
    ? marketingHomeSummary(companies.data, [], { today: monthStart, week: monthStart, todayDay: localDay(monthStart), monthDay: localDay(monthStart) }).handoff30
    : null;
  const results = marketingResultLines({ mail: dailyReady && d ? d.mail : null, newCompanies30: null, handoff30: handoffMonth, emails7: null }).slice(0, 1);
  const today = new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", year: "numeric", month: "short", day: "numeric", weekday: "short" }).format(new Date());

  return (
    <>
      <WsPageHeader title="Marketing – Ma" subtitle={today} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Új webes érdeklődő (7 nap)" value={web.isError ? "—" : web.data ?? "…"} />
        <KpiCard label="Nyitott kampány" value={campaigns.isError ? "—" : campaigns.isSuccess ? overview.active : "…"} />
        <KpiCard label="Válasz érkezett" value={daily.isError ? "—" : d ? d.reply_pending.length : "…"} tone="warning" />
        <KpiCard label="Salesnek átadható" value={daily.isError ? "—" : d ? d.qualified.length : "…"} tone="success" />
        <MonthlyTargetCard area="marketing" actual={handoffMonth} actualLabel={handoffMonth != null ? `${handoffMonth} átadva e hónapban` : undefined} />
      </div>
      {focus && <NextActionCard text={`${focus.title}. ${focus.detail}`}
        action={rows[0] ? <Button asChild size="sm"><Link {...marketingRowLink(rows[0])}>{focus.actionLabel}<ArrowRight className="h-4 w-4" /></Link></Button>
          : <Button asChild size="sm"><Link to="/munka/marketing/kampanyok">{focus.actionLabel}</Link></Button>} />}
      {focus?.warnings.map((w) => <p key={w} className="text-xs text-status-warning">{w}</p>)}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <h2 className="font-display text-base font-semibold">Mai feladatok ({rows.length})</h2>
          {daily.isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betöltés…</div>
            : daily.isError ? <p role="alert" className="py-3 text-sm text-destructive">A napi lista nem tölthető be.</p>
            : rows.length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nincs esedékes marketingteendő.</p>
            : (
              <ul className="mt-2 divide-y">
                {rows.slice(0, 12).map((r) => (
                  <li key={r.id}>
                    <Link {...marketingRowLink(r)} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 hover:bg-muted/40">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{r.reason}{r.due ? ` · ${formatDate(r.due)}` : ""}{r.also.length ? ` · +${r.also.join(", ")}` : ""}</div>
                      </div>
                      <StatusBadge status={marketingRowStatus(r.kind)} label={r.label} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          {results.map((l) => <p key={l} className="mt-3 border-t pt-3 text-xs text-muted-foreground">{l}</p>)}
        </section>
        <AiSuggestionCard agent="marketing" title="Scarlet – napi javaslat"
          lines={[`${rows.length} teendő`, `${d?.reply_pending.length ?? 0} beérkezett válasz`, "Scarlet tervezetet készít; küldés csak a te jóváhagyásoddal."]}
          prompt={scarletDailyPrompt({ rows: rows.length, replies: d?.reply_pending.length ?? 0, qualified: d?.qualified.length ?? 0, activeCampaigns: campaigns.isSuccess ? overview.active : null })} />
      </div>
    </>
  );
}
