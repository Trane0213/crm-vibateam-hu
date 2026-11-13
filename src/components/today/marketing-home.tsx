import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Mail,
  Radar,
  BookOpen,
  ListPlus,
  Building2,
  ArrowRightCircle,
  Sparkles,
  Inbox,
  RefreshCw,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WelcomeHeader } from "@/components/welcome-header";
import { WorkspacePanel } from "@/components/dashboard/workspace-panel";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  MARKETING_STATUS_LABEL,
  MARKETING_STATUS_TONE,
  type MarketingStatus,
} from "@/lib/marketing-status";
import {
  readMarketingHomeCompanies,
  countMarketingHomeEmails,
  marketingHomeSummary,
} from "@/lib/marketing-home-read";
import { getMarketingDaily } from "@/lib/marketing-daily.functions";
import { listCampaignDrafts } from "@/lib/marketing/campaign-drafts.functions";
import { listQuoteRequests } from "@/lib/quote-requests.functions";
import { receivedAt, isTestRequest } from "@/lib/quote-request-display";
import {
  marketingPriorityRows,
  marketingFocus,
  marketingFlowStages,
  campaignOverview,
  marketingResultLines,
  isUrgent,
  type MarketingPriorityRow,
  type MarketingTarget,
  type CompanyTab,
} from "@/lib/marketing/marketing-day-flow";
import { PrimaryActionCard, SalesFlowMap } from "@/components/sales/sales-flow-ui";
import { budapestDayBounds } from "@/lib/owner-kpis";
import { usePermissions } from "@/hooks/use-permissions";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { cn } from "@/lib/utils";

const isoStartOfDay = () => budapestDayBounds().start;
const isoWeekAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString();
};
const isoMonthAgo = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString();
};

