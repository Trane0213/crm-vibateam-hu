import type { SupabaseClient } from '@supabase/supabase-js';
import { MARKETING_OR_FILTER } from './marketing-universe';
import { readMarketingMeta, type CompanyMarketingState } from './marketing-status';

export type MarketingHomeCompany = CompanyMarketingState & {
  id: string; name: string; notes: string | null; created_at: string;
};
const COMPANY_SELECT = 'id,name,notes,created_at,marketing_status,marketing_status_changed_at,marketing_status_changed_by,marketing_status_source,marketing_handoff_lead_id';
const PAGE_SIZE = 500;

/** User-client reads only. Reject rather than report an unverified partial total. */
export async function readMarketingHomeCompanies(client: SupabaseClient, scope: { marketing: true } | { since: string }): Promise<MarketingHomeCompany[]> {
  const rows: MarketingHomeCompany[] = [];
  const seen = new Set<string>();
  for (let page = 0; page < 100; page++) {
    let q = client.from('companies').select(COMPANY_SELECT);
    q = 'marketing' in scope ? q.or(MARKETING_OR_FILTER) : q.gte('created_at', scope.since);
    const { data, error } = await q.order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
    if (error) throw error;
    if (!data) throw new Error('A céglista teljessége nem igazolt.');
    for (const row of data as MarketingHomeCompany[]) {
      if (seen.has(row.id)) throw new Error('A céglista olvasás közben megváltozott; frissítés szükséges.');
      seen.add(row.id); rows.push(row);
    }
    if (data.length < PAGE_SIZE) return rows;
  }
  throw new Error('A céglista részleges; az összesítő nem igazolt.');
}

export async function countMarketingHomeEmails(client: SupabaseClient, monthAgo: string, weekAgo: string): Promise<number> {
  // Preserve the existing creation window and internal_date ?? created_at meaning.
  const { count, error } = await client.from('emails').select('id', { count: 'exact', head: true })
    .gte('created_at', monthAgo)
    .or(`internal_date.gte.${weekAgo},and(internal_date.is.null,created_at.gte.${weekAgo})`);
  if (error) throw error;
  if (count == null) throw new Error('Az emailaktivitás darabszáma nem igazolt.');
  return count;
}

export function marketingHomeSummary(marketing: MarketingHomeCompany[], allRecent: MarketingHomeCompany[], bounds: { today: string; week: string; todayDay: string; monthDay: string }) {
  const decorated = marketing.map(c => ({ ...c, meta: readMarketingMeta(c.notes, c) }));
  const allDecorated = allRecent.map(c => ({ ...c, meta: readMarketingMeta(c.notes, c) }));
  return {
    decorated,
    newToday: allDecorated.filter(c => c.created_at >= bounds.today && c.meta.status !== 'handoff' && c.meta.status !== 'rejected'),
    newCompanies7: allDecorated.filter(c => c.created_at >= bounds.week).length,
    newCompanies30: allDecorated.length,
    handoffToday: decorated.filter(c => c.meta.status === 'handoff' && c.meta.statusDate && c.meta.statusDate >= bounds.todayDay),
    handoff30: decorated.filter(c => c.meta.status === 'handoff' && c.meta.statusDate && c.meta.statusDate >= bounds.monthDay).length,
  };
}