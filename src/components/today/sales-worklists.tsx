import { Link } from "@tanstack/react-router";
import { useDailyWork } from "@/lib/sales/use-daily-work";
import { DUE_BUCKET_LABEL, type DueBucket } from "@/lib/sales/constants";
import type { DailyLead } from "@/lib/sales/daily-work";
import { isTestLabel } from "@/lib/owner-kpis";
import { Badge } from "@/components/ui/badge";

export function DailyLeadRows({ leads }: { leads: DailyLead[] }) {
  if (!leads.length) return <p className="py-3 text-sm text-muted-foreground">Nincs teendő.</p>;
  return <ul className="divide-y">{leads.map(l => <li key={l.id}>
    <Link to="/leads" search={{ lead: l.id }} className="flex flex-wrap items-center gap-2 py-3 text-sm hover:text-primary">
      <span className="min-w-0 flex-1">{l.summary || l.source || `Ügy #${l.id.slice(0, 8)}`}</span>
      {isTestLabel(l.summary) && <Badge variant="outline">TESZT</Badge>}
      <span className="text-xs text-muted-foreground">{l.next_step_type ?? "Hiányzó következő lépés"}
        {l.next_step_due_at && ` · ${new Intl.DateTimeFormat("hu-HU", { timeZone: "Europe/Budapest", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(l.next_step_due_at))}`}
        {!l.contact_id && " · Hiányzó kapcsolattartó"}
      </span>
    </Link>
  </li>)}</ul>;
}

export function SalesWorklists({ bucket }: { bucket?: DueBucket }) {
  const query = useDailyWork();
  if (query.isError) return <p role="alert" className="py-4 text-sm text-destructive">A Sales-adatok betöltése sikertelen: {query.error.message}</p>;
  if (!query.data) return <p className="py-4 text-sm text-muted-foreground">Betöltés…</p>;
  const d = query.data;
  const sections = bucket ? [{ title: DUE_BUCKET_LABEL[bucket], rows: d.buckets[bucket] }] : [
    { title: "Lejárt teendők", rows: d.buckets.overdue },
    { title: "Mai feladatok", rows: d.buckets.today },
    { title: "Új érdeklődők", rows: d.newLeads },
    { title: "Válaszra váró ajánlatok", rows: d.waiting },
    { title: "Hiányos ügyek", rows: d.incomplete },
  ];
  return <div className="space-y-5">{sections.map(s => <section key={s.title}>
    <h2 className="border-b pb-2 text-sm font-semibold">{s.title} <span className="text-muted-foreground">({s.rows.length})</span></h2>
    <DailyLeadRows leads={s.rows} />
  </section>)}</div>;
}