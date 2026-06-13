import { supabase } from "@/integrations/supabase/client";

/** Publikus email szolgáltatók — ezekből NEM lehet cégdomaint származtatni. */
export const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com",
  "yahoo.com", "yahoo.co.uk", "yahoo.hu",
  "hotmail.com", "hotmail.hu",
  "outlook.com", "outlook.hu", "live.com", "msn.com",
  "icloud.com", "me.com", "mac.com",
  "freemail.hu", "citromail.hu", "vipmail.hu", "indamail.hu", "t-online.hu",
  "proton.me", "protonmail.com",
]);

/** Email-ből vagy URL-ből kinyerett tiszta domain (lowercase, www nélkül). */
export function extractDomain(input?: string | null): string | null {
  if (!input) return null;
  const s = String(input).trim().toLowerCase();
  if (!s) return null;
  const at = s.includes("@") ? s.split("@")[1] : s;
  const clean = at
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .trim();
  if (!clean || !clean.includes(".")) return null;
  return clean;
}

export function isPublicDomain(domain?: string | null): boolean {
  if (!domain) return true;
  return PUBLIC_EMAIL_DOMAINS.has(domain.toLowerCase());
}

/** Egyértelmű (1 elem) domain a forrás-listából, publikusakat kiszűrve. */
function uniqueBusinessDomain(values: (string | null | undefined)[]): string | null {
  const set = new Set<string>();
  for (const v of values) {
    const d = extractDomain(v);
    if (d && !isPublicDomain(d)) set.add(d);
  }
  return set.size === 1 ? [...set][0] : null;
}

/**
 * Cégkeresés a `companies.website`-ből származtatott domain alapján.
 * Az élő sémában nincs külön `domain` oszlop, ezért client-side szűrünk.
 * Limit: 2000 cég (CRM-méretre bőven elég).
 */
export async function findCompaniesByDerivedDomain(domain: string): Promise<{ id: string }[]> {
  const d = String(domain ?? "").toLowerCase().trim();
  if (!d) return [];
  const { data } = await supabase
    .from("companies")
    .select("id,website")
    .not("website", "is", null)
    .limit(2000);
  const out: { id: string }[] = [];
  for (const c of (data ?? []) as Array<{ id: string; website: string | null }>) {
    if (extractDomain(c.website) === d) out.push({ id: c.id });
  }
  return out;
}

export type EnrichResult = {
  ok: boolean;
  patch: Record<string, any>;
  changed: string[];
  reason?: string;
};

const EMPTY: EnrichResult = { ok: true, patch: {}, changed: [] };

/* ────────────────── COMPANY ────────────────── */

export async function enrichCompanyFromExistingData(companyId: string): Promise<EnrichResult> {
  if (!companyId) return EMPTY;
  const [{ data: company }, contacts, threads, emails] = await Promise.all([
    supabase.from("companies").select("id,name,website,notes").eq("id", companyId).maybeSingle(),
    supabase.from("contacts").select("email").eq("company_id", companyId),
    supabase.from("email_threads").select("participants").eq("company_id", companyId).limit(50),
    supabase.from("emails").select("from_email").eq("company_id", companyId).limit(50),
  ]);
  if (!company) return { ...EMPTY, ok: false, reason: "company not found" };

  const patch: Record<string, any> = {};
  const changed: string[] = [];

  // 1) Website — domain alapú származtatás kontakt/thread/email/lead forrásokból.
  //    A `companies` táblában nincs külön `domain` mező; a hivatalos forrás a `website`.
  if (!company.website) {
    const candidates: (string | null | undefined)[] = [];
    for (const c of contacts.data ?? []) candidates.push(c.email);
    for (const t of threads.data ?? []) for (const p of t.participants ?? []) candidates.push(p);
    for (const e of emails.data ?? []) candidates.push(e.from_email);
    const d = uniqueBusinessDomain(candidates);
    if (d && !isPublicDomain(d)) { patch.website = `https://${d}`; changed.push("website"); }
  }

  if (Object.keys(patch).length === 0) return EMPTY;
  const { error } = await supabase.from("companies").update(patch).eq("id", companyId);
  if (error) return { ok: false, patch, changed: [], reason: error.message };
  return { ok: true, patch, changed };
}

/* ────────────────── CONTACT ────────────────── */

