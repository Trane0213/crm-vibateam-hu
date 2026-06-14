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
  readMarketingMeta, type MarketingStatus,
} from "@/lib/marketing-status";
import { selectMarketingCompanies } from "@/lib/marketing-universe";

const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoWeekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); };
const isoMonthAgo = () => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString(); };

export function MarketingHome() {
  const todayStart = isoStartOfDay();
  const weekAgo = isoWeekAgo();
  const monthAgo = isoMonthAgo();

  // A marketing univerzum egységes definíciója: minden olyan cég ide
  // tartozik, amelyen a marketing workflow nyomot hagyott a notes-ban.
  // A company_type itt NEM workflow-feltétel. Lásd: src/lib/marketing-universe.ts
  const companiesQ = useQuery({
    queryKey: ["mkt-home", "marketing-companies"],
    queryFn: async () => {
      const rows = await selectMarketingCompanies(
        supabase,
        "id,name,notes,created_at",
        { limit: 500 },
      );
      return rows as {
        id: string; name: string; notes: string | null; created_at: string;
      }[];
    },
  });

  // „Új cég" számláló forrása: MINDEN cég, függetlenül attól, hogy
  // Scarlet, marketing workflow, vagy manuálisan került be. Egy cég egy cég.
  // A marketing markerek csak a pipeline-státuszt mutatják, nem a beszámolást.
  const allCompaniesQ = useQuery({
    queryKey: ["mkt-home", "all-companies-30d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id,name,notes,created_at")
        .gte("created_at", monthAgo)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as {
        id: string; name: string; notes: string | null; created_at: string;
      }[];
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
      const { data, error } = await supabase
        .from("emails")
        .select("id,thread_id,internal_date,created_at")
        .gte("created_at", monthAgo)
        .order("internal_date", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const companies = companiesQ.data ?? [];
  const threads   = threadsQ.data ?? [];

  // Marketing státusz dekorálás a notes-ból.
  const decorated = companies.map((c) => ({ ...c, meta: readMarketingMeta(c.notes) }));
  const byStatus = (s: MarketingStatus) => decorated.filter((c) => c.meta.status === s);

  const pipeline: Record<MarketingStatus, number> = {
    new:       byStatus("new").length,
    contacted: byStatus("contacted").length,
    qualified: byStatus("qualified").length,
    handoff:   byStatus("handoff").length,
    rejected:  byStatus("rejected").length,
  };

  const qualified  = byStatus("qualified");
  // Minden ma létrehozott cég — Scarlet és manuális is ide tartozik.
  const allDecorated = (allCompaniesQ.data ?? []).map((c) => ({
    ...c, meta: readMarketingMeta(c.notes),
  }));
  const newToday   = allDecorated.filter(
    (c) => c.created_at >= todayStart && c.meta.status !== "handoff",
  );
  const handoffToday = decorated.filter(
    (c) => c.meta.status === "handoff" && c.meta.statusDate && c.meta.statusDate >= todayStart.slice(0, 10),
  );

  const newCompanies7  = allDecorated.filter((c) => c.created_at >= weekAgo).length;
  const newCompanies30 = allDecorated.length;
  const handoff30 = decorated.filter(
    (c) => c.meta.status === "handoff" && c.meta.statusDate && c.meta.statusDate >= monthAgo.slice(0, 10),
  ).length;
  const handoffRate30 = newCompanies30 > 0 ? Math.round((handoff30 / newCompanies30) * 100) : 0;
  const recentEmails = (emailsQ.data ?? []).filter((e: any) =>
    (e.internal_date ?? e.created_at) >= weekAgo,
  );
  const emails7 = recentEmails.length;
  const replied7 = (() => {
    // Válaszadási arány: hány aktív szálban van legalább 1 bejövő válasz az
    // elmúlt 7 napban (azaz több mint 1 email a szálban).
    const recentThreads = threads.filter((t: any) => t.last_message_at >= weekAgo);
    if (recentThreads.length === 0) return 0;
    const byThread = new Map<string, number>();
    for (const e of (emailsQ.data ?? []) as any[]) {
      byThread.set(e.thread_id, (byThread.get(e.thread_id) ?? 0) + 1);
    }
    const replied = recentThreads.filter((t: any) => (byThread.get(t.id) ?? 0) > 1).length;
    return Math.round((replied / recentThreads.length) * 100);
  })();

  const loading = companiesQ.isLoading || allCompaniesQ.isLoading || threadsQ.isLoading || emailsQ.isLoading;

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Marketing minősítés egy képernyőn — kampánycégek, email aktivitás, sales-átadás." />

      <QuickActions>
        <Button size="sm" variant="default" asChild><Link to="/campaign-list"><ListPlus className="mr-1 h-3.5 w-3.5" />Kampánylista</Link></Button>
        <Button size="sm" variant="secondary" asChild><Link to="/emails"><Mail className="mr-1 h-3.5 w-3.5" />Levelek</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sales/research"><Radar className="mr-1 h-3.5 w-3.5" />Scarlet research</Link></Button>
        <Button size="sm" variant="ghost" asChild><Link to="/help/marketing"><BookOpen className="mr-1 h-3.5 w-3.5" />Marketing súgó</Link></Button>
      </QuickActions>

      <div className="space-y-4 p-6 pt-3">
        {/* ───────── 1. Marketing minősítési pipeline ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Marketing pipeline"
            subtitle="Cégek állapota a kampánylistán. Lead csak manuális átadásból jön létre." />
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-5">
            {(["new","contacted","qualified","handoff","rejected"] as const).map((k) => (
              <div
                key={k}
                className={`rounded-lg border p-3 ${MARKETING_STATUS_TONE[k]}`}
              >
                <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{MARKETING_STATUS_LABEL[k]}</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums leading-none">{pipeline[k]}</div>
                <div className="mt-1 text-[11px] opacity-70">
                  {k === "qualified" ? "átadásra vár"
                    : k === "handoff" ? "sales pipeline-ban"
                    : k === "contacted" ? "email kiment / felvettük"
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
              count={qualified.length}
              empty="Nincs minősített cég átadásra."
              items={qualified.slice(0, 6)}
            />
            <CompanyColumn
              tone="info"
              icon={Sparkles}
              title="Új cégek (ma)"
              count={newToday.length}
              empty="Ma még nem került fel új cég."
              items={newToday.slice(0, 6)}
            />
            <CompanyColumn
              tone="success"
              icon={Building2}
              title="Ma átadva"
              count={handoffToday.length}
              empty="Ma még nem adtál át céget."
              items={handoffToday.slice(0, 6)}
            />
          </div>
        </section>

        {/* ───────── 3. Email aktivitás ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Friss email szálak" subtitle="Az utolsó 30 nap aktív szálai." />
          <div className="p-4">
            {threads.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nincs email az elmúlt 30 napban.</p>
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
            <PerfTile label="Új cég · 7 nap"  value={newCompanies7} />
            <PerfTile label="Új cég · 30 nap" value={newCompanies30} />
            <PerfTile label="Átadási arány · 30 nap" value={`${handoffRate30}%`} sub="átadott / új cég" />
            <PerfTile label="Email aktivitás · 7 nap" value={emails7} sub="email db" />
            <PerfTile label="Válaszadási arány · 7 nap" value={`${replied7}%`} sub="szálban >1 üzenet" />
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
    <div className="flex items-end justify-between border-b px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
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
  count: number;
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
        <Badge variant="outline" className={`tabular-nums ${count > 0 ? `border-current ${toneText}` : ""}`}>{count}</Badge>
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
      {count > items.length && (
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