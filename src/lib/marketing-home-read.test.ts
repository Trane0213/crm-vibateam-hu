import { expect, it } from 'vitest';
import { countMarketingHomeEmails, marketingHomeSummary, readMarketingHomeCompanies, type MarketingHomeCompany } from './marketing-home-read';
import { isMarketingCompany } from './marketing-universe';

const bounds = { today: '2026-11-05T23:00:00Z', todayDay: '2026-11-06', week: '2026-10-30T12:00:00Z', monthDay: '2026-10-07' };
const row = (id: string, extra = {}): MarketingHomeCompany => ({ id, name: `TESZT ${id}`, notes: null, created_at: '2026-11-06T10:00:00Z', ...extra });
function client(rows: MarketingHomeCompany[], failPage = -1) {
  return { from: () => {
    let source = rows; let start = 0; let end = 499;
    const q: any = { select: () => q, order: () => q,
      or: () => { source = source.filter(isMarketingCompany); return q; },
      gte: (_key: string, since: string) => { source = source.filter(r => r.created_at >= since); return q; },
      range: (a: number, b: number) => { start = a; end = b; return q; },
      then: (resolve: any) => Promise.resolve({ data: source.slice(start, end + 1), error: start / 500 === failPage ? new Error('TESZT read failed') : null }).then(resolve),
    }; return q;
  } } as any;
}
it('reads 1001 new companies including manually created companies without truncation', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => row(String(i)));
  const all = await readMarketingHomeCompanies(client(rows), { since: '2026-10-07' });
  expect(marketingHomeSummary([], all, bounds).newCompanies30).toBe(1001);
  expect(marketingHomeSummary([], all, bounds).newCompanies7).toBe(1001);
  expect(marketingHomeSummary([], all, bounds).newToday).toHaveLength(1001);
});
it('counts more than 500 marketing companies with structured and legacy state', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => row(String(i), { marketing_status: 'contacted' }));
  rows.push(row('legacy', { notes: '[MKT:STATUS:qualified:2026-11-06]' }), row('manual'));
  const marketing = await readMarketingHomeCompanies(client(rows), { marketing: true });
  const summary = marketingHomeSummary(marketing, [], bounds);
  expect(summary.decorated.filter(c => c.meta.status === 'contacted')).toHaveLength(1001);
  expect(summary.decorated.filter(c => c.meta.status === 'qualified')).toHaveLength(1);
});
it('counts an old company handed off today independently of new company count', () => {
  const summary = marketingHomeSummary([row('old', { created_at: '2025-01-01', marketing_status: 'handoff', marketing_status_changed_at: '2026-11-05T23:30:00Z' })], [], bounds);
  expect(summary.handoff30).toBe(1); expect(summary.handoffToday).toHaveLength(1); expect(summary.newCompanies30).toBe(0);
});
it('rejects failed later pages instead of returning a partial or zero total', async () => {
  await expect(readMarketingHomeCompanies(client(Array.from({ length: 1001 }, (_, i) => row(String(i))), 1), { since: '2026-10-07' })).rejects.toThrow('TESZT read failed');
});
it('counts 1001+ emails with exact count and preserves fallback date predicate', async () => {
  let predicate = ''; let selected: unknown;
  const q: any = { select: (_s: string, options: unknown) => { selected = options; return q; }, gte: () => q, or: (s: string) => { predicate = s; return q; }, then: (resolve: any) => Promise.resolve({ count: 1501, error: null }).then(resolve) };
  const count = await countMarketingHomeEmails({ from: () => q } as any, '2026-10-07', bounds.week);
  expect(count).toBe(1501); expect(selected).toEqual({ count: 'exact', head: true });
  expect(predicate).toBe('internal_date.gte.2026-10-30T12:00:00Z,and(internal_date.is.null,created_at.gte.2026-10-30T12:00:00Z)');
});
it('rejects missing exact email count instead of claiming zero', async () => {
  const q: any = { select: () => q, gte: () => q, or: () => q, then: (resolve: any) => Promise.resolve({ count: null, error: null }).then(resolve) };
  await expect(countMarketingHomeEmails({ from: () => q } as any, '2026-10-07', bounds.week)).rejects.toThrow('nem igazolt');
});