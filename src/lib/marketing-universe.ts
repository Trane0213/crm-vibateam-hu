/**
 * Marketing univerzum — EGYETLEN definíció arra, hogy "mely cégek
 * tartoznak a marketing modulhoz". Minden marketing képernyő (kampánylista,
 * marketing-home dashboard, workspace) EZT a lekérdezést és EZT a
 * predikátumot használja, hogy ugyanaz a cég ugyanazon a halmazon belül
 * legyen mindenhol.
 *
 * Definíció:
 *   marketing univerzum =
 *     companies.company_type = 'potencialis'
 *     OR companies.notes tartalmaz [MKT:STATUS:…] markert
 *     OR companies.notes tartalmaz [KAMPANY:…] markert
 *
 * Indok: a `company_type` átírható (pl. sales kapcsolatba lépett →
 * generalkivitelezo), de a marketing státusz markerek megmaradnak. Ha csak
 * company_type alapján szűrnénk, az átadott / már kapcsolatba lépett cégek
 * kiesnének a marketing dashboardról és a riportokból.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST `or=` szűrő része — minden marketinghez tartozó cégre matchel. */
export const MARKETING_OR_FILTER =
  "company_type.eq.potencialis,notes.ilike.*[MKT:STATUS:*,notes.ilike.*[KAMPANY:*";

/** JavaScript-oldali predikátum ugyanezzel a definícióval. */
export function isMarketingCompany(row: {
  company_type?: string | null;
  notes?: string | null;
}): boolean {
  if (row.company_type === "potencialis") return true;
  const n = row.notes ?? "";
  return /\[MKT:STATUS:/.test(n) || /\[KAMPANY:/.test(n);
}

/**
 * Marketing univerzum lekérdezése — egyetlen helyen definiált SELECT.
 * A hívó dönti el, hogy mit kér vissza, de a szűrő mindig ez.
 */
export async function selectMarketingCompanies<T extends string = string>(
  client: SupabaseClient,
  select: T = "id,name,notes,created_at,company_type" as T,
  opts: { limit?: number } = {},
) {
  let q = client
    .from("companies")
    .select(select as any)
    .or(MARKETING_OR_FILTER)
    .order("created_at", { ascending: false });
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any[];
}