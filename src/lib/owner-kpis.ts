/**
 * Tulajdonosi KPI-k közös definíciója — a „Ma" (OwnerHome) és az „Irányítópult"
 * (/dashboard) UGYANEZT használja, hogy egy KPI mindkét helyen ugyanazt jelentse.
 *
 * Definíciók (forrás: meglévő táblák, RLS a hívó jogosultsága szerint):
 *  - Nyitott ajánlat: quotes, status NOT IN (won, lost), csak aktuális verzió (is_current ≠ false).
 *    Érték: NETTÓ, a quote_items tételeiből (quoteNet) — a quotes.total_amount nincs karbantartva.
 *    Tétel nélküli ajánlat értéke „nincs rögzítve", nem 0 Ft.
 *  - Napi határok: Europe/Budapest helyi nap (nem a böngésző időzónája).
 *  - TESZT: cégnév / ajánlat cím / lead összegzés „TESZT" kezdetű vagy azt tartalmazó rekord — külön jelölve.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { quoteNet } from "@/lib/sales/quote-net";

const TZ = "Europe/Budapest";

/** Budapest-i időzóna eltolása (perc) egy adott pillanatban. */
function tzOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** A budapesti naptári nap [start, end] határai UTC ISO-ban; offsetDays=1 → holnap. */
export function budapestDayBounds(now: Date = new Date(), offsetDays = 0): { start: string; end: string } {
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = ymd.split("-").map(Number);
  const localMidnightAsUtc = Date.UTC(y, m - 1, d + offsetDays, 0, 0, 0);
  const startMs = localMidnightAsUtc - tzOffsetMinutes(new Date(localMidnightAsUtc)) * 60000;
  const nextMidnightAsUtc = Date.UTC(y, m - 1, d + offsetDays + 1, 0, 0, 0);
  const endMs = nextMidnightAsUtc - tzOffsetMinutes(new Date(nextMidnightAsUtc)) * 60000 - 1;
  return { start: new Date(startMs).toISOString(), end: new Date(endMs).toISOString() };
}

export const isTestLabel = (...texts: (string | null | undefined)[]) =>
  texts.some((t) => !!t && /TESZT/i.test(t));

export type OpenQuotesSummary = {
  count: number;
  /** Nettó összeg a tételes ajánlatokból; null, ha egyik ajánlatnak sincs tétele. */
  net: number | null;
  withValue: number;
  withoutValue: number;
  testCount: number;
  testNet: number;
};

type QuoteRow = { id: string; title: string | null; status: string | null; discount_percent: number | null; is_current: boolean | null };
type ItemRow = { quote_id: string; quantity: number | null; unit_price: number | null };

export function summarizeOpenQuotes(quotes: QuoteRow[], items: ItemRow[], companyTest: Set<string> = new Set()): OpenQuotesSummary {
  const byQuote = new Map<string, ItemRow[]>();
  for (const it of items) {
    const a = byQuote.get(it.quote_id) ?? [];
    a.push(it); byQuote.set(it.quote_id, a);
  }
  let net = 0, withValue = 0, withoutValue = 0, testCount = 0, testNet = 0;
  for (const q of quotes) {
    const its = byQuote.get(q.id) ?? [];
    const isTest = isTestLabel(q.title) || companyTest.has(q.id);
    if (isTest) testCount++;
    if (its.length === 0) { withoutValue++; continue; }
    const v = quoteNet(its as any, q.discount_percent);
    withValue++; net += v;
    if (isTest) testNet += v;
  }
  return { count: quotes.length, net: withValue > 0 ? net : null, withValue, withoutValue, testCount, testNet };
}

