import { Link } from "@tanstack/react-router";
import { Mail, Radar, BookOpen, AlertCircle, Clock, Sparkles, ArrowRightCircle, Phone, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WelcomeHeader } from "@/components/welcome-header";
import { QuickActions } from "@/components/today/today-shell";
import { useList } from "@/lib/db-hooks";
import { QuickCreateLeadButton } from "@/components/today/quick-create";

const isoStartOfDay = () => { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString(); };
const isoWeekAgo = () => { const d = new Date(); d.setDate(d.getDate()-7); return d.toISOString(); };
const isoMonthAgo = () => { const d = new Date(); d.setDate(d.getDate()-30); return d.toISOString(); };

const STATUS_LABEL: Record<string, string> = {
  new: "Új",
  contacted: "Kapcsolatfelvétel",
  qualified: "Minősítés / átadható",
  converted: "Átadott",
  lost: "Elveszett",
};

const STATUS_TONE: Record<string, string> = {
  new:        "border-[color:var(--status-info)]/40    bg-[color:var(--status-info)]/5    text-[color:var(--status-info)]",
  contacted:  "border-primary/40                       bg-primary/5                       text-primary",
  qualified:  "border-[color:var(--status-warning)]/40 bg-[color:var(--status-warning)]/5 text-[color:var(--status-warning)]",
  converted:  "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/5 text-[color:var(--status-success)]",
  lost:       "border-muted-foreground/30              bg-muted/30                        text-muted-foreground",
};

