/**
 * S7: ajánlatlista és -riport közös számítása, hogy a lista, a riport és a
 * tulajdonosi összesítő ugyanazt a definíciót használja.
 *  - Aktív (nyitott) ajánlat: aktuális verzió, állapota nem lezárt.
 *  - Aktív érték: ügyenként (lead / projekt / önálló ajánlat) CSAK a legnagyobb ismert
 *    nettó számít, így az alternatívák és régi verziók nem adódnak össze.
 *  - Hiányzó összeg nem 0 Ft, külön számolva.
 */
import { CLOSED_QUOTE_STATUSES } from "./quote-status";

export const LEGACY_CLOSED = ["won", "lost"];
export function isClosedQuote(status: string | null | undefined): boolean {
  return CLOSED_QUOTE_STATUSES.includes((status ?? "draft") as any) || LEGACY_CLOSED.includes(status ?? "");
}
export function isActiveQuote(q: { status: string | null; is_current: boolean | null }): boolean {
  return q.is_current !== false && !isClosedQuote(q.status);
}

export type ReportQuote = { id: string; lead_id: string | null; project_id: string | null; status: string | null; is_current: boolean | null; net: number | null };

export function dealKey(q: { id: string; lead_id: string | null; project_id: string | null }): string {
  return q.lead_id ? `l:${q.lead_id}` : q.project_id ? `p:${q.project_id}` : `q:${q.id}`;
}

export function summarizeActiveQuotes(quotes: ReportQuote[]) {
  const active = quotes.filter(isActiveQuote);
  const best = new Map<string, number | null>();
  for (const q of active) {
    const k = dealKey(q);
    const prev = best.get(k);
    if (q.net == null) { if (!best.has(k)) best.set(k, null); continue; }
    if (prev == null || q.net > prev) best.set(k, q.net);
  }
  let net = 0, withValue = 0, withoutValue = 0;
  for (const v of best.values()) { if (v == null) withoutValue++; else { withValue++; net += v; } }
  const byStatus: Record<string, number> = {};
  for (const q of quotes.filter((x) => x.is_current !== false)) {
    const s = q.status ?? "draft";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  return { activeCount: active.length, deals: best.size, net: withValue > 0 ? net : null, withValue, withoutValue, byStatus };
}

export type ListFilter = { search: string; status: string; currentOnly: boolean };
export function filterQuoteRows<T extends { status: string | null; is_current: boolean | null; searchText: string }>(rows: T[], f: ListFilter): T[] {
  const s = f.search.trim().toLocaleLowerCase("hu");
  return rows.filter((r) =>
    (!f.currentOnly || r.is_current !== false) &&
    (f.status === "all" || (r.status ?? "draft") === f.status) &&
    (!s || r.searchText.toLocaleLowerCase("hu").includes(s)));
}
