/**
 * Marketing univerzum — EGYETLEN definíció arra, hogy "mely cégek
 * tartoznak a marketing modulhoz". Minden marketing képernyő (kampánylista,
 * marketing-home dashboard, workspace) EZT a lekérdezést és EZT a
 * predikátumot használja, hogy ugyanaz a cég ugyanazon a halmazon belül
 * legyen mindenhol.
 *
 * Definíció:
 *   marketing univerzum =
 *     companies.notes tartalmaz bármilyen marketing workflow markert
 *     ([MKT:…] vagy [KAMPANY:…])
 *     VAGY tartalmazza a Scarlet kampány forrás sort.
 *
 * Indok: a `company_type` tisztán információ, nem workflow-logika. Egy rekord
 * marketing-beli láthatóságát kizárólag a marketing adatfolyam nyomai
 * határozhatják meg, nem a cégtípus.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const MARKETING_SOURCE_TEXT_RX = /Forrás:\s*Scarlet kampány/i;

/** PostgREST `or=` szűrő része — minden marketinghez tartozó cégre matchel. */
export const MARKETING_OR_FILTER =
  "notes.ilike.*[MKT:*,notes.ilike.*[KAMPANY:*,notes.ilike.*Forrás: Scarlet kampány*";

/** JavaScript-oldali predikátum ugyanezzel a definícióval. */
export function isMarketingCompany(row: {
  company_type?: string | null;
  notes?: string | null;
}): boolean {
  const n = row.notes ?? "";
  return /\[MKT:/.test(n) || /\[KAMPANY:/.test(n) || MARKETING_SOURCE_TEXT_RX.test(n);
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