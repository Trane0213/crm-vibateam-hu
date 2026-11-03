import { budapestDayBounds } from "@/lib/owner-kpis";
import type { DueBucket } from "./constants";

export type DailyLead = { id: string; assigned_to: string | null; status: string | null; summary: string | null;
  source: string | null; company_id: string | null; contact_id: string | null; created_at: string | null;
  next_step_type: string | null; next_step_due_at: string | null; pipeline_entered_at: string | null };
export type DailyQuote = { id: string; lead_id: string | null; title: string | null; status: string | null; is_current: boolean | null };

export function dueBucket(due: string | null, now: Date): DueBucket {
  if (!due || Number.isNaN(Date.parse(due))) return "missing";
  const today = budapestDayBounds(now), tomorrow = budapestDayBounds(now, 1);
  const value = Date.parse(due);
  if (value < Date.parse(today.start)) return "overdue";
  if (value <= Date.parse(today.end)) return "today";
  if (value <= Date.parse(tomorrow.end)) return "tomorrow";
  return "later";
}

export function dailyWork(leads: DailyLead[], quotes: DailyQuote[], userId: string, team: boolean, now: Date) {
  const scoped = leads.filter(l => (team || l.assigned_to === userId) && l.status !== "won" && l.status !== "lost");
  const currentQuotes = quotes.filter(q => q.is_current !== false && q.status !== "draft" && q.status !== "won" && q.status !== "lost");
  const waitingIds = new Set(currentQuotes.map(q => q.lead_id));
  const sorted = [...scoped].sort((a, b) => (a.next_step_due_at ?? "9999").localeCompare(b.next_step_due_at ?? "9999") || a.id.localeCompare(b.id));
  const buckets = Object.fromEntries((["overdue", "today", "tomorrow", "later", "missing"] as const).map(b => [b, sorted.filter(l => dueBucket(l.next_step_due_at, now) === b)])) as Record<DueBucket, DailyLead[]>;
  const weekStart = Date.parse(budapestDayBounds(now, -7).start);
  return { leads: scoped, buckets,
    newLeads: scoped.filter(l => l.status === "new" && (!l.next_step_type || !l.next_step_due_at) && !!l.created_at && Date.parse(l.created_at) >= weekStart && Date.parse(l.created_at) <= now.getTime()),
    waiting: sorted.filter(l => (l.status === "quote_sent" || l.status === "follow_up") && waitingIds.has(l.id)),
    incomplete: sorted.filter(l => !l.next_step_type || !l.next_step_due_at || !l.contact_id),
    quotes: currentQuotes.filter(q => scoped.some(l => l.id === q.lead_id)),
  };
}