import { Link } from "@tanstack/react-router";
import { ChevronRight, CheckCircle2 } from "lucide-react";
import { useDailyWork } from "@/lib/sales/use-daily-work";
import { DUE_BUCKET_LABEL, NEXT_STEP_LABEL, type DueBucket, type NextStepType } from "@/lib/sales/constants";
import { salesFocusSections, type DailyLead } from "@/lib/sales/daily-work";
import { isTestLabel } from "@/lib/owner-kpis";
import { Badge } from "@/components/ui/badge";

type Tone = "danger" | "warning" | "info" | "primary" | "muted";
const ACCENT: Record<Tone, string> = {
  danger: "border-l-destructive",
  warning: "border-l-[color:var(--status-warning)]",
  info: "border-l-[color:var(--status-info)]",
  primary: "border-l-primary",
  muted: "border-l-border",
};
const fmtDue = (iso: string) => new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function DailyLeadRows({ leads, compact = false }: { leads: DailyLead[]; compact?: boolean }) {
  if (!leads.length) return <p className="px-4 py-3 text-sm text-muted-foreground">Nincs ilyen ügy.</p>;
  return <ul className={compact ? "grid gap-2 sm:grid-cols-2 xl:grid-cols-3" : "divide-y"}>{leads.map(l => {
    const missing = [!l.next_step_type && "következő lépés", !l.next_step_due_at && "határidő", !l.contact_id && "kapcsolattartó"].filter(Boolean) as string[];
    return <li key={l.id} className={compact ? "min-w-0 rounded-lg border bg-card" : undefined}>
      <Link to="/leads" search={{ lead: l.id }} className="group flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-muted/50">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="min-w-0 truncate font-medium group-hover:text-primary">{(compact && l.company_name) || l.summary || l.source || `Ügy #${l.id.slice(0, 8)}`}</span>
            {isTestLabel(l.summary) && <Badge variant="outline" className="shrink-0 text-[10px]">TESZT</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            {l.next_step_type && <span>Következő: {compact ? NEXT_STEP_LABEL[l.next_step_type as NextStepType] ?? l.next_step_type : l.next_step_type}</span>}
            {l.next_step_due_at && <span className="tabular-nums">Határidő: {fmtDue(l.next_step_due_at)}</span>}
            {missing.length > 0 && <span className="text-[color:var(--status-warning)]">Hiányzik: {missing.join(", ")}</span>}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>
    </li>;
  })}</ul>;
}

export function SalesWorklists({ bucket, compact = false }: { bucket?: DueBucket; compact?: boolean }) {
  const query = useDailyWork();
  if (query.isError) return <p role="alert" className="py-4 text-sm text-destructive">A Sales-adatok betöltése sikertelen: {query.error.message}</p>;
  if (!query.data) return <p className="py-4 text-sm text-muted-foreground">Betöltés…</p>;
  const d = query.data;
  const sections: { title: string; rows: DailyLead[]; tone: Tone }[] = bucket ? [{ title: DUE_BUCKET_LABEL[bucket], rows: d.buckets[bucket], tone: "primary" }] : [
    { title: "Lejárt teendők", rows: d.buckets.overdue, tone: "danger" },
    { title: "Mai feladatok", rows: d.buckets.today, tone: "warning" },
    { title: "Új érdeklődők", rows: d.newLeads, tone: "info" },
    { title: "Válaszra váró ajánlatok", rows: d.waiting, tone: "primary" },
    { title: "Hiányos ügyek", rows: d.incomplete, tone: "muted" },
  ];
  if (compact && !bucket) {
    const rows = salesFocusSections(d);
    sections.forEach((s, i) => { s.rows = rows[i] ?? []; });
  }
  if (!bucket && sections.every(s => s.rows.length === 0)) {
    return <div className="flex items-center gap-3 rounded-lg border bg-card p-5 text-sm">
      <CheckCircle2 className="h-5 w-5 text-[color:var(--status-success)]" />
      <div><div className="font-medium">Nincs mai teendőd.</div>
        <div className="text-muted-foreground">Nincs hozzád rendelt lejárt, mai, új, válaszra váró vagy hiányos ügy.</div></div>
    </div>;
  }
  const visible = bucket ? sections : sections.filter(s => s.rows.length > 0);
  const empty = bucket || compact ? [] : sections.filter(s => s.rows.length === 0);
  return <div className="space-y-3">
    <div className={compact ? "space-y-4" : "grid gap-3 lg:grid-cols-2"}>
      {visible.map(s => <section key={s.title} className={compact ? "space-y-2" : `overflow-hidden rounded-lg border border-l-4 bg-card ${ACCENT[s.tone]}`}>
        <h2 className={compact ? `flex items-center justify-between border-l-4 px-3 py-1 text-sm font-semibold ${ACCENT[s.tone]}` : "flex items-center justify-between border-b px-4 py-2.5 text-sm font-semibold"}>
          {s.title}<span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{s.rows.length}</span>
        </h2>
        <DailyLeadRows leads={s.rows} compact={compact} />
      </section>)}
    </div>
    {empty.length > 0 && <p className="text-xs text-muted-foreground">Nincs ügy: {empty.map(s => s.title.toLowerCase()).join(", ")}.</p>}
  </div>;
}
