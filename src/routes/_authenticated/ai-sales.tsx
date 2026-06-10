import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Bot, Search, BellRing, Sparkles, Building2, UserPlus, Briefcase, FileText, ListChecks, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useList } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { PageHeader } from "@/components/page-header";

export const Route = createFileRoute("/_authenticated/ai-sales")({
  component: AgentsHub,
});

function AgentsHub() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Agentek"
        description="A bejelentkezett felhasználó jogosultságával dolgoznak — nem látnak több adatot, mint te."
        actions={<Badge variant="secondary"><Sparkles className="mr-1 h-3 w-3" />V1 · szabály-alapú</Badge>}
      />
      <div className="p-6">
        <Tabs defaultValue="crm" className="w-full">
          <TabsList>
            <TabsTrigger value="crm"><Search className="mr-1.5 h-3.5 w-3.5" />CRM Agent</TabsTrigger>
            <TabsTrigger value="sales"><Bot className="mr-1.5 h-3.5 w-3.5" />Sales Agent</TabsTrigger>
            <TabsTrigger value="followup"><BellRing className="mr-1.5 h-3.5 w-3.5" />Follow-up Agent</TabsTrigger>
          </TabsList>
          <TabsContent value="crm" className="mt-4"><CrmAgent /></TabsContent>
          <TabsContent value="sales" className="mt-4"><SalesAgent /></TabsContent>
          <TabsContent value="followup" className="mt-4"><FollowupAgent /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/* ============== CRM AGENT — keresés több táblában ============== */
function CrmAgent() {
  const [q, setQ] = useState("");
  const companies = useList<any>("companies", { order: "name", ascending: true });
  const contacts = useList<any>("contacts", { order: "full_name", ascending: true });
  const projects = useList<any>("projects", { order: "created_at", ascending: false });
  const quotes = useList<any>("quotes", { order: "created_at", ascending: false });
  const tasks = useList<any>("tasks", { order: "created_at", ascending: false });

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    const test = (v: any) => String(v ?? "").toLowerCase().includes(needle);
    return {
      companies: (companies.data ?? []).filter((r) => test(r.name) || test(r.tax_number) || test(r.website)).slice(0, 10),
      contacts: (contacts.data ?? []).filter((r) => test(r.full_name) || test(r.email) || test(r.phone)).slice(0, 10),
      projects: (projects.data ?? []).filter((r) => test(r.title) || test(r.address) || test(r.description)).slice(0, 10),
      quotes: (quotes.data ?? []).filter((r) => test(r.title) || test(r.id) || test(r.status)).slice(0, 10),
      tasks: (tasks.data ?? []).filter((r) => test(r.title) || test(r.description)).slice(0, 10),
    };
  }, [q, companies.data, contacts.data, projects.data, quotes.data, tasks.data]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">CRM keresés</CardTitle>
          <p className="text-xs text-muted-foreground">Cég, kapcsolattartó, projekt, ajánlat, feladat — egyszerre. (OpenAI nélkül, valós CRM adatokon.)</p>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Search className="h-4 w-4 text-muted-foreground self-center" />
            <Input autoFocus placeholder={`Pl. „Kovács", cég név, projekt cím, ajánlat azonosító…`} value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {!matches ? (
        <p className="text-sm text-muted-foreground">Kezdj el írni a kereséshez…</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <ResultGroup title="Cégek" icon={Building2} items={matches.companies.map((r) => ({ id: r.id, label: r.name, sub: r.tax_number }))} />
          <ResultGroup title="Kapcsolattartók" icon={UserPlus} items={matches.contacts.map((r) => ({ id: r.id, label: r.full_name, sub: r.email ?? r.phone }))} />
          <ResultGroup title="Projektek" icon={Briefcase} items={matches.projects.map((r) => ({ id: r.id, label: r.title, sub: r.status, href: `/projects/${r.id}` }))} />
          <ResultGroup title="Ajánlatok" icon={FileText} items={matches.quotes.map((r) => ({ id: r.id, label: r.title ?? `#${String(r.id).slice(0,8)}`, sub: r.status, href: `/quotes/${r.id}` }))} />
          <ResultGroup title="Feladatok" icon={ListChecks} items={matches.tasks.map((r) => ({ id: r.id, label: r.title ?? r.description, sub: r.due_date }))} />
        </div>
      )}
    </div>
  );
}