export async function enrichContactFromExistingData(contactId: string): Promise<EnrichResult> {
  if (!contactId) return EMPTY;
  const { data: contact } = await supabase
    .from("contacts")
    .select("id,name,email,phone,company_id")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) return { ...EMPTY, ok: false, reason: "contact not found" };

  const patch: Record<string, any> = {};
  const changed: string[] = [];

  // 1) company_id email domain alapján — companies.website-ből származtatva.
  if (!contact.company_id && contact.email) {
    const d = extractDomain(contact.email);
    if (d && !isPublicDomain(d)) {
      const matches = await findCompaniesByDerivedDomain(d);
      if (matches.length === 1) {
        patch.company_id = matches[0].id;
        changed.push("company_id");
      }
    }
  }

  // 2) email kitöltése linkelt threadek participants alapján (csak ha 1 üzleti domain)
  if (!contact.email) {
    const { data: threads } = await supabase
      .from("email_threads")
      .select("participants")
      .eq("contact_id", contactId)
      .limit(20);
    const all: string[] = [];
    for (const t of threads ?? []) for (const p of t.participants ?? []) all.push(p);
    // Csak akkor írunk, ha egyetlen üzleti domain-ből származó cím van
    const candidates = all.filter((p) => {
      const d = extractDomain(p);
      return d && !isPublicDomain(d);
    });
    const uniqueAddrs = [...new Set(candidates.map((c) => c.toLowerCase()))];
    if (uniqueAddrs.length === 1) {
      patch.email = uniqueAddrs[0];
      changed.push("email");
    }
  }

  if (Object.keys(patch).length === 0) return EMPTY;
  const { error } = await supabase.from("contacts").update(patch).eq("id", contactId);
  if (error) return { ok: false, patch, changed: [], reason: error.message };
  return { ok: true, patch, changed };
}

/* ────────────────── LEAD ────────────────── */

export async function enrichLeadLinks(leadId: string): Promise<EnrichResult> {
  if (!leadId) return EMPTY;
  const { data: lead } = await supabase
    .from("leads")
    .select("id,email,company_id,contact_id")
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ...EMPTY, ok: false, reason: "lead not found" };

  const patch: Record<string, any> = {};
  const changed: string[] = [];

  // 1) company_id — email domain → companies.website-ből származtatott domain
  if (!lead.company_id && lead.email) {
    const d = extractDomain(lead.email);
    if (d && !isPublicDomain(d)) {
      const matches = await findCompaniesByDerivedDomain(d);
      if (matches.length === 1) {
        patch.company_id = matches[0].id;
        changed.push("company_id");
      }
    }
  }

  // 2) contact_id — email egyezés
  if (!lead.contact_id && lead.email) {
    const companyId = patch.company_id ?? lead.company_id;
    let q = supabase.from("contacts").select("id").ilike("email", lead.email).limit(2);
    if (companyId) q = q.eq("company_id", companyId);
    const { data: matches } = await q;
    if (matches && matches.length === 1) {
      patch.contact_id = matches[0].id;
      changed.push("contact_id");
    }
  }

  if (Object.keys(patch).length === 0) return EMPTY;
  const { error } = await supabase.from("leads").update(patch).eq("id", leadId);
  if (error) return { ok: false, patch, changed: [], reason: error.message };
  return { ok: true, patch, changed };
}

/* ────────────────── AUTO-RUN HOOK ────────────────── */

const FIELD_LABELS: Record<string, string> = {
  website: "weboldal",
  company_id: "cég",
  contact_id: "kapcsolattartó",
  email: "email",
};

export function enrichmentFieldLabel(key: string) {
  return FIELD_LABELS[key] ?? key;
}

export function formatEnrichmentMessage(changed: string[]): string {
  return changed.map((k) => enrichmentFieldLabel(k)).join(", ");
}

/** Sessionön belüli dedup: ugyanazt a rekordot nem futtatjuk újra. */
const RAN = new Set<string>();
const RESULTS = new Map<string, EnrichResult>();
export function markEnriched(kind: "company" | "contact" | "lead", id: string) {
  RAN.add(`${kind}:${id}`);
}
export function wasEnriched(kind: "company" | "contact" | "lead", id: string) {
  return RAN.has(`${kind}:${id}`);
}
export function setEnrichmentResult(kind: "company" | "contact" | "lead", id: string, result: EnrichResult) {
  RESULTS.set(`${kind}:${id}`, result);
}
export function getEnrichmentResult(kind: "company" | "contact" | "lead", id: string) {
  return RESULTS.get(`${kind}:${id}`) ?? null;
}