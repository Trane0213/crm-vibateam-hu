import type { SupabaseClient } from '@supabase/supabase-js';
import type { Mailbox } from '@/lib/gmail/mailbox-model';
import { loadDailyWork, allDailyRows } from '@/lib/sales/load-daily-work';
import { authorizeAgent } from './approval.server';
import { mailDirection, syncCompleteness } from './adapters/gmail-context';
import { salesWatchSignals, type WatchFollowup, type WatchQuote, type WatchSend } from './sales-watch';

/** User-RLS only; no tokens, Gmail API, bodies, model call or writes. */
export async function loadSalesWatch(user: SupabaseClient, userId: string, now = new Date()) {
  const role = await authorizeAgent(user, userId, 'timothy');
  if (role !== 'sales' && role !== 'owner') throw new Error('A Sales-figyeléshez nincs jogosultság.');
  const d = await loadDailyWork(user, userId, false, now);
  const quotes: WatchQuote[] = [], followups: WatchFollowup[] = [], sends: WatchSend[] = [];
  for (let i = 0; i < d.leads.length; i += 100) {
    const ids = d.leads.slice(i, i + 100).map(l => l.id);
    quotes.push(...await allDailyRows<WatchQuote>((f, t) => user.from('quotes').select('id,lead_id,title,status,is_current,valid_until').in('lead_id', ids).eq('is_current', true).in('status', ['sent', 'negotiation']).order('id').range(f, t)));
    followups.push(...await allDailyRows<WatchFollowup>((f, t) => user.from('followups').select('id,lead_id,completed,due_date').in('lead_id', ids).eq('completed', false).order('id').range(f, t)));
  }
  for (let i = 0; i < quotes.length; i += 100) sends.push(...await allDailyRows<WatchSend>((f, t) => user.from('quote_sends').select('id,quote_id,gmail_message_id,thread_id,status,sent_at').in('quote_id', quotes.slice(i, i + 100).map(q => q.id)).order('id').range(f, t)));
  const accounts = await user.rpc('crm_mailboxes');
  if (accounts.error || !Array.isArray(accounts.data)) throw new Error('A postafiók-hozzáférés nem ellenőrizhető.');
  const own = (accounts.data as Mailbox[]).filter(m => m.userId === userId && m.active);
  const account = own.length === 1 ? own[0] : undefined;
  const threads: Parameters<typeof salesWatchSignals>[3] = [];
  const limitations = ['Tárolt CRM-levelek; nem teljes vagy élő Gmail-ellenőrzés.', 'Csak saját aktív fiók és pontos mentett ügykapcsolat. A levél tartalma, fontossága és megválaszolatlansága külön ellenőrizendő.', 'Nincs automatikus feladat, státuszváltás, értesítéssor vagy AI-futtatás.'];
  let partial = false;
  if (account) {
    const candidates: { id: string; lead_id: string; company_id: string; last_message_at: string | null }[] = [];
    for (let i = 0; i < d.leads.length; i += 100) {
      const r = await user.from('email_threads').select('id,lead_id,company_id,last_message_at')
        .in('lead_id', d.leads.slice(i, i + 100).map(l => l.id)).order('last_message_at', { ascending: false, nullsFirst: false }).order('id').limit(21);
      if (r.error) throw new Error('A levélfigyelés adatai nem érhetők el.');
      for (const t of r.data ?? []) if (t.lead_id && t.company_id) candidates.push({ ...t, lead_id: t.lead_id, company_id: t.company_id });
    }
    candidates.sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? '') || a.id.localeCompare(b.id));
    partial = candidates.length > 20;
    for (const t of candidates.slice(0, 20)) {
      const l = d.leads.find(l => l.id === t.lead_id);
      if (!l || l.company_id !== t.company_id) continue;
      const contacts = await user.from('contacts').select('email').eq('company_id', t.company_id).order('id').limit(101);
      const messages = await user.from('emails').select('id,thread_id,company_id,lead_id,from_email,gmail_label_ids,gmail_message_id,internal_date')
        .eq('thread_id', t.id).eq('owner_user_id', account.userId).order('internal_date', { ascending: false, nullsFirst: false }).order('id').limit(51);
      if (contacts.error || messages.error) throw new Error('A feladó és a levélforrás nem ellenőrizhető.');
      const complete = (contacts.data?.length ?? 0) <= 100 && (messages.data?.length ?? 0) <= 50;
      if (!complete) partial = true;
      const customerEmails = complete ? (contacts.data ?? []).map(c => (c.email ?? '').trim().toLowerCase()).filter(Boolean) : [];
      const raw = messages.data ?? [];
      const consistent = raw.every(m => m.company_id === t.company_id && m.lead_id === t.lead_id && m.internal_date && Number.isFinite(Date.parse(m.internal_date)) && Date.parse(m.internal_date) <= now.getTime());
      if (!consistent) partial = true;
      threads.push({ ...t, complete: complete && consistent, messages: raw.map(m => ({ id: m.id, thread_id: m.thread_id, gmail_message_id: m.gmail_message_id, internal_date: m.internal_date, direction: mailDirection(m, account.email, customerEmails) })) });
    }
    if (partial) limitations.push('Részleges levélfigyelés: legfeljebb 20 szál, 50 levél/szál és 100 kapcsolattartó/cég. A teljes előzmény a meglévő levélolvasóval ellenőrizhető.');
  } else limitations.push('Nincs egyértelmű saját aktív postafiók; levélfigyelés nem történt.');
  return { signals: salesWatchSignals(d.leads, quotes, followups, threads, sends, now), checkedAt: now.toISOString(), partial,
    sync: account ? syncCompleteness(account, now) : null, limitations };
}