import { isVerifiedSent, isInternal, normEmail } from './gmail/relink-analysis';
export type MarketingMail = { id: string; thread_id: string | null; company_id: string | null; owner_user_id: string | null; from_email: string | null; to_emails: string[] | null; cc_emails?: string[] | null; bcc_emails?: string[] | null; is_outbound: boolean | null; internal_date: string | null; created_at: string | null; gmail_message_id: string | null; gmail_label_ids: string[] | null };
/** A reply requires a later incoming exact customer sender in the same syncing account and thread. */
export function marketingMailFacts(rows: MarketingMail[], contacts: { email: string | null; company_id: string | null }[], since: string, mailbox = '') {
  const ordered = [...rows].sort((a,b) => (a.internal_date ?? a.created_at ?? '').localeCompare(b.internal_date ?? b.created_at ?? ''));
  const threads = new Map<string, { companyId: string; outbound: string | null; firstOutbound: string | null; sender: string | null; inbound: string | null }>();
  const sentTo = new Map<string, string>();
  const companyOf = (email: string) => new Set(contacts.filter(c => normEmail(c.email) === email).map(c => c.company_id));
  for (const row of ordered) {
    if (!row.thread_id || !row.company_id || !row.owner_user_id) continue;
    const key = `${row.owner_user_id}:${row.thread_id}`;
    const current = threads.get(key) ?? { companyId: row.company_id, outbound: null, firstOutbound: null, sender: null, inbound: null };
    if (current.companyId !== row.company_id) continue;
    const at = row.internal_date ?? '';
    const recipients = [...(row.to_emails ?? []), ...(row.cc_emails ?? []), ...(row.bcc_emails ?? [])].map(normEmail);
    const sender = normEmail(row.from_email);
    const exact = (email: string) => { const cos = companyOf(email); return !isInternal(email) && cos.size === 1 && cos.has(row.company_id); };
    if (isVerifiedSent(row, mailbox) && recipients.some(exact)) {
      current.outbound = at; current.firstOutbound ??= at; current.sender = normEmail(mailbox);
      for (const email of recipients.filter(exact)) if (!sentTo.has(`${key}:${email}`)) sentTo.set(`${key}:${email}`, at);
    } else if (row.is_outbound === false && !row.gmail_label_ids?.includes('DRAFT') && exact(sender) && recipients.includes(normEmail(mailbox))) {
      const sent = sentTo.get(`${key}:${sender}`);
      if (sent && at > sent) current.inbound = at;
    }
    threads.set(key, current);
  }
  const contacted = [...threads.values()].filter(t => t.firstOutbound && t.firstOutbound >= since);
  const replied = contacted.filter(t => t.inbound && t.inbound >= since);
  return { contacted: contacted.length, replied: replied.length, rate: contacted.length ? Math.round(replied.length / contacted.length * 100) : null,
    replyCompanyIds: [...new Set([...threads.values()].filter(t => t.inbound && t.inbound > (t.outbound ?? '')).map(t => t.companyId))],
    awaitingCompanyIds: [...new Set([...threads.values()].filter(t => t.outbound && (!t.inbound || t.outbound >= t.inbound)).map(t => t.companyId))] };
}