function ResultGroup({ title, icon: Icon, items }: { title: string; icon: React.ComponentType<{ className?: string }>; items: { id: string; label: string; sub?: string; href?: string }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-xs"><Icon className="h-3.5 w-3.5" />{title} ({items.length})</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="text-xs text-muted-foreground">Nincs találat.</p> : (
          <ul className="space-y-1.5 text-sm">
            {items.map((it) => (
              <li key={it.id} className="flex justify-between gap-2">
                {it.href ? <Link to={it.href} className="text-primary hover:underline truncate">{it.label}</Link> : <span className="truncate">{it.label}</span>}
                {it.sub && <span className="text-xs text-muted-foreground truncate">{it.sub}</span>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/* ============== SALES AGENT — szabály-alapú összefoglaló ============== */
function SalesAgent() {
  const quotes = useList<any>("quotes", { order: "created_at", ascending: false });
  const followups = useList<any>("followups", { order: "due_date", ascending: true });
  const projects = useList<any>("projects", { order: "created_at", ascending: false });

  const openQuotes = (quotes.data ?? []).filter((q) => !["won", "lost", "megnyert", "elveszett"].includes(String(q.status ?? "").toLowerCase()));
  const totalOpen = openQuotes.reduce((a, r) => a + (Number(r.total_amount ?? r.total ?? r.amount) || 0), 0);
  const overdueFollowups = (followups.data ?? []).filter((f) => !f.completed && f.due_date && new Date(f.due_date) < new Date());
  const todayFollowups = (followups.data ?? []).filter((f) => !f.completed && isToday(f.due_date));
  const activeProjects = (projects.data ?? []).filter((p) => !["completed", "lost", "befejezve", "elveszett"].includes(String(p.status ?? "").toLowerCase()));

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle className="text-sm">Napi összefoglaló</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Nyitott ajánlatok" value={`${openQuotes.length} db · ${new Intl.NumberFormat("hu-HU").format(totalOpen)} Ft`} />
          <Row label="Lejárt follow-up" value={`${overdueFollowups.length} db`} tone={overdueFollowups.length > 0 ? "danger" : undefined} />
          <Row label="Ma esedékes" value={`${todayFollowups.length} db`} tone="warning" />
          <Row label="Aktív projektek" value={`${activeProjects.length} db`} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-sm">Javasolt teendők</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {overdueFollowups.slice(0, 5).map((f) => (
            <div key={f.id} className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5 text-destructive" /><span>Lejárt follow-up — {fmtDateTime(f.due_date)}</span></div>
          ))}
          {overdueFollowups.length === 0 && <p className="text-xs text-muted-foreground">Nincs lejárt teendő. Szép munka.</p>}
        </CardContent>
      </Card>
      <Card className="md:col-span-2">
        <CardHeader><CardTitle className="text-sm text-muted-foreground">OpenAI nélkül</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Ez a nézet szabály-alapon dolgozik a CRM adatain. A természetes nyelvű összefoglaló / chat a következő fejlesztési fázisban érkezik (OpenAI integráció).
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "danger" | "warning" }) {
  const cls = tone === "danger" ? "text-destructive font-semibold" : tone === "warning" ? "text-[color:var(--status-warning)] font-semibold" : "";
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{label}</span><span className={`tabular-nums ${cls}`}>{value}</span></div>;
}

function isToday(iso: string | null | undefined) {
  if (!iso) return false;
  const d = new Date(iso); const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

/* ============== FOLLOW-UP AGENT — 3 / 7 / 14 / 30 napos eszkaláció ============== */
function FollowupAgent() {
  const followups = useList<any>("followups", { order: "due_date", ascending: true });
  const now = Date.now();
  const buckets = useMemo(() => {
    const open = (followups.data ?? []).filter((f) => !f.completed);
    const ageDays = (f: any) => {
      const ref = f.due_date ?? f.created_at;
      if (!ref) return 0;
      return Math.floor((now - new Date(ref).getTime()) / 86_400_000);
    };
    return {
      d3: open.filter((f) => { const a = ageDays(f); return a >= 3 && a < 7; }),
      d7: open.filter((f) => { const a = ageDays(f); return a >= 7 && a < 14; }),
      d14: open.filter((f) => { const a = ageDays(f); return a >= 14 && a < 30; }),
      d30: open.filter((f) => ageDays(f) >= 30),
      overdueOpen: open.filter((f) => f.due_date && new Date(f.due_date).getTime() < now),
    };
  }, [followups.data, now]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Follow-up Agent · szabályok</CardTitle>
          <p className="text-xs text-muted-foreground">3 nap → jelzés · 7 nap → figyelmeztetés · 14 nap → eszkaláció · 30 nap → archiválási javaslat. OpenAI nem szükséges.</p>
        </CardHeader>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">
        <Bucket title="3 napos jelzés" count={buckets.d3.length} tone="info" />
        <Bucket title="7 napos figyelmeztetés" count={buckets.d7.length} tone="warning" />
        <Bucket title="14 napos eszkaláció" count={buckets.d14.length} tone="danger" />
        <Bucket title="30 napos — archiválás" count={buckets.d30.length} tone="muted" />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Lejárt follow-up-ok ({buckets.overdueOpen.length})</CardTitle></CardHeader>
        <CardContent>
          {buckets.overdueOpen.length === 0 ? <p className="text-sm text-muted-foreground">Nincs lejárt follow-up.</p> : (
            <ul className="space-y-1.5 text-sm">
              {buckets.overdueOpen.slice(0, 20).map((f) => (
                <li key={f.id} className="flex justify-between gap-2">
                  <span className="truncate">{f.followup_type ?? "follow-up"} — {f.result ?? "—"}</span>
                  <span className="text-destructive font-semibold tabular-nums">{fmtDateTime(f.due_date)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Bucket({ title, count, tone }: { title: string; count: number; tone: "info" | "warning" | "danger" | "muted" }) {
  const cls: Record<string, string> = {
    info: "border-[color:var(--status-info)]/30 bg-[color:var(--status-info)]/5 text-[color:var(--status-info)]",
    warning: "border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
    muted: "border-border bg-muted/30 text-muted-foreground",
  };
  return (
    <div className={`rounded-md border p-3 ${cls[tone]}`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80">{title}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{count}</div>
    </div>
  );
}