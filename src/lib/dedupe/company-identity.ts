import { supabase } from "@/integrations/supabase/client";
import { extractDomain, isPublicDomain } from "@/lib/enrichment/enrich";
import { normalizeCompanyName, normalizeTaxNumber } from "./normalize";

/**
 * Company Identity Service
 * ─────────────────────────
 * Egy cég „valós” azonosító jegyeit szolgáltatja a meglévő CRM-adatokból.
 * Külső API NEM hívott; a service interface előkészítve van későbbi
 * NAV / OPTEN / Céginfó / Clearbit forrásokra (lásd `enrichFromExternal`).
 *
 * Nem ír adatbázist. Csak olvas és aggregál.
 */

export type CompanyIdentity = {
  id: string;
  /** Cégjegyzék szerinti hivatalos név — most a `name` mező, később külső forrásból. */
  legalName: string;
  /** Normalizált név egyezésvizsgálathoz. */
  canonicalName: string;
  taxNumber: string | null;
  /** Normalizált adószám-törzs (8 jegy), illesztéshez. */
  taxTrunk: string | null;
  domain: string | null;
  website: string | null;
  /** A céghez kötött email címek (contacts + threads.participants), publikusak nélkül. */
  knownEmails: string[];
  /** Az alapadatokat „erősen azonosítónak” tartjuk-e (≥ 2 mező kitöltve). */
  isStrongIdentity: boolean;
  /** Külső adatforrás (most mindig `crm_internal`). */
  source: "crm_internal";
};

export async function resolveCompanyIdentity(companyId: string): Promise<CompanyIdentity | null> {
  if (!companyId) return null;
  const [{ data: c }, contacts, threads] = await Promise.all([
    supabase.from("companies").select("id,name,domain,website,tax_number").eq("id", companyId).maybeSingle(),
    supabase.from("contacts").select("email").eq("company_id", companyId),
    supabase.from("email_threads").select("participants").eq("company_id", companyId).limit(50),
  ]);
  if (!c) return null;

  const emails = new Set<string>();
  for (const k of contacts.data ?? []) if (k.email) emails.add(String(k.email).toLowerCase());
  for (const t of threads.data ?? []) for (const p of t.participants ?? []) {
    const d = extractDomain(p);
    if (d && !isPublicDomain(d)) emails.add(String(p).toLowerCase());
  }

  const taxTrunk = normalizeTaxNumber(c.tax_number) || null;
  const filled = [c.tax_number, c.domain, c.website].filter(Boolean).length;

  return {
    id: c.id,
    legalName: c.name,
    canonicalName: normalizeCompanyName(c.name),
    taxNumber: c.tax_number ?? null,
    taxTrunk,
    domain: c.domain ?? null,
    website: c.website ?? null,
    knownEmails: [...emails],
    isStrongIdentity: filled >= 2,
    source: "crm_internal",
  };
}

/**
 * Külső adatforrás bekötési pont.
 * Most NEM hív hálózati API-t — visszaadja a belső identitást változatlanul,
 * de a függvényszignatúra véglegesített, hogy NAV/OPTEN/Clearbit később
 * cserélhetően becsatolható legyen.
 *
 * Várt jövőbeli implementáció:
 *   1. taxTrunk alapján NAV vagy OPTEN lekérés
 *   2. találat esetén `legalName`, `tax_number`, `website`, `address`, `industry` letöltés
 *   3. confidence + audit (`enrichment_source`, `enriched_at`) mentése
 *      — ezek a mezők még nincsenek a sémában, lásd D2 elemzés.
 */
export async function enrichFromExternal(
  identity: CompanyIdentity,
  _options?: { source?: "nav" | "opten" | "ceginfo" | "clearbit" | "bisnode" },
): Promise<CompanyIdentity> {
  return identity;
}