import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mail, Radar, BookOpen, ListPlus, Building2, ArrowRightCircle, Sparkles, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WelcomeHeader } from "@/components/welcome-header";
import { QuickActions } from "@/components/today/today-shell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  MARKETING_STATUS_LABEL, MARKETING_STATUS_TONE,
  type MarketingStatus,
} from "@/lib/marketing-status";
import { readMarketingHomeCompanies, countMarketingHomeEmails, marketingHomeSummary } from '@/lib/marketing-home-read';
import { getMarketingDaily } from '@/lib/marketing-daily.functions';
import { budapestDayBounds } from '@/lib/owner-kpis';
import { usePermissions } from '@/hooks/use-permissions';

const isoStartOfDay = () => budapestDayBounds().start;
const isoWeekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); };
const isoMonthAgo = () => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString(); };

export function MarketingHome() {
  const {profile}=usePermissions();
  const dailyQ=useQuery({queryKey:['mkt-home','daily','tasks','followups','phone_calls',profile?.auth_user_id],queryFn:()=>getMarketingDaily(),enabled:!!profile?.auth_user_id});
  const todayStart = isoStartOfDay();
  const weekAgo = isoWeekAgo();
  const monthAgo = isoMonthAgo();

  // A marketing univerzum egységes definíciója: minden olyan cég ide
  // tartozik, amelyen a marketing workflow nyomot hagyott a notes-ban.
  // A company_type itt NEM workflow-feltétel. Lásd: src/lib/marketing-universe.ts
  const companiesQ = useQuery({
    queryKey: ["mkt-home", "marketing-companies"],
    queryFn: async () => {
      return readMarketingHomeCompanies(supabase, { marketing: true });
    },
  });

  // „Új cég" számláló forrása: MINDEN cég, függetlenül attól, hogy
  // Scarlet, marketing workflow, vagy manuálisan került be. Egy cég egy cég.
  // A marketing markerek csak a pipeline-státuszt mutatják, nem a beszámolást.
  const allCompaniesQ = useQuery({
    queryKey: ["mkt-home", "all-companies-30d"],
    queryFn: async () => {
      return readMarketingHomeCompanies(supabase, { since: monthAgo });
    },
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
    queryFn: async () => {
      return countMarketingHomeEmails(supabase, monthAgo, weekAgo);
    },
  });

  const companies = companiesQ.data ?? [];
  const threads   = threadsQ.data ?? [];

  // Marketing státusz dekorálás a notes-ból.
  const localDay = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Budapest' }).format(new Date(iso));
  const { decorated, newToday, handoffToday, newCompanies7, newCompanies30, handoff30 } = marketingHomeSummary(companies, allCompaniesQ.data ?? [], {
    today: todayStart, week: weekAgo, todayDay: localDay(todayStart), monthDay: localDay(monthAgo),
  });
  const byStatus = (s: MarketingStatus) => decorated.filter((c) => c.meta.status === s);

  const pipeline: Record<MarketingStatus, number> = {
    new:       byStatus("new").length,
    contacted: byStatus("contacted").length,
    qualified: byStatus("qualified").length,
    handoff:   byStatus("handoff").length,
    rejected:  byStatus("rejected").length,
  };

  const qualified  = byStatus("qualified");
  const companiesReady = companiesQ.isSuccess && !companiesQ.isError;
  const allReady = allCompaniesQ.isSuccess && !allCompaniesQ.isError;
  const replied7 = dailyQ.isError || dailyQ.data?.partial ? null : dailyQ.data?.mail.rate;

  const loading = companiesQ.isLoading || allCompaniesQ.isLoading || threadsQ.isLoading || emailsQ.isLoading;

  return (
    <div className="crm-today flex flex-col">
      <WelcomeHeader title="Mai marketingmunka" subtitle="Kampánycégek, megkeresések és átadásra váró ügyek." />

      <QuickActions>
        <Button size="sm" variant="default" asChild><Link to="/campaign-list"><ListPlus className="mr-1 h-3.5 w-3.5" />Kampánylista</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/emails"><Mail className="mr-1 h-3.5 w-3.5" />Levelek</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/web-quote-requests"><Mail className="mr-1 h-3.5 w-3.5" />Webes érdeklődések</Link></Button>
        <Button size="sm" variant="ghost" asChild><Link to="/data-quality"><Radar className="mr-1 h-3.5 w-3.5" />Adatellenőrzés</Link></Button>

        <Button size="sm" variant="ghost" asChild><Link to="/help/marketing"><BookOpen className="mr-1 h-3.5 w-3.5" />Marketing súgó</Link></Button>
      </QuickActions>

      <div className="space-y-4 p-6 pt-3">
        {(companiesQ.isError || allCompaniesQ.isError || emailsQ.isError || threadsQ.isError) && <p role="alert" className="text-sm text-destructive">Egyes marketingadatok nem tölthetők be teljesen; az érintett összesítők nem igazoltak.</p>}
        {dailyQ.isError && <p role="alert" className="text-sm text-destructive">A napi marketingfeladatok nem tölthetők be.</p>}
        {dailyQ.data && <section className="border-y">
          <SectionHeader title="Mai marketingfeladatok" />
          {dailyQ.data.partial && <p className="p-3 text-sm text-muted-foreground">Részleges adatok; a lista nem teljes.</p>}
          <div className="grid gap-4 p-4 md:grid-cols-3">
            <DailyList title="Közös visszahívások" rows={dailyQ.data.callbacks.filter(c=>c.callback_date && c.callback_date<=budapestDayBounds().end).map(c=>({id:c.id,companyId:c.company_id??'',name:`${c.company_name} · ${fmtDate(c.callback_date??undefined)}`}))}/>
            {(['overdue','today','upcoming','undated'] as const).map(bucket=><DailyList key={bucket} title={{overdue:'Lejárt saját utánkövetés',today:'Mai saját utánkövetés',upcoming:'Későbbi saját utánkövetés',undated:'Határidő nélküli saját utánkövetés'}[bucket]} rows={dailyQ.data.followups.filter(f=>f.bucket===bucket).map(f=>({id:f.id,companyId:f.company_id??'',name:`${f.company_name} · ${f.followup_type==='call'?'Telefon':'Utánkövetés'} · ${fmtDate(f.due_date??undefined)}`}))}/>)}
            <DailyList title="Saját nyitott feladatok" rows={dailyQ.data.tasks.map(t=>({id:t.id,name:`${t.title} · ${{overdue:'Lejárt',today:'Ma',upcoming:'Későbbi',undated:'Határidő nélkül'}[t.bucket]} · ${fmtDate(t.due_date??undefined)}`}))}/>
            <DailyList title="Hiányzó kapcsolattartási adat" rows={dailyQ.data.missing_contacts.map(c=>({...c,companyId:c.id}))}/>
            <DailyList title="Új kampánycégek feldolgozása" rows={dailyQ.data.to_contact.map(c=>({...c,companyId:c.id}))}/>
            <DailyList title="Válaszra reagálni" rows={dailyQ.data.reply_pending.map(c=>({...c,companyId:c.id}))} />
            <DailyList title="Tárolt megkeresés válasz nélkül" rows={dailyQ.data.awaiting_reply.map(c=>({...c,companyId:c.id}))} />
            <DailyList title="Ellenőrizendő emailadat" rows={dailyQ.data.contact_warnings.map(c=>({id:c.id,companyId:c.id,name:`${c.name} · ${c.contact_state.blocked_email?'Tiltott email':c.contact_state.invalid_email?'Hibás email':'Hiányos tiltásellenőrzés'}${c.contact_state.phone_available?' · Telefon megadva':''}`}))} />
          </div>
          <p className="px-4 pb-3 text-xs text-muted-foreground">Saját tárolt postafiókadatok; a válaszhiány és a levél tartalma ellenőrizendő.</p>
        </section>}
        {/* ───────── 1. Marketing minősítési pipeline ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Marketing pipeline"
            subtitle="Cégek állapota a kampánylistán. Lead csak manuális átadásból jön létre." />
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-5">
            {(["new","contacted","qualified","handoff","rejected"] as const).map((k) => (
              <div
                key={k}
                className={`min-w-0 rounded-lg border p-3 ${MARKETING_STATUS_TONE[k]}`}
              >
                <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{MARKETING_STATUS_LABEL[k]}</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums leading-none">{companiesReady ? pipeline[k] : '—'}</div>
                <div className="mt-1 text-[11px] opacity-70">
                  {k === "qualified" ? "átadásra vár"
                    : k === "handoff" ? "sales pipeline-ban"
                    : k === "contacted" ? "megkeresésként jelölve"
                    : k === "rejected" ? "kampánylistából eltávolítva"
                    : "aktív kampánylistán"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ───────── 2. Mai cselekvési listák ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Mai prioritás" subtitle="Kattints egy sorra a marketing munkafelületre." />
          <div className="grid gap-px bg-border md:grid-cols-3">
            <CompanyColumn
              tone="success"
              icon={ArrowRightCircle}
              title="Átadásra váró cégek"
              count={companiesReady ? qualified.length : null}
              empty={companiesReady ? "Nincs minősített cég átadásra." : "Az összesítő még nem igazolt."}
              items={qualified.slice(0, 6)}
            />
            <CompanyColumn
              tone="info"
              icon={Sparkles}
              title="Új cégek (ma)"
              count={allReady ? newToday.length : null}
              empty={allReady ? "Ma még nem került fel új cég." : "Az összesítő még nem igazolt."}
              items={newToday.slice(0, 6)}
            />
            <CompanyColumn
              tone="success"
              icon={Building2}
              title="Ma átadva"
              count={companiesReady ? handoffToday.length : null}
              empty={companiesReady ? "Ma még nem adtál át céget." : "Az összesítő még nem igazolt."}
              items={handoffToday.slice(0, 6)}
            />
          </div>
        </section>

        {/* ───────── 3. Email aktivitás ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Friss email szálak" subtitle="Az utolsó 30 nap aktív szálai." />
          <div className="p-4">
            {threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">{threadsQ.isSuccess && !threadsQ.isError ? 'Nincs email az elmúlt 30 napban.' : 'A levéllista még nem igazolt.'}</p>
            ) : (
              <ul className="divide-y">
                {threads.slice(0, 8).map((t: any) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link
                      to="/emails/$threadId" params={{ threadId: t.id }}
                      className="min-w-0 flex-1 truncate text-primary hover:underline"
                    >
                      <Mail className="mr-1 inline h-3.5 w-3.5 align-text-bottom text-muted-foreground" />
                      {t.subject ?? "(nincs tárgy)"}
                    </Link>
                    <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                      {(t.participants ?? []).slice(0, 2).join(", ")}
                    </span>
                    <span className="whitespace-nowrap text-xs text-muted-foreground">{fmtDate(t.last_message_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* ───────── 4. Marketing teljesítmény ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Marketing teljesítmény" subtitle="Heti és havi mérőszámok." />
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            <PerfTile label="Új cég · 7 nap" value={allReady ? newCompanies7 : '—'} />
            <PerfTile label="Új cég · 30 nap" value={allReady ? newCompanies30 : '—'} />
            <PerfTile label="Átadott cégek · 30 nap" value={companiesReady ? handoff30 : '—'} sub="átadott cég db" />
            <PerfTile label="Email aktivitás · 7 nap" value={emailsQ.isSuccess && !emailsQ.isError ? emailsQ.data : '—'} sub="tárolt email db" />
            <PerfTile label="Tárolt válaszarány · 7 nap" value={replied7 == null ? '—' : `${replied7}%`} sub={replied7 == null ? 'A saját tárolt levelezés aránya nem igazolt.' : `${dailyQ.data?.mail.replied ?? 0} külső válasz / ${dailyQ.data?.mail.contacted ?? 0} saját megkeresés · nem teljes Gmail-történet`} />
          </div>
        </section>

        {loading && (
          <p className="text-center text-xs text-muted-foreground">Adatok betöltése…</p>
        )}
      </div>
    </div>
  );
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
  tone, icon: Icon, title, count, empty, items,
}: {
  tone: "danger" | "warning" | "info" | "success";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number | null;
  empty: string;
  items: { id: string; name: string; meta: { status: MarketingStatus; statusDate: string | null } }[];
}) {
  const toneText =
    tone === "danger"  ? "text-destructive" :
    tone === "warning" ? "text-[color:var(--status-warning)]" :
    tone === "success" ? "text-[color:var(--status-success)]" :
                         "text-[color:var(--status-info)]";
  return (
    <div className="bg-card p-4">
      <div className="mb-2 flex items-center justify-between rounded-md px-1 py-1 -mx-1">
        <div className={`flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider ${toneText}`}>
          <Icon className="h-3.5 w-3.5" />
          <span>{title}</span>
        </div>
        <Badge variant="outline" className={`tabular-nums ${count != null && count > 0 ? `border-current ${toneText}` : ""}`}>{count ?? '—'}</Badge>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id}>
              <Link to="/customers/$id" params={{ id: it.id }}
                    className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-xs hover:bg-muted/40">
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
        <p className="mt-2 text-[11px] text-muted-foreground">
          + még {count - items.length} elem
        </p>
      )}
    </div>
  );
}

function PerfTile({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card p-4">
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
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
void Send;
function DailyList({title,rows}:{title:string;rows:{id:string;companyId?:string;name:string}[]}) {
  const [page,setPage]=useState(0);
  const currentPage=Math.min(page,Math.max(0,Math.ceil(rows.length/5)-1));
  return <div><h3 className="mb-2 text-sm font-semibold">{title} ({rows.length})</h3>{rows.length===0?<p className="text-xs text-muted-foreground">Nincs látható tétel.</p>:<ul className="space-y-2">{rows.slice(currentPage*5,currentPage*5+5).map(row=><li key={row.id}>{row.companyId?<Link to="/customers/$id" params={{id:row.companyId}} className="text-sm text-primary hover:underline">{row.name}</Link>:<Link to="/tasks" className="text-sm text-primary hover:underline">{row.name}</Link>}</li>)}</ul>}{rows.length>5&&<div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Előző</Button><Button size="sm" variant="ghost" disabled={(currentPage+1)*5>=rows.length} onClick={()=>setPage(currentPage+1)}>Következő</Button></div>}</div>;
}