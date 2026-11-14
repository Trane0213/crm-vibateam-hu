/**
 * Tulajdonosi „Mai vezetői munka” — napi munkafelület.
 *
 * Egy prioritásos teendőlista a meglévő, jogosult adatokból (`owner-day-flow.ts`):
 * azonnali döntés → ajánlat/szerződés → kritikus projektek → elmaradt teendők →
 * dolgozói jelzések → George/AI-jelzések. Minden tételnél látszik a forrás és egy
 * gomb a valódi Sales/Marketing/PM rekordhoz. A nézet NEM ír adatot, nem dönt,
 * nem küld; pénzügyi és szerződés-jóváhagyási adatkapcsolat nincs — ezt kiírja.
 */
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertOctagon, AlertTriangle, ArrowUpRight, Bell, Bot, Briefcase, CheckCircle2, CircleDashed, FileText,
  Inbox, Landmark, Loader2, PlugZap, Send, ShieldAlert, XCircle,
} from "lucide-react";
import { WelcomeHeader } from "@/components/welcome-header";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { OwnerKpiStrip } from "@/components/dashboard/owner-kpi-strip";
import { WorkspacePanel } from "@/components/dashboard/workspace-panel";
import { PrimaryActionCard, SalesFlowMap } from "@/components/sales/sales-flow-ui";
import { NewQuoteButton } from "@/components/quotes/new-quote-button";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { cn } from "@/lib/utils";
import { allDailyRows } from "@/lib/sales/load-daily-work";
import { quoteAmounts } from "@/lib/quotes/amounts";
import { ACTIVE_PROJECT_STATUSES } from "@/lib/viba-constants";
import { ownerReportOverview } from "@/lib/owner-report/owner-report.functions";
import { budapestYmd } from "@/lib/pm/pm-day-flow";
import {
  OWNER_LANES, OWNER_LANE_LABEL, ownerFocus, ownerItems, ownerStages, todayBusiness, truncatedSections,
  type OwnerApproval, type OwnerItem, type OwnerLane, type OwnerLead, type OwnerLink, type OwnerProject,
  type OwnerQuote, type OwnerTask, type SourceState,
} from "@/lib/owner/owner-day-flow";

const PROJECT_COLS = "id,title,status,company_id,deadline,project_manager_user_id,handoff_payload";
const fmt = (iso: string | null | undefined) => iso ? new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : null;
const stateOf = (q: { isSuccess: boolean; isError: boolean }): SourceState["state"] => q.isError ? "error" : q.isSuccess ? "ok" : "loading";

export function OwnerHome({ lane, onLane }: { lane?: OwnerLane; onLane?: (lane: OwnerLane | undefined) => void }) {
  const { role } = usePermissions();
  const isOwner = role === "owner";
  if (!isOwner) {
    return <div className="p-6"><p role="alert" className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">A vezetői napi munkafelület csak Tulajdonos szerepkörrel érhető el.</p></div>;
  }
  return <OwnerDay lane={lane} onLane={onLane} />;
}

