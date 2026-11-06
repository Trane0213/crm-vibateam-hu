import { it, expect } from 'vitest';
import { buildTimeline } from './marketing-timeline';
import { readMarketingMeta } from './marketing-status';
const email = { id: 'test-mail', from_email: 'info@vibateam.hu', is_outbound: true, internal_date: '2026-11-06T08:00:00Z', gmail_message_id: 'gmail-id', gmail_label_ids: ['SENT'] };
const run = (mail: typeof email) => buildTimeline({ company: { name: 'TESZT', created_at: '2026-01-01T00:00:00Z' }, contacts: [], docs: [], emails: [mail], meta: readMarketingMeta(null) }, null);
it('draft cannot become sent event even with SENT label', () => expect(run({ ...email, gmail_label_ids: ['SENT', 'DRAFT'] }).find(e => e.kind === 'email_sent')).toBeUndefined());
it('outbound flag alone cannot become sent event', () => expect(run({ ...email, gmail_label_ids: [] }).find(e => e.kind === 'email_sent')).toBeUndefined());
it('valid cached corporate SENT is a sent event', () => expect(run(email).filter(e => e.kind === 'email_sent')).toHaveLength(1));