const PAGE = 1000;
async function fetchAllPages<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function useOpenQuotesSummary() {
  return useQuery({
    queryKey: ["quotes", "owner-open-summary"],
    staleTime: 30_000,
    queryFn: async (): Promise<OpenQuotesSummary> => {
      const quotes = await fetchAllPages<QuoteRow & { company_id: string | null }>((f, t) =>
        supabase.from("quotes").select("id,title,status,discount_percent,is_current,company_id")
          .not("status", "in", "(won,lost)").or("is_current.is.null,is_current.eq.true").order("id").range(f, t));
      const ids = quotes.map((q) => q.id);
      const items: ItemRow[] = [];
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        items.push(...await fetchAllPages<ItemRow>((f, t) =>
          supabase.from("quote_items").select("quote_id,quantity,unit_price").in("quote_id", chunk).order("id").range(f, t)));
      }
      const companyIds = Array.from(new Set(quotes.map((q) => q.company_id).filter(Boolean) as string[]));
      const testCompanies = new Set<string>();
      for (let i = 0; i < companyIds.length; i += 200) {
        const { data, error } = await supabase.from("companies").select("id,name").in("id", companyIds.slice(i, i + 200));
        if (error) throw error;
        for (const c of data ?? []) if (isTestLabel((c as any).name)) testCompanies.add((c as any).id);
      }
      const testQuoteIds = new Set(quotes.filter((q) => q.company_id && testCompanies.has(q.company_id)).map((q) => q.id));
      return summarizeOpenQuotes(quotes, items, testQuoteIds);
    },
  });
}

/** Sales / projekt állapot a tulajdonosnak — csak meglévő mezőkből. */
export type SalesProjectSnapshot = {
  salesPrep: number;      // status new/contacted, még nincs Pipeline-ban
  pipeline: number;       // Pipeline-ban, nyitott
  won: number; lost: number; wonTest: number; lostTest: number;
  projectsHandoff: number; // projekt státusz „atadas"
  projectsNoPm: number;
  projectsTotal: number; projectsTest: number;
};

export function useSalesProjectSnapshot() {
  return useQuery({
    queryKey: ["leads", "owner-sales-project-snapshot"],
    staleTime: 30_000,
    queryFn: async (): Promise<SalesProjectSnapshot> => {
      const leads = await fetchAllPages<any>((f, t) =>
        supabase.from("leads").select("id,status,pipeline_entered_at,summary,company_id").order("id").range(f, t));
      const projects = await fetchAllPages<any>((f, t) =>
        supabase.from("projects").select("id,title,status,project_manager_user_id").order("id").range(f, t));
      const closedCompanyIds = Array.from(new Set(leads.filter((l) => l.status === "won" || l.status === "lost").map((l) => l.company_id).filter(Boolean)));
      const testCo = new Set<string>();
      for (let i = 0; i < closedCompanyIds.length; i += 200) {
        const { data, error } = await supabase.from("companies").select("id,name").in("id", closedCompanyIds.slice(i, i + 200));
        if (error) throw error;
        for (const c of data ?? []) if (isTestLabel((c as any).name)) testCo.add((c as any).id);
      }
      const isT = (l: any) => isTestLabel(l.summary) || (l.company_id && testCo.has(l.company_id));
      const s: SalesProjectSnapshot = { salesPrep: 0, pipeline: 0, won: 0, lost: 0, wonTest: 0, lostTest: 0, projectsHandoff: 0, projectsNoPm: 0, projectsTotal: projects.length, projectsTest: 0 };
      for (const l of leads) {
        if (l.status === "won") { s.won++; if (isT(l)) s.wonTest++; }
        else if (l.status === "lost") { s.lost++; if (isT(l)) s.lostTest++; }
        else if (l.pipeline_entered_at) s.pipeline++;
        else s.salesPrep++;
      }
      for (const p of projects) {
        if (p.status === "atadas") s.projectsHandoff++;
        if (!p.project_manager_user_id) s.projectsNoPm++;
        if (isTestLabel(p.title)) s.projectsTest++;
      }
      return s;
    },
  });
}

/** KPI megjelenítés: betöltés / hiba ne 0-ként látszódjon. */
export function kpiDisplay(q: { isLoading: boolean; isError: boolean; data?: number | null }): number | string {
  if (q.isLoading) return "…";
  if (q.isError) return "hiba";
  return q.data ?? "—";
}
