import { it, expect, vi } from 'vitest';
import { runCampaignPrecheck } from './campaign-precheck.server';

const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, any>[]> }));
function client(tables: Record<string, Record<string, any>[]>) {
  return { from(table: string) {
    let start = 0, end = 999;
    const filters: ((r: Record<string, any>) => boolean)[] = [];
    const q = {
      select: () => q, not: () => q, order: () => q,
      eq: (k: string, value: unknown) => { filters.push(r => r[k] === value); return q; },
      in: (k: string, values: unknown[]) => { filters.push(r => values.includes(r[k])); return q; },
      range: (a: number, b: number) => { start = a; end = b; return q; },
      then: (resolve: any) => Promise.resolve({ data: (tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(start, end + 1), error: null }).then(resolve),
    }; return q;
  } } as any;
}
vi.mock('@/integrations/supabase/client.server', () => ({ supabaseAdmin: { from: (t: string) => client(state.tables).from(t) } }));
const contact = { id: 'contact', company_id: 'company', name: 'TESZT Anna', email: 'Anna@Acme.hu', email_invalid: false, companies: { name: 'TESZT Acme' } };
const sent = { id: 'sent', owner_user_id: 'info', thread_id: 'thread', gmail_message_id: 'gmail-sent', from_email: 'info@vibateam.hu', to_emails: [' ANNA@ACME.HU '], cc_emails: [], bcc_emails: [], is_outbound: true, internal_date: '2026-11-01T08:00:00Z', gmail_label_ids: ['SENT'] };
function setup(messages: Record<string, any>[], blocked = false) {
  state.tables = { marketing_email_suppressions: blocked ? [{email_norm:'anna@acme.hu',blocked:true}] : [], users_profile: [{ auth_user_id: 'info', gmail_email: 'info@vibateam.hu' }, { auth_user_id: 'test', gmail_email: 'viktor.csotai@gmail.com' }], emails: messages, email_threads: [] };
  return runCampaignPrecheck(client({ contacts: [contact] }), ['company']);
}
it('scans beyond 1000 rows and normalizes cached recipient case', async () => {
  const result = await setup([...Array.from({ length: 1000 }, (_, i) => ({ ...sent, id: `noise${i}`, to_emails: ['other@else.hu'] })), sent]);
  expect(result.rows[0]?.status).toBe('contacted');
  expect(result.historyMessages).toBe(1);
  expect(result.historyComplete).toBe(false);
});
it('draft is uncertain, never contacted', async () => expect((await setup([{ ...sent, gmail_label_ids: ['SENT', 'DRAFT'] }])).rows[0]?.status).toBe('uncertain'));
it('explicit address suppression overrides even verified sent history',async()=>expect((await setup([sent],true)).rows[0]?.status).toBe('invalid'));
it('same mailbox, thread and exact later sender proves reply', async () => {
  const r = await setup([sent, { ...sent, id: 'reply', is_outbound: false, from_email: 'Anna@Acme.hu', to_emails: ['info@vibateam.hu'], internal_date: '2026-11-02T08:00:00Z', gmail_label_ids: ['INBOX'] }]);
  expect(r.rows[0]?.status).toBe('replied');
});
it('different thread inbound cannot prove reply', async () => {
  const r = await setup([sent, { ...sent, id: 'reply', thread_id: 'other', is_outbound: false, from_email: 'anna@acme.hu', to_emails: ['info@vibateam.hu'], internal_date: '2026-11-02T08:00:00Z' }]);
  expect(r.rows[0]?.status).toBe('contacted');
});
it('personal test history excluded and missing historical coverage blocks ready', async () => {
  const r = await setup([{ ...sent, owner_user_id: 'test', from_email: 'viktor.csotai@gmail.com' }]);
  expect(r.historyMessages).toBe(0);
  expect(r.rows[0]?.status).toBe('uncertain');
});