export function MarketingHome() {
  const todayStart = isoStartOfDay();
  const weekAgo = isoWeekAgo();
  const monthAgo = isoMonthAgo();

  const leadsQ    = useList<any>("leads",      { order: "created_at", ascending: false });
  const followupsQ = useList<any>("followups", { order: "due_date",   ascending: true  });
  const emailsQ   = useList<any>("email_threads", { order: "last_message_at", ascending: false });

  const leads = leadsQ.data ?? [];
  const followups = followupsQ.data ?? [];
  const emails = emailsQ.data ?? [];

  const now = new Date();
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);

  // ───────── Mai feladatok ─────────
  const openFollowups = followups.filter((f: any) => !f.completed && f.due_date);
  const overdue = openFollowups.filter((f: any) => new Date(f.due_date) < now);
  const dueToday = openFollowups.filter((f: any) => {
    const d = new Date(f.due_date); return d >= now && d <= todayEnd;
  });
  const newLeadsToday = leads.filter((l: any) => l.created_at >= todayStart);
  const handoffReady = leads.filter((l: any) => l.status === "qualified");

  // ───────── Pipeline ─────────
  const pipeline = {
    new:        leads.filter((l: any) => l.status === "new").length,
    contacted:  leads.filter((l: any) => l.status === "contacted").length,
    qualified:  leads.filter((l: any) => l.status === "qualified").length,
    converted:  leads.filter((l: any) => l.status === "converted").length,
    lost:       leads.filter((l: any) => l.status === "lost").length,
  };

  // ───────── Marketing teljesítmény ─────────
  const newLeads7  = leads.filter((l: any) => l.created_at >= weekAgo).length;
  const newLeads30 = leads.filter((l: any) => l.created_at >= monthAgo).length;
  const handoffRate30 = (() => {
    const last30 = leads.filter((l: any) => l.created_at >= monthAgo);
    if (last30.length === 0) return 0;
    const handed = last30.filter((l: any) => l.status === "converted" || l.status === "qualified").length;
    return Math.round((handed / last30.length) * 100);
  })();
  const emails7 = emails.filter((e: any) => e.last_message_at >= weekAgo).length;
  const repliedRate7 = (() => {
    const recent = emails.filter((e: any) => e.last_message_at >= weekAgo);
    if (recent.length === 0) return 0;
    const replied = recent.filter((e: any) => (e.message_count ?? 1) > 1).length;
    return Math.round((replied / recent.length) * 100);
  })();

  const loading = leadsQ.isLoading || followupsQ.isLoading;

  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="A mai napod egy képernyőn — mit kell csinálni, kit kell hívni, mi az átadható." />

      <QuickActions>
        <QuickCreateLeadButton />
        <Button size="sm" variant="secondary" asChild><Link to="/emails"><Mail className="mr-1 h-3.5 w-3.5" />Levelek</Link></Button>
        <Button size="sm" variant="outline" asChild><Link to="/sales/research"><Radar className="mr-1 h-3.5 w-3.5" />Scarlet research</Link></Button>
        <Button size="sm" variant="ghost" asChild><Link to="/help/marketing"><BookOpen className="mr-1 h-3.5 w-3.5" />Marketing súgó</Link></Button>
      </QuickActions>

      <div className="space-y-4 p-6 pt-3">
        {/* ───────── 1. Mai feladatok ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Mai feladatok" subtitle="Mit kell ma elintézned. Kattints a sorra a részletekért." />
          <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-4">
            <TaskColumn
              tone="danger"
              icon={AlertCircle}
              title="Lejárt utánkövetések"
              count={overdue.length}
              to="/followups"
              empty="Nincs lejárt teendő."
              items={overdue.slice(0, 5).map((f: any) => ({
                key: f.id,
                primary: f.title ?? f.kind ?? "Utánkövetés",
                secondary: `Esedékes: ${fmtDate(f.due_date)}`,
                to: f.lead_id ? `/leads/${f.lead_id}` : "/followups",
              }))}
            />
            <TaskColumn
              tone="warning"
              icon={Clock}
              title="Ma esedékes"
              count={dueToday.length}
              to="/followups"
              empty="Mára nincs ütemezve teendő."
              items={dueToday.slice(0, 5).map((f: any) => ({
                key: f.id,
                primary: f.title ?? f.kind ?? "Utánkövetés",
                secondary: `Ma: ${fmtTime(f.due_date)}`,
                to: f.lead_id ? `/leads/${f.lead_id}` : "/followups",
              }))}
            />
            <TaskColumn
              tone="success"
              icon={ArrowRightCircle}
              title="Átadásra váró leadek"
              count={handoffReady.length}
              to="/leads"
              empty="Nincs átadásra váró lead."
              items={handoffReady.slice(0, 5).map((l: any) => ({
                key: l.id,
                primary: l.summary ?? `#${String(l.id).slice(0,6)}`,
                secondary: l.source ?? "—",
                to: `/leads/${l.id}`,
              }))}
            />
            <TaskColumn
              tone="info"
              icon={Sparkles}
              title="Új érdeklődők (ma)"
              count={newLeadsToday.length}
              to="/leads"
              empty="Ma még nem érkezett új lead."
              items={newLeadsToday.slice(0, 5).map((l: any) => ({
                key: l.id,
                primary: l.summary ?? `#${String(l.id).slice(0,6)}`,
                secondary: [l.source, l.email].filter(Boolean).join(" · ") || "—",
                to: `/leads/${l.id}`,
              }))}
            />
          </div>
        </section>

        {/* ───────── 2. Lead pipeline ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Lead pipeline" subtitle="Hol állnak a leadjeid a marketing-funnelben." />
          <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3 lg:grid-cols-5">
            {(["new","contacted","qualified","converted","lost"] as const).map((k) => (
              <Link
                key={k}
                to="/leads"
                className={`rounded-lg border p-3 transition hover:brightness-105 ${STATUS_TONE[k]}`}
              >
                <div className="text-[11px] font-medium uppercase tracking-wider opacity-80">{STATUS_LABEL[k]}</div>
                <div className="mt-1 text-3xl font-semibold tabular-nums leading-none">{pipeline[k]}</div>
                <div className="mt-1 text-[11px] opacity-70">{k === "qualified" ? "értékesítőre vár" : k === "converted" ? "átadva sales-nek" : ""}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* ───────── 3. Marketing teljesítmény ───────── */}
        <section className="rounded-lg border bg-card">
          <SectionHeader title="Marketing teljesítmény" subtitle="Heti és havi mérőszámok." />
          <div className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-5">
            <PerfTile label="Új lead · 7 nap"  value={newLeads7} />
            <PerfTile label="Új lead · 30 nap" value={newLeads30} />
            <PerfTile label="Átadási arány · 30 nap" value={`${handoffRate30}%`} sub="qualified + converted" />
            <PerfTile label="Email aktivitás · 7 nap" value={emails7} sub="aktív szál" />
            <PerfTile label="Válaszadási arány · 7 nap" value={`${repliedRate7}%`} sub="szálban >1 üzenet" />
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

function TaskColumn({
  tone, icon: Icon, title, count, to, empty, items,
}: {
  tone: "danger" | "warning" | "info" | "success";
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  to: string;
  empty: string;
  items: { key: string; primary: string; secondary: string; to: string }[];
}) {
  const toneText =
    tone === "danger"  ? "text-destructive" :
    tone === "warning" ? "text-[color:var(--status-warning)]" :
    tone === "success" ? "text-[color:var(--status-success)]" :
                         "text-[color:var(--status-info)]";
  // Marketing role-ban a /followups és /leads route 403 — a fejlécet és a
  // sorokat nem linkelhetjük oda. Csak az átadásra váró / új lead sorokon
  // belüli konkrét /leads/$id és /customers/$id linkek lennének hasznosak,
  // de a /leads/$id is tiltott marketingnek. Ezért minden link kikapcsolva,
  // a fejléc és sorok csak megjelenítenek.
  void to;
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
            <li key={it.key}>
              <div className="flex items-start gap-2 rounded-md border bg-background px-2 py-1.5 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{it.primary}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{it.secondary}</div>
                </div>
              </div>
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
function fmtTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" });
}

// Unused legacy imports retained intentionally removed; Phone is referenced by handoff column icon if needed later.
void Phone;