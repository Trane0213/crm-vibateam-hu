// Értékesítés – Ma: megjelenítési modell a meglévő dailyWork / salesFocusSections fölött.
// Napi szabályt, bucketet, számlálót nem módosít — csak sorrendet és címkét ad.
import { salesFocusSections, type dailyWork, type DailyLead } from "@/lib/sales/daily-work";
import type { WsStatus } from "@/components/workspace-v2/status-badge";

export type SalesTask = { id: string; lead: DailyLead; label: string; status: WsStatus; due: string | null };

const SECTION: { label: string; status: WsStatus }[] = [
  { label: "Lejárt teendő", status: "missing" },
  { label: "Ma esedékes", status: "review" },
  { label: "Új érdeklődő", status: "auto" },
  { label: "Ajánlat – válaszra vár", status: "approval" },
  { label: "Hiányzó adat", status: "missing" },
];

export function salesTasks(d: ReturnType<typeof dailyWork>): SalesTask[] {
  const sections = salesFocusSections(d);
  return sections.flatMap((rows, i) => rows.map((lead) => ({ id: lead.id, lead, label: SECTION[i].label, status: SECTION[i].status, due: lead.next_step_due_at })));
}

export function salesKpis(d: ReturnType<typeof dailyWork>) {
  return {
    active: d.leads.length,
    today: d.buckets.today.length,
    overdue: d.buckets.overdue.length,
    missing: d.incomplete.length,
  };
}

/** Hova vigyen egy napi sor: Pipeline-ban lévő ügy az új Pipeline-ra, előkészítés alatti a meglévő munkafelületre. */
export function taskTarget(lead: Pick<DailyLead, "id" | "pipeline_entered_at">): { to: "/munka/sales/pipeline"; search: { lead: string } } | { to: "/leads"; search: { lead: string } } {
  return lead.pipeline_entered_at ? { to: "/munka/sales/pipeline", search: { lead: lead.id } } : { to: "/leads", search: { lead: lead.id } };
}

export function timothyDailyPrompt(k: ReturnType<typeof salesKpis>) {
  return `Készíts rövid napi összefoglalót a saját ügyeimről: ${k.overdue} lejárt és ${k.today} mai teendő, ${k.missing} ügynél hiányzó adat. Rangsorold, mivel kezdjek, és jelezd, hol hiányzik adat. Ne módosíts semmit.`;
}