function OwnerDay({ lane, onLane }: { lane?: OwnerLane; onLane?: (lane: OwnerLane | undefined) => void }) {
  const overview = useServerFn(ownerReportOverview);
  // Ugyanaz a kulcs és tényforrás, mint a George-jelentés oldalon (AI nélkül, írás nélkül).
  const factsQ = useQuery({ queryKey: ["owner-report", "daily"], queryFn: () => overview({ data: { kind: "daily" } }), staleTime: 60_000 });

  const projectsQ = useQuery({
    queryKey: ["projects", "owner-day", "active"],
    queryFn: () => allDailyRows<OwnerProject>((f, t) => supabase.from("projects").select(PROJECT_COLS).in("status", ACTIVE_PROJECT_STATUSES as unknown as string[]).order("id").range(f, t)),
  });
  const tasksQ = useQuery({
    queryKey: ["tasks", "owner-day", "open"],
    queryFn: () => allDailyRows<OwnerTask>((f, t) => supabase.from("tasks").select("id,title,status,priority,due_date,project_id,assigned_user").or("status.is.null,status.not.in.(done,completed,cancelled)").order("id").range(f, t)),
  });
  const dealsQ = useQuery({
    queryKey: ["leads", "owner-day", "deals"],
    queryFn: async () => {
      const leads = await allDailyRows<OwnerLead>((f, t) => supabase.from("leads").select("id,status,summary,company_id,contact_id,assigned_to,next_step_due_at,pipeline_entered_at").not("status", "in", "(won,lost)").order("id").range(f, t));
      type RawQuote = { id: string; lead_id: string | null; project_id: string | null; title: string | null; status: string | null; is_current: boolean | null; updated_at: string | null; total_amount: number | null; manual_net_amount: number | null; tax_percent: number | null; quote_items?: { count: number }[] };
      const cols = "id,lead_id,project_id,title,status,is_current,updated_at,total_amount,manual_net_amount,tax_percent,quote_items(count)";
      const raw: RawQuote[] = [];
      for (let i = 0; i < leads.length; i += 100) {
        raw.push(...await allDailyRows<RawQuote>((f, t) => supabase.from("quotes").select(cols).in("lead_id", leads.slice(i, i + 100).map((l) => l.id)).in("status", ["accepted", "ready"]).order("id").range(f, t)));
      }
      // Projekthez kötött (lead nélküli) küldésre kész ajánlatok is látszanak.
      raw.push(...await allDailyRows<RawQuote>((f, t) => supabase.from("quotes").select(cols).is("lead_id", null).eq("status", "ready").order("id").range(f, t)));
      const quotes: OwnerQuote[] = raw.map((q) => ({ ...q, net: quoteAmounts({ itemCount: Number(q.quote_items?.[0]?.count ?? 0), totalAmount: q.total_amount, manualNetAmount: q.manual_net_amount, taxPercent: q.tax_percent }).net }));
      return { leads, quotes };
    },
  });
  const approvalsQ = useQuery({
    queryKey: ["ai-approvals", "owner-day"],
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_run_steps").select("id,tool_name,agent_id,approval_expires_at,created_at")
        .eq("approval_status", "pending").gt("approval_expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as OwnerApproval[];
    },
    staleTime: 30_000,
  });

  // Nevek: csak a szükséges cégek; munkatársak a meglévő users_profile_lookup nézetből (nem users_profile select *).
  const companyIds = useMemo(() => [...new Set([
    ...(dealsQ.data?.leads ?? []).map((l) => l.company_id), ...(projectsQ.data ?? []).map((p) => p.company_id ?? null),
  ].filter((x): x is string => !!x))].sort(), [dealsQ.data, projectsQ.data]);
  const companiesQ = useQuery({
    queryKey: ["companies", "owner-day", companyIds.join(",")],
    enabled: companyIds.length > 0,
    queryFn: async () => {
      const out = new Map<string, string>();
      for (let i = 0; i < companyIds.length; i += 150) {
        const { data, error } = await supabase.from("companies").select("id,name").in("id", companyIds.slice(i, i + 150));
        if (error) throw error;
        for (const c of data ?? []) out.set(c.id, c.name);
      }
      return out;
    },
  });
  const peopleQ = useQuery({
    queryKey: ["users_profile_lookup", "owner-day"],
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile_lookup").select("id,auth_user_id,full_name").limit(500);
      if (error) throw error;
      const out = new Map<string, string>();
      for (const p of data ?? []) if (p.full_name) { if (p.auth_user_id) out.set(p.auth_user_id, p.full_name); if (p.id) out.set(p.id, p.full_name); }
      return out;
    },
    staleTime: 300_000,
  });

  const sources: SourceState[] = [
    { key: "facts", label: "Értesítések, hibajegyek, elmaradt teendők, AI-jelzések", state: stateOf(factsQ) },
    { key: "projects", label: "Aktív projektek és nyitott feladatok", state: projectsQ.isError || tasksQ.isError ? "error" : projectsQ.isSuccess && tasksQ.isSuccess ? "ok" : "loading" },
    { key: "deals", label: "Nyitott ügyek és ajánlatok", state: stateOf(dealsQ) },
    { key: "approvals", label: "Saját, jóváhagyásra váró AI-műveletek", state: stateOf(approvalsQ) },
    { key: "finance", label: "Számla, befizetés, bank, Billingo", state: "not_connected", note: "Nincs adatkapcsolat a CRM-ben." },
    { key: "contract", label: "Szerződés-jóváhagyás, e-aláírás", state: "not_connected", note: "Nincs külön adatmodell; a Megnyertük lépés a Pipeline-ban van." },
  ];

  const facts = factsQ.data?.facts ?? null;
  const items = useMemo(() => ownerItems({
    facts,
    projects: projectsQ.data ?? [], tasks: tasksQ.isSuccess ? tasksQ.data : [],
    leads: dealsQ.data?.leads ?? [], quotes: dealsQ.data?.quotes ?? [], approvals: approvalsQ.data ?? [],
    companyName: (id) => (id ? companiesQ.data?.get(id) ?? null : null),
    personName: (id) => (id ? peopleQ.data?.get(id) ?? null : null),
  }), [facts, projectsQ.data, tasksQ.data, tasksQ.isSuccess, dealsQ.data, approvalsQ.data, companiesQ.data, peopleQ.data]);
  const focus = ownerFocus(items, sources);
  const allReady = sources.every((s) => s.state !== "loading");
  const stages = ownerStages(items, allReady);
  const visible = lane ? items.filter((i) => i.lane === lane) : items;
  const failed = sources.filter((s) => s.state === "error");
  const retry = () => { factsQ.refetch(); projectsQ.refetch(); tasksQ.refetch(); dealsQ.refetch(); approvalsQ.refetch(); };
  const [showAll, setShowAll] = useState(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const shown = showAll ? visible : visible.slice(0, 25);

  return (
    <div className="crm-today flex flex-col">
      <WelcomeHeader title="Mai vezetői munka" subtitle="Döntések, kritikus projektek, elmaradt teendők és jelzések — forrással, a valódi rekordhoz vezető gombbal. Budapest idő szerint." />
      <div className="flex flex-col gap-4 px-4 pb-6 pt-3 sm:px-6">
        {failed.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Nem tölthető be: {failed.map((s) => s.label).join("; ")}. A lista ezek nélkül nem teljes, a mentett adatok nem vesztek el.
            <Button size="sm" variant="outline" onClick={retry}>Újrapróbálás</Button>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
          <FocusCard focus={focus} onRetry={retry} />
          <GeorgeCard q={factsQ} approvals={approvalsQ.data?.length ?? null} />
        </div>

        <SalesFlowMap stages={stages} label="Tulajdonosi napi munkafolyamat" />

        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
          <WorkspacePanel title="Mai teendők prioritás szerint" subtitle="Azonnali döntés → ajánlat/szerződés → kritikus projekt → elmaradt teendő → dolgozói jelzés → AI-jelzés. Átfedő tételek egyszer szerepelnek.">
            <div className="flex flex-wrap gap-1.5 border-b px-3 py-2" role="group" aria-label="Szűrés munkaterület szerint">
              <Button size="sm" variant={!lane ? "default" : "outline"} onClick={() => onLane?.(undefined)}>Mind ({allReady ? items.length : "…"})</Button>
              {OWNER_LANES.map((l) => (
                <Button key={l} size="sm" variant={lane === l ? "default" : "outline"} onClick={() => onLane?.(l)}>
                  {OWNER_LANE_LABEL[l]} ({allReady ? items.filter((i) => i.lane === l).length : "…"})
                </Button>
              ))}
            </div>
            {!allReady && !items.length ? (
              <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />Teendők összeállítása…</div>
            ) : !visible.length ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4 text-[color:var(--status-success)]" />
                {failed.length ? "A betöltött forrásokban nincs teendő — a hiányzó források miatt ez nem teljes kép." : lane ? `Nincs tétel: ${OWNER_LANE_LABEL[lane]}.` : "Nincs nyitott tulajdonosi teendő a betöltött forrásokban."}
              </p>
            ) : (
              <ul className="divide-y">{shown.map((it) => <ItemRow key={it.key} item={it} />)}</ul>
            )}
            {visible.length > shown.length && <div className="border-t p-3"><Button size="sm" variant="outline" onClick={() => setShowAll(true)}>További {visible.length - shown.length} tétel</Button></div>}
            {truncatedSections(facts).length > 0 && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                Részleges: {truncatedSections(facts).map((s) => `${s.title} — ${s.shown}/${s.total}`).join("; ")}. A teljes lista: <Link to="/owner-report" className="text-primary underline-offset-2 hover:underline">George jelentése → Tények</Link>.
              </p>
            )}
          </WorkspacePanel>

          <div className="flex min-w-0 flex-col gap-4">
            <TodayBusinessPanel facts={facts} loading={factsQ.isPending} error={factsQ.isError} />
            <FinancePanel />
            <SourcesPanel sources={sources} />
            <WorkspacePanel title="Gyors műveletek">
              <div className="grid grid-cols-2 gap-2 p-3 text-xs">
                <div className="[&>button]:h-full [&>button]:w-full [&>button]:whitespace-normal"><NewQuoteButton variant="outline" /></div>
                <QuickLink to="/notifications" icon={Bell}>Értesítések</QuickLink>
                <QuickLink to="/web-quote-requests" icon={Inbox}>Webes kérések</QuickLink>
                <QuickLink to="/sales/leads" icon={FileText}>Pipeline</QuickLink>
                <QuickLink to="/projects" icon={Briefcase}>Projektek</QuickLink>
                <QuickLink to="/campaign-list" icon={Send}>Kampányok</QuickLink>
              </div>
            </WorkspacePanel>
          </div>
        </div>

        <section aria-label="Összesített számok" className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div><h2 className="font-display text-base font-semibold">Összesített számok</h2><p className="text-xs text-muted-foreground">Ugyanaz a definíció, mint a Vezetői részletek oldalon.</p></div>
            <Button asChild size="sm" variant="outline"><Link to="/dashboard" search={{ period: "30" }}>Vezetői részletek<ArrowUpRight className="h-4 w-4" /></Link></Button>
          </div>
          <OwnerKpiStrip overview />
        </section>

        <details className="border-t pt-3" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) setBriefingOpen(true); }}>
          <summary className="cursor-pointer text-sm font-semibold">Napi AI-briefing (Sales / PM)</summary>
          <p className="pt-1 text-xs text-muted-foreground">Csak kinyitáskor indul; AI-hívással jár, és csak a mai napi keretből.</p>
          {briefingOpen && <div className="pt-3"><DailyBriefing /></div>}
        </details>
      </div>
    </div>
  );
}