export function MarketingHome() {
  const { profile } = usePermissions();
  const { visibleAgentIds } = useVisibleAgents();
  const listCampaigns = useServerFn(listCampaignDrafts);
  const listWeb = useServerFn(listQuoteRequests);
  const [showAll, setShowAll] = useState(false);
  const dailyQ = useQuery({
    queryKey: ["mkt-home", "daily", "tasks", "followups", "phone_calls", profile?.auth_user_id],
    queryFn: () => getMarketingDaily(),
    enabled: !!profile?.auth_user_id,
  });
  const todayStart = isoStartOfDay();
  const weekAgo = isoWeekAgo();
  const monthAgo = isoMonthAgo();

  // A marketing univerzum egységes definíciója: lásd src/lib/marketing-universe.ts
  const companiesQ = useQuery({
    queryKey: ["mkt-home", "marketing-companies"],
    queryFn: async () => readMarketingHomeCompanies(supabase, { marketing: true }),
  });
  // „Új cég” számláló: MINDEN cég, forrástól függetlenül.
  const allCompaniesQ = useQuery({
    queryKey: ["mkt-home", "all-companies-30d"],
    queryFn: async () => readMarketingHomeCompanies(supabase, { since: monthAgo }),
  });
  const threadsQ = useQuery({
    queryKey: ["mkt-home", "recent-threads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("id,subject,company_id,participants,last_message_at")
        .gte("last_message_at", monthAgo)
        .order("last_message_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  // Email aktivitás = email darabszám (nem thread). Egységes a workspace-szel.
  const emailsQ = useQuery({
    queryKey: ["mkt-home", "recent-emails"],
    queryFn: async () => countMarketingHomeEmails(supabase, monthAgo, weekAgo),
  });
  // Meglévő kampánytervezet-lista (ugyanaz a szerverfüggvény és kulcs, mint a Kampányok oldalon).
  const campaignsQ = useQuery({ queryKey: ["campaign-drafts"], queryFn: () => listCampaigns() });
  // Webes érdeklődések: csak darabszám (7 nap, TESZT nélkül); a feldolgozás a meglévő oldalon marad.
  const webQ = useQuery({
    queryKey: ["mkt-home", "web-requests-7d"],
    queryFn: async () => {
      const rows = await listWeb();
      return rows.filter((r) => receivedAt(r) >= weekAgo && !isTestRequest(r)).length;
    },
    staleTime: 120_000,
  });

  const companies = companiesQ.data ?? [];
  const threads = threadsQ.data ?? [];
  const localDay = (iso: string) =>
    new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest" }).format(new Date(iso));
  const { decorated, newToday, handoffToday, newCompanies7, newCompanies30, handoff30 } =
    marketingHomeSummary(companies, allCompaniesQ.data ?? [], {
      today: todayStart,
      week: weekAgo,
      todayDay: localDay(todayStart),
      monthDay: localDay(monthAgo),
    });
  const byStatus = (s: MarketingStatus) => decorated.filter((c) => c.meta.status === s);
  const pipeline: Record<MarketingStatus, number> = {
    new: byStatus("new").length,
    contacted: byStatus("contacted").length,
    qualified: byStatus("qualified").length,
    handoff: byStatus("handoff").length,
    rejected: byStatus("rejected").length,
  };
  const qualified = byStatus("qualified");
  const companiesReady = companiesQ.isSuccess && !companiesQ.isError;
  const allReady = allCompaniesQ.isSuccess && !allCompaniesQ.isError;
  const loading =
    companiesQ.isLoading || allCompaniesQ.isLoading || threadsQ.isLoading || emailsQ.isLoading;

  const daily = dailyQ.data;
  const dailyReady = dailyQ.isSuccess && !dailyQ.isError && !daily?.partial;
  const rows = marketingPriorityRows(daily);
  const focus = marketingFocus(rows, daily);
  const urgentRows = rows.filter(isUrgent);
  const visibleRows = showAll ? rows : urgentRows.slice(0, 8);
  const campaignsReady = campaignsQ.isSuccess && !campaignsQ.isError;
  const overview = campaignOverview(campaignsQ.data?.campaigns);
  const stages = marketingFlowStages({
    daily,
    dailyReady,
    webRecent: webQ.isSuccess ? webQ.data : null,
    handoff30: companiesReady ? handoff30 : null,
    activeCampaigns: campaignsReady ? overview.active : null,
  });
  const results = marketingResultLines({
    mail: dailyReady && daily ? daily.mail : null,
    newCompanies30: allReady ? newCompanies30 : null,
    handoff30: companiesReady ? handoff30 : null,
    emails7: emailsQ.isSuccess && !emailsQ.isError ? (emailsQ.data ?? null) : null,
  });
  const scarletVisible = visibleAgentIds.has("marketing");

  return (
    <div className="crm-today flex flex-col">
      <WelcomeHeader
        title="Mai munka"
        subtitle="Marketing · saját feladatok, kampányok és ügyfélkapcsolatok"
      />

      <div className="space-y-4 p-4 pt-3 sm:p-6 sm:pt-3">
        {(companiesQ.isError || allCompaniesQ.isError || emailsQ.isError || threadsQ.isError) && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
            Egyes marketingadatok nem tölthetők be teljesen; az érintett összesítők nem igazoltak.
            <Button size="sm" variant="outline" onClick={() => { void companiesQ.refetch(); void allCompaniesQ.refetch(); void emailsQ.refetch(); void threadsQ.refetch(); }}>
              <RefreshCw />Újrapróbálás
            </Button>
          </div>
        )}
        {dailyQ.isError && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 p-3 text-sm text-destructive">
            A napi marketingfeladatok nem tölthetők be; ez nem üres munkalista.
            <Button size="sm" variant="outline" onClick={() => dailyQ.refetch()}><RefreshCw />Napi lista újrapróbálása</Button>
          </div>
        )}
        {daily?.partial && <p role="status" className="rounded-md border border-status-warning/30 p-3 text-sm text-muted-foreground">A napi lista részleges. A látható tételek megnyithatók, de a hiányzó adatok nem jelentenek nulla teendőt.</p>}

        {/* ───────── 1. Most ezzel kezdj + Scarlet ───────── */}
        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
          {dailyQ.isLoading || !profile?.auth_user_id ? (
            <div role="status" className="animate-pulse rounded-lg border bg-card p-4 text-sm text-muted-foreground">Mai legfontosabb teendő keresése…</div>
          ) : focus ? (
            <PrimaryActionCard
              eyebrow={focus.eyebrow}
              title={focus.title}
              detail={focus.detail}
              warnings={focus.warnings}
              action={
                <>
                  <Button asChild size="sm"><TargetLink dest={focus.target}>{focus.actionLabel}</TargetLink></Button>
                  {urgentRows.length > 1 && <span className="self-center text-xs text-muted-foreground">utána még {urgentRows.length - 1} esedékes tétel</span>}
                </>
              }
            />
          ) : (
            <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">A napi lista nem elérhető; a fenti újrapróbálással töltheted be.</div>
          )}
          {scarletVisible && (
            <section aria-label="Scarlet segítség" className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-1.5 text-sm font-semibold"><Radar className="h-4 w-4 text-primary" />Scarlet segít</div>
              <p className="mt-1 text-xs text-muted-foreground">
                A kérdés előre beíródik, te küldöd el. Scarlet csak a számodra látható adatot olvassa, levelet nem küld, és módosítást csak jóváhagyásoddal javasolhat.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {([
                  ["mkt-today", "Mai teendőim"],
                  ["mkt-replies", "Beérkezett válaszok"],
                  ["mkt-handoff", "Átadásra kész cégek"],
                ] as const).map(([quick, label]) => (
                  <Button key={quick} asChild size="sm" variant="outline">
                    <Link to="/ai-assistant" search={{ agent: "marketing", quick } as any}>{label}</Link>
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* ───────── 2. A teljes marketing út egy sorban ───────── */}
        <SalesFlowMap stages={stages} label="Marketing munkafolyamat" />

        <div className="flex flex-wrap gap-2" aria-label="Gyors műveletek">
          <Button size="sm" asChild><Link to="/customers"><Building2 />Ügyfél keresése</Link></Button>
          <Button size="sm" variant="secondary" asChild><Link to="/campaign-list"><ListPlus />Kampányok</Link></Button>
          <Button size="sm" variant="secondary" asChild><Link to="/emails"><Mail />Levelek</Link></Button>
          <Button size="sm" variant="secondary" asChild><Link to="/web-quote-requests"><Inbox />Webes érdeklődések</Link></Button>
          <Button size="sm" variant="ghost" asChild><Link to="/data-quality"><Radar />Adatellenőrzés</Link></Button>
          <Button size="sm" variant="ghost" asChild><Link to="/help/marketing"><BookOpen />Súgó</Link></Button>
        </div>

        {/* ───────── 3. Mai prioritások ───────── */}
        <WorkspacePanel
          title={showAll ? `Teljes napi lista (${rows.length})` : `Mai prioritások (${urgentRows.length})`}
          subtitle="Sorrend: beérkezett válasz → lejárt/esedékes teendő → átadható cég → új megkeresés. Egy cég egyszer szerepel."
        >
          {dailyQ.isLoading ? (
            <p role="status" className="p-4 text-sm text-muted-foreground">Saját teendők és visszahívások betöltése…</p>
          ) : visibleRows.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              {dailyQ.isSuccess
                ? daily?.partial ? "A részleges listában nincs látható esedékes tétel." : `Nincs esedékes tétel.${rows.length ? " A teljes listában további megkeresendő cégek vannak." : ""}`
                : "A napi lista még nem elérhető."}
            </p>
          ) : (
            <>
              <ul className="divide-y md:hidden">
                {visibleRows.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{row.title}</div>
                      <div className="text-xs text-muted-foreground">{row.label}{row.due ? ` · ${fmtDate(row.due)}` : ""}{row.also.length ? ` · +${row.also.join(", ")}` : ""}</div>
                    </div>
                    <Button asChild size="sm" variant="outline"><TargetLink dest={row.target}>Megnyitás</TargetLink></Button>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3">Ügyfél / feladat</th>
                      <th className="p-3">Teendő</th>
                      <th className="p-3">Miért most?</th>
                      <th className="p-3">Határidő</th>
                      <th className="p-3">Felelős</th>
                      <th className="p-3"><span className="sr-only">Művelet</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="p-3 font-medium">{row.title}</td>
                        <td className="p-3"><KindBadge row={row} />{row.also.length > 0 && <div className="mt-1 text-[11px] text-muted-foreground">+ {row.also.join(", ")}</div>}</td>
                        <td className="max-w-[320px] p-3 text-xs text-muted-foreground">{row.reason}</td>
                        <td className="whitespace-nowrap p-3">{fmtDate(row.due ?? undefined)}</td>
                        <td className="p-3 text-xs">{row.responsible === "Saját" ? profile?.full_name ?? "Saját" : row.responsible}</td>
                        <td className="p-3 text-right"><Button asChild size="sm" variant="outline"><TargetLink dest={row.target}>Megnyitás</TargetLink></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {rows.length > urgentRows.slice(0, 8).length && (
            <div className="border-t px-4 py-2">
              <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Csak a mai prioritások" : `Teljes lista (${rows.length}) – megkeresendő és hiányos adatú cégekkel`}
              </Button>
            </div>
          )}
        </WorkspacePanel>

        {/* ───────── 4. Kampányok · Átadás · Levelek ───────── */}
        <div className="grid gap-4 xl:grid-cols-3">
          <WorkspacePanel title="Kampányok állapota" subtitle="Tervezet → ellenőrzés → ütemezés. Ügyfélnek automatikus küldés nincs bekapcsolva." to="/campaign-list">
            <div className="space-y-3 p-4">
              {campaignsQ.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">Kampánytervezetek betöltése…</p>
              ) : campaignsQ.isError ? (
                <div role="alert" className="space-y-2 text-sm text-destructive">
                  <p>A kampánytervezetek nem olvashatók; az állapotuk nem igazolt.</p>
                  <Button size="sm" variant="outline" onClick={() => campaignsQ.refetch()}><RefreshCw />Újrapróbálás</Button>
                </div>
              ) : overview.open.length === 0 ? (
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>Nincs nyitott kampánytervezet.</p>
                  <Button asChild size="sm" variant="outline"><Link to="/campaign-list">Új tervezet indítása</Link></Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 text-[11px]">
                    <Badge variant="outline">{overview.counts.draft} tervezet</Badge>
                    <Badge variant="outline">{overview.counts.prechecked} ellenőrzött</Badge>
                    <Badge variant="outline">{overview.counts.scheduled + overview.counts.paused} ütemezett</Badge>
                  </div>
                  <ul className="space-y-2">
                    {overview.open.slice(0, 4).map((c) => (
                      <li key={c.id}>
                        <Link to="/campaign-list" search={{ campaignId: c.id }} className="block rounded-md border bg-background p-2 transition hover:border-primary/50 hover:bg-primary/5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium">{c.name}</span>
                            <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", TONE_CLASS[c.tone])}>{c.label}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">{c.next}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  {overview.open.length > 4 && <p className="text-[11px] text-muted-foreground">+ még {overview.open.length - 4} nyitott tervezet a Kampányok oldalon</p>}
                </>
              )}
              <p className="border-t pt-2 text-xs text-muted-foreground">
                {dailyReady ? daily?.contact_warnings.length : "—"} ellenőrizendő emailadat · {dailyReady ? daily?.missing_contacts.length : "—"} hiányos elérhetőség
              </p>
            </div>
          </WorkspacePanel>

          <WorkspacePanel title="Átadás előkészítése Salesnek">
            <p className="px-4 pt-3 text-xs text-muted-foreground">Nyisd meg a céget, ellenőrizd az összefoglalót és a felelőst. A lista megnyitása nem adja át az ügyet; a Pipeline-ba az értékesítő lépteti.</p>
            <CompanyColumn
              tone="success"
              icon={ArrowRightCircle}
              title="Minősített cégek"
              count={companiesReady ? qualified.length : null}
              empty={companiesReady ? "Nincs minősített cég átadásra." : "Az összesítő nem igazolt."}
              items={qualified.slice(0, 6)}
              tab="sales-note"
            />
          </WorkspacePanel>

          <section className="min-w-0 overflow-hidden rounded-lg border bg-card">
            <SectionHeader title="Friss levélszálak" subtitle="Az utolsó 30 nap általad látható szálai." />
            <div className="p-4">
              {threadsQ.isLoading ? (
                <p role="status" className="text-sm text-muted-foreground">Levélszálak betöltése…</p>
              ) : threads.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {threadsQ.isSuccess && !threadsQ.isError ? "Nincs email az elmúlt 30 napban." : "A levéllista még nem igazolt."}
                </p>
              ) : (
                <ul className="divide-y">
                  {threads.slice(0, 8).map((t: any) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link to="/emails/$threadId" params={{ threadId: t.id }} className="min-w-0 flex-1 truncate text-primary hover:underline">
                        <Mail className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-muted-foreground" />
                        {t.subject ?? "(nincs tárgy)"}
                      </Link>
                      {t.company_id && (
                        <Link to="/customers/$id" params={{ id: t.company_id }} search={{ tab: "emails" }} className="hidden shrink-0 text-xs text-muted-foreground hover:text-primary sm:inline" title="A céghez tartozó levélszálak">
                          <Building2 className="inline h-3 w-3" /> cég
                        </Link>
                      )}
                      <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(t.last_message_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* ───────── 5. Eredmények közérthetően ───────── */}
        <section className="min-w-0 overflow-hidden rounded-lg border bg-card" aria-label="Marketing eredmények">
          <SectionHeader title="Eredmények röviden" subtitle="Tárolt CRM- és saját levelezési adatok alapján; nem teljes Gmail-történet." />
          <ul className="space-y-1 px-4 py-3 text-sm">
            {results.map((line) => <li key={line} className="flex gap-2"><CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />{line}</li>)}
          </ul>
          <div className="grid gap-px border-t bg-border sm:grid-cols-2 lg:grid-cols-4">
            <PerfTile label="Új cég · 7 nap" value={allReady ? newCompanies7 : "—"} />
            <PerfTile label="Új cég · ma" value={allReady ? newToday.length : "—"} />
            <PerfTile label="Ma Saleshez átadva" value={companiesReady ? handoffToday.length : "—"} />
            <PerfTile label="Elutasítva a kampányból" value={companiesReady ? pipeline.rejected : "—"} sub="összesen" />
          </div>
          <div className="grid grid-cols-2 gap-2 border-t p-4 sm:grid-cols-5">
            {(["new", "contacted", "qualified", "handoff", "rejected"] as const).map((k) => (
              <div key={k} className={`min-w-0 rounded-lg border p-3 ${MARKETING_STATUS_TONE[k]}`}>
                <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{MARKETING_STATUS_LABEL[k]}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums leading-none">{companiesReady ? pipeline[k] : "—"}</div>
                <div className="mt-1 text-[11px] opacity-70">
                  {k === "qualified" ? "átadásra vár" : k === "handoff" ? "Salesnek átadva · mentett állapot" : k === "contacted" ? "megkeresésként jelölve" : k === "rejected" ? "kampánylistából eltávolítva" : "aktív kampánylistán"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ───────── 6. Részletes napi listák (ritkán kell) ───────── */}
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Összes napi lista forrásonként</summary>
          {dailyQ.data && (
            <div className="border-t">
              {dailyQ.data.partial && <p className="p-3 text-sm text-muted-foreground">Részleges adatok; a lista nem teljes.</p>}
              <div className="grid gap-4 p-4 md:grid-cols-3">
                <DailyList
                  title="Közös visszahívások"
                  rows={dailyQ.data.callbacks
                    .filter((c) => c.callback_date && c.callback_date <= budapestDayBounds().end)
                    .map((c) => ({ id: c.id, companyId: c.company_id ?? "", name: `${c.company_name} · ${fmtDate(c.callback_date ?? undefined)}` }))}
                />
                {(["overdue", "today", "upcoming", "undated"] as const).map((bucket) => (
                  <DailyList
                    key={bucket}
                    title={{ overdue: "Lejárt saját utánkövetés", today: "Mai saját utánkövetés", upcoming: "Későbbi saját utánkövetés", undated: "Határidő nélküli saját utánkövetés" }[bucket]}
                    rows={dailyQ.data.followups.filter((f) => f.bucket === bucket).map((f) => ({
                      id: f.id, companyId: f.company_id ?? "", tab: "followups" as const,
                      name: `${f.company_name} · ${f.followup_type === "call" ? "Telefon" : "Utánkövetés"} · ${fmtDate(f.due_date ?? undefined)}`,
                    }))}
                  />
                ))}
                <DailyList
                  title="Saját nyitott feladatok"
                  rows={dailyQ.data.tasks.map((t) => ({
                    id: t.id,
                    name: `${t.title} · ${{ overdue: "Lejárt", today: "Ma", upcoming: "Későbbi", undated: "Határidő nélkül" }[t.bucket]} · ${fmtDate(t.due_date ?? undefined)}`,
                  }))}
                />
                <DailyList title="Hiányzó kapcsolattartási adat" rows={dailyQ.data.missing_contacts.map((c) => ({ ...c, companyId: c.id, tab: "contacts" as const }))} />
                <DailyList title="Új kampánycégek feldolgozása" rows={dailyQ.data.to_contact.map((c) => ({ id: c.id, name: c.name, companyId: c.id }))} />
                <DailyList title="Válaszra reagálni" rows={dailyQ.data.reply_pending.map((c) => ({ id: c.id, name: c.name, companyId: c.id, tab: "emails" as const }))} />
                <DailyList title="Tárolt megkeresés válasz nélkül" rows={dailyQ.data.awaiting_reply.map((c) => ({ id: c.id, name: c.name, companyId: c.id, tab: "emails" as const }))} />
                <DailyList
                  title="Ellenőrizendő emailadat"
                  rows={dailyQ.data.contact_warnings.map((c) => ({
                    id: c.id, companyId: c.id, tab: "contacts" as const,
                    name: `${c.name} · ${c.contact_state.blocked_email ? "Tiltott email" : c.contact_state.invalid_email ? "Hibás email" : "Hiányos tiltásellenőrzés"}${c.contact_state.phone_available ? " · Telefon megadva" : ""}`,
                  }))}
                />
                <DailyList title="Ma felvett új cégek" rows={newToday.slice(0, 20).map((c) => ({ id: c.id, name: c.name, companyId: c.id }))} />
              </div>
              <p className="px-4 pb-3 text-xs text-muted-foreground">Saját tárolt postafiókadatok; a válaszhiány és a levél tartalma ellenőrizendő.</p>
            </div>
          )}
        </details>

        {loading && <p className="text-center text-xs text-muted-foreground">Adatok betöltése…</p>}
      </div>
    </div>
  );
}

const TONE_CLASS: Record<"muted" | "info" | "warning" | "success", string> = {
  muted: "border-border text-muted-foreground",
  info: "border-[color:var(--status-info)]/40 text-[color:var(--status-info)]",
  warning: "border-[color:var(--status-warning)]/40 text-[color:var(--status-warning)]",
  success: "border-[color:var(--status-success)]/40 text-[color:var(--status-success)]",
};

const KIND_TONE: Partial<Record<MarketingPriorityRow["kind"], string>> = {
  reply: "text-[color:var(--status-info)]",
  "followup-overdue": "text-destructive",
  "task-overdue": "text-destructive",
  callback: "text-[color:var(--status-warning)]",
  "handoff-ready": "text-[color:var(--status-success)]",
};

function KindBadge({ row }: { row: MarketingPriorityRow }) {
  return <span className={cn("text-sm font-medium", KIND_TONE[row.kind])}>{row.label}</span>;
}

/** A napi sor célja: cégadatlap a megfelelő fülön, saját feladatok vagy a kampányok. Button asChild-hoz továbbítja a propokat. */
function TargetLink({
  dest,
  children,
  ...rest
}: { dest: MarketingTarget | { kind: "campaigns" }; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href" | "target">) {
  if (dest.kind === "company") {
    return (
      <Link {...rest} to="/customers/$id" params={{ id: dest.companyId }} search={dest.tab ? { tab: dest.tab } : {}}>
        {children}
      </Link>
    );
  }
  if (dest.kind === "tasks") return <Link {...rest} to="/tasks">{children}</Link>;
  return <Link {...rest} to="/campaign-list">{children}</Link>;
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2 border-b px-4 py-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function CompanyColumn({
  tone,
  icon: Icon,
  title,
  count,
  empty,
  items,
  tab,
}: {
  tab?: CompanyTab;
  tone: "danger" | "warning" | "info" | "success";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number | null;
  empty: string;
  items: {
    id: string;
    name: string;
    meta: { status: MarketingStatus; statusDate: string | null };
  }[];
}) {
  const toneText =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-[color:var(--status-warning)]"
        : tone === "success"
          ? "text-[color:var(--status-success)]"
          : "text-[color:var(--status-info)]";
  return (
    <div className="bg-card p-4">
      <div className="mb-2 flex items-center justify-between rounded-md px-1 py-1 -mx-1">
        <div
          className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider ${toneText}`}
        >
          <Icon className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
        <Badge
          variant="outline"
          className={`tabular-nums ${count != null && count > 0 ? `border-current ${toneText}` : ""}`}
        >
          {count ?? "—"}
        </Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id}>
              <Link
                to="/customers/$id"
                params={{ id: it.id }}
                search={tab ? { tab } : {}}
                className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-muted/40"
              >
                <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {MARKETING_STATUS_LABEL[it.meta.status]}
                    {it.meta.statusDate && ` · ${it.meta.statusDate}`}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {count != null && count > items.length && (
        <p className="mt-2 text-[11px] text-muted-foreground">+ még {count - items.length} elem</p>
      )}
    </div>
  );
}

function PerfTile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("hu-HU", { month: "short", day: "numeric" });
}

// Note: a marketing home a leadek táblát SZÁNDÉKOSAN nem kérdezi le.
// A marketing kizárólag company + contact + email szinten dolgozik;
// a leadek a sales pipeline saját adatai.
function DailyList({
  title,
  rows,
}: {
  title: string;
  rows: { id: string; companyId?: string; name: string; tab?: CompanyTab }[];
}) {
  const [page, setPage] = useState(0);
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 5) - 1));
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nincs látható tétel.</p>
      ) : (
        <ul className="space-y-2">
          {rows.slice(currentPage * 5, currentPage * 5 + 5).map((row) => (
            <li key={row.id}>
              {row.companyId ? (
                <Link
                  to="/customers/$id"
                  params={{ id: row.companyId }}
                  search={row.tab ? { tab: row.tab } : {}}
                  className="text-sm text-primary hover:underline"
                >
                  {row.name}
                </Link>
              ) : (
                <Link to="/tasks" className="text-sm text-primary hover:underline">
                  {row.name}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {rows.length > 5 && (
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Előző
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={(currentPage + 1) * 5 >= rows.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Következő
          </Button>
        </div>
      )}
    </div>
  );
}
