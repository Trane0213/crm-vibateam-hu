import { dueBucket, type DailyLead, type DailyQuote } from '@/lib/sales/daily-work';
import { budapestDayBounds } from '@/lib/owner-kpis';
import { quoteSendEvidence } from './adapters/quote-context';

export type WatchSignal = { id: string; leadId: string; companyId: string | null; kind: 'reply' | 'quote_reply' | 'overdue_followup' | 'stalled' | 'expiry'; label: string; sourceId: string; threadId?: string; quoteId?: string; at: string | null };
export type WatchMessage = { id: string; thread_id: string | null; internal_date: string | null; gmail_message_id: string | null; direction: string };
export type WatchFollowup = { id: string; lead_id: string | null; completed: boolean | null; due_date: string | null };
export type WatchQuote = DailyQuote & { valid_until: string | null };
export type WatchSend = { quote_id: string; gmail_message_id: string | null; thread_id?: string | null; status?: string; sent_at?: string | null };

/** Metadata facts only: no semantic acceptance/rejection or live unanswered claim. */
export function salesWatchSignals(leads: DailyLead[], quotes: WatchQuote[], followups: WatchFollowup[],
  threads: { id: string; lead_id: string; company_id: string; messages: WatchMessage[]; complete: boolean }[], sends: WatchSend[], now: Date) {
  const signals = new Map<string, WatchSignal>();
  const open = leads.filter(l => l.status !== 'won' && l.status !== 'lost');
  const byId = new Map(open.map(l => [l.id, l]));
  const add = (l: DailyLead, kind: WatchSignal['kind'], sourceId: string, label: string, at: string | null, extra: Partial<WatchSignal> = {}) => {
    const id = `${kind}:${sourceId}`;
    signals.set(id, { id, leadId: l.id, companyId: l.company_id, kind, sourceId, label, at, ...extra });
  };
  for (const l of open) {
    if (!l.next_step_type || !l.next_step_due_at || dueBucket(l.next_step_due_at, now) === 'overdue')
      add(l, 'stalled', l.id, 'Hiányzó vagy lejárt következő lépés', l.next_step_due_at);
  }
  for (const f of followups) {
    const l = byId.get(f.lead_id ?? '');
    if (l && f.completed === false && dueBucket(f.due_date, now) === 'overdue') add(l, 'overdue_followup', f.id, 'Lejárt nyitott utánkövetés', f.due_date);
  }
  const current = quotes.filter(q => q.is_current === true && ['sent', 'negotiation'].includes(q.status ?? ''));
  const horizon = Date.parse(budapestDayBounds(now, 1).end);
  for (const q of current) {
    const l = byId.get(q.lead_id ?? '');
    const date = q.valid_until && /^\d{4}-\d{2}-\d{2}$/.test(q.valid_until) ? Date.parse(`${q.valid_until}T12:00:00Z`) : NaN;
    if (l && Number.isFinite(date) && date <= horizon) add(l, 'expiry', q.id, 'Lejárt vagy holnapig lejáró ajánlat', q.valid_until, { quoteId: q.id });
  }
  for (const t of threads) {
    const l = byId.get(t.lead_id);
    if (!l || l.company_id !== t.company_id || !t.complete) continue;
    const valid = t.messages.filter(m => m.thread_id === t.id && m.internal_date && Number.isFinite(Date.parse(m.internal_date)) && Date.parse(m.internal_date) <= now.getTime());
    valid.sort((a, b) => Date.parse(b.internal_date ?? '') - Date.parse(a.internal_date ?? '') || a.id.localeCompare(b.id));
    const latest = valid[0];
    // Automated/unverified newest message and equal timestamps are ambiguous: withhold.
    if (!latest || latest.direction !== 'customer_inbound' || valid.some(m => m.id !== latest.id && m.internal_date === latest.internal_date)) continue;
    const sent = valid.find(m => m.direction === 'sent' && Date.parse(m.internal_date ?? '') < Date.parse(latest.internal_date ?? ''));
    if (!sent) continue;
    const q = current.find(q => q.lead_id === l.id && sends.some(s => s.quote_id === q.id && s.thread_id === t.id && quoteSendEvidence(s).verified_send_record && valid.some(m => m.direction === 'sent' && m.gmail_message_id === s.gmail_message_id && Date.parse(m.internal_date ?? '') < Date.parse(latest.internal_date ?? ''))));
    add(l, q ? 'quote_reply' : 'reply', latest.id, q ? 'Ügyféllevél az ajánlat kiküldési szálán · tartalma ellenőrizendő' : 'Ügyféllevél a kiküldött levél után · tárolt adat', latest.internal_date, { threadId: t.id, ...(q ? { quoteId: q.id } : {}) });
  }
  const rank = { overdue_followup: 0, reply: 1, quote_reply: 1, expiry: 2, stalled: 3 };
  return [...signals.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || (a.at ?? '').localeCompare(b.at ?? '') || a.id.localeCompare(b.id));
}