function LinkButton({ link, children, variant = "outline", className }: { link: OwnerLink | null; children: React.ReactNode; variant?: "default" | "outline"; className?: string }) {
  if (!link) return null;
  return <Button asChild size="sm" variant={variant} className={className}><Link to={link.to as "/today"} search={(link.search ?? {}) as never}>{children}</Link></Button>;
}

function FocusCard({ focus, onRetry }: { focus: ReturnType<typeof ownerFocus>; onRetry: () => void }) {
  if (focus.state === "loading") return <div className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" />A mai első teendő összeállítása…</div>;
  if (focus.state === "error") return <div role="alert" className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Egyik adatforrás sem tölthető be, ezért nem állítható össze a mai teendő.<Button size="sm" variant="outline" className="ml-2" onClick={onRetry}>Újrapróbálás</Button></div>;
  if (focus.state === "calm") return <PrimaryActionCard eyebrow={focus.partial ? "Nem teljes kép" : "Ma nincs sürgős vezetői teendő"} title={focus.partial ? "A betöltött forrásokban nincs teendő" : "Nincs nyitott döntés, kritikus projekt vagy elmaradt teendő"} detail={focus.partial ? "Néhány forrás nem töltődött be; ellenőrizd a hibasávot." : "Az összesített számokat és a George-jelentést lent éred el."} />;
  const { item } = focus;
  return (
    <PrimaryActionCard
      eyebrow={`Most ezzel kezdj · ${OWNER_LANE_LABEL[item.lane]}${focus.partial ? " · nem teljes kép" : ""}`}
      title={item.title}
      detail={[item.detail, `Forrás: ${item.source}`, item.who ? `Felelős: ${item.who}` : null].filter(Boolean).join(" · ")}
      warnings={item.warnings}
      action={<>
        <LinkButton link={item.link} variant="default">{item.button}</LinkButton>
        {focus.more > 0 && <span className="self-center text-xs text-muted-foreground">+{focus.more} további teendő lent</span>}
      </>}
    />
  );
}

function GeorgeCard({ q, approvals }: { q: { data?: { hash: string; reports: unknown[] }; isPending: boolean; isError: boolean }; approvals: number | null }) {
  type Row = { status: string; created_at: string; facts_hash: string };
  const reports = (q.data?.reports ?? []) as Row[];
  const latest = reports.find((r) => r.status === "ok");
  const today = budapestYmd(new Date());
  const status = q.isPending ? "Betöltés…" : q.isError ? "A George-jelentés állapota nem elérhető."
    : !latest ? "Még nem készült napi George-jelentés."
    : `Legutóbbi napi jelentés: ${fmt(latest.created_at)}${budapestYmd(latest.created_at) !== today ? " (nem mai)" : ""} · ${latest.facts_hash === q.data?.hash ? "a tények azóta nem változtak" : "a tények azóta változtak"}`;
  return (
    <section aria-label="George" className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-sm font-semibold"><Bot className="h-4 w-4 text-primary" />George — jelentés és vizsgálatok</div>
      <p className="mt-1 text-xs text-muted-foreground">{status}</p>
      <p className="mt-1 text-xs text-muted-foreground">George csak olvas és javasol, önállóan nem hajt végre semmit. Az új jelentés és a célzott vizsgálat fizetős AI-hívás, csak megerősítéssel indul.</p>
      {approvals != null && approvals > 0 && <p className="mt-1 text-xs font-medium text-[color:var(--status-warning)]">{approvals} saját AI-művelet vár a döntésedre.</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Button asChild size="sm" variant="outline"><Link to="/owner-report"><ShieldAlert />George jelentése</Link></Button>
        <Button asChild size="sm" variant="outline"><Link to="/settings/ai-review">AI-felülvizsgálat</Link></Button>
        <Button asChild size="sm" variant="ghost"><Link to="/ai-assistant" search={{ agent: "crm" } as never}>Kérdés George-nak</Link></Button>
      </div>
    </section>
  );
}

const SEVERITY_ICON = { critical: AlertOctagon, warning: AlertTriangle, info: CircleDashed } as const;
function ItemRow({ item }: { item: OwnerItem }) {
  const Icon = SEVERITY_ICON[item.severity];
  return (
    <li className="grid gap-2 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start">
      <Icon aria-hidden className={cn("hidden h-4 w-4 sm:mt-0.5 sm:block", item.severity === "critical" ? "text-destructive" : item.severity === "warning" ? "text-[color:var(--status-warning)]" : "text-muted-foreground")} />
      <div className="min-w-0">
        <p className="break-words text-sm font-medium">{item.title}</p>
        {item.detail && <p className="break-words text-xs text-muted-foreground">{item.detail}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="font-normal">{OWNER_LANE_LABEL[item.lane]}</Badge>
          <span>Forrás: {item.source}</span>
          {item.who && <span>· Felelős: {item.who}</span>}
          {item.at && <span>· {fmt(item.at)}</span>}
        </p>
        {item.warnings.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-[color:var(--status-warning)]">{item.warnings.map((w) => <li key={w} className="flex items-start gap-1"><AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />{w}</li>)}</ul>}
      </div>
      <LinkButton link={item.link} className="w-full sm:w-auto">{item.button}</LinkButton>
    </li>
  );
}

function TodayBusinessPanel({ facts, loading, error }: { facts: Parameters<typeof todayBusiness>[0]; loading: boolean; error: boolean }) {
  const b = todayBusiness(facts);
  const partial = b.total != null && b.total > b.items.length;
  return (
    <WorkspacePanel title="Ma történt" subtitle="Mentett események a mai budapesti napon">
      {loading ? <p className="p-4 text-sm text-muted-foreground" role="status">Betöltés…</p>
        : error ? <p className="p-4 text-sm text-muted-foreground">Nem elérhető.</p>
        : <ul className="divide-y text-sm">
          {([["Megnyert ügy", b.won, "/sales/leads"], ["Elveszett ügy", b.lost, "/leads/lost"], ["Igazoltan kiküldött ajánlat", b.sent, "/quotes"], ["Új webes ajánlatkérés", b.web, "/web-quote-requests"]] as const).map(([label, n, to]) => (
            <li key={label}><Link to={to} className="flex items-center justify-between gap-2 px-4 py-2 hover:bg-muted/40"><span>{label}</span><strong className="tabular-nums">{n}</strong></Link></li>
          ))}
          {partial && <li className="px-4 py-2 text-xs text-muted-foreground">Az első {b.items.length} esemény alapján ({b.total} összesen) — teljes lista a George-jelentés Tények részében.</li>}
        </ul>}
    </WorkspacePanel>
  );
}

function FinancePanel() {
  return (
    <WorkspacePanel title="Követelések és pénzügy">
      <div className="space-y-2 p-4 text-xs text-muted-foreground">
        <p className="flex items-start gap-2 font-medium text-foreground"><PlugZap className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-warning)]" />Nincs adatkapcsolat.</p>
        <p>A CRM-ben nincs számla-, befizetés-, bank- vagy Billingo-adat, ezért a kintlévőség és a pénz beérkezése innen nem állapítható meg.</p>
        <p>Az ajánlati és megnyert összegek nettó ajánlati értékek, nem kiszámlázott vagy befolyt összegek.</p>
      </div>
    </WorkspacePanel>
  );
}

function SourcesPanel({ sources }: { sources: SourceState[] }) {
  const icon = { ok: CheckCircle2, loading: Loader2, error: XCircle, not_connected: Landmark } as const;
  const text = { ok: "betöltve", loading: "betöltés…", error: "hiba", not_connected: "nincs adatkapcsolat" } as const;
  return (
    <WorkspacePanel title="Adatforrások" subtitle="Miből áll össze a lista (a saját jogosultságoddal)">
      <ul className="divide-y text-xs">
        {sources.map((s) => { const I = icon[s.state]; return (
          <li key={s.key} className="flex items-start gap-2 px-4 py-2">
            <I aria-hidden className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", s.state === "ok" ? "text-[color:var(--status-success)]" : s.state === "error" ? "text-destructive" : s.state === "loading" ? "animate-spin text-muted-foreground" : "text-muted-foreground")} />
            <span className="min-w-0 flex-1">{s.label}<span className={cn("block", s.state === "error" ? "text-destructive" : "text-muted-foreground")}>{text[s.state]}{s.note ? ` — ${s.note}` : ""}</span></span>
          </li>
        ); })}
      </ul>
    </WorkspacePanel>
  );
}

function QuickLink({ to, icon: Icon, children }: { to: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return <Button asChild variant="outline" className="h-auto flex-col gap-2 py-4 text-xs"><Link to={to as "/today"}><Icon />{children}</Link></Button>;
}

