import { supabase } from "@/integrations/supabase/client";
import { computeCompanyScore, type CompanyScore } from "./scoring";
import { normalizeCompanyName, normalizePhone, normalizeTaxNumber, similarity } from "./normalize";
import { extractDomain, isPublicDomain } from "@/lib/enrichment/enrich";

/* ────── Hiányos cégek (top N) ────── */
export type IncompleteCompanyRow = {
  id: string;
  name: string;
  company_type?: string | null;
  score: CompanyScore;
};

export async function scanIncompleteCompanies(limit = 200): Promise<IncompleteCompanyRow[]> {
  const { data: companies } = await supabase
    .from("companies")
    .select("id,name,company_type,tax_number,website")
    .order("created_at", { ascending: false })
    .limit(1000);
  if (!companies?.length) return [];
  const ids = companies.map((c) => c.id);
  const { data: contacts } = await supabase
    .from("contacts")
    .select("company_id,email,phone")
    .in("company_id", ids);
  const byCompany = new Map<string, { email?: string | null; phone?: string | null }[]>();
  for (const c of contacts ?? []) {
    if (!c.company_id) continue;
    const arr = byCompany.get(c.company_id) ?? [];
    arr.push({ email: c.email, phone: c.phone });
    byCompany.set(c.company_id, arr);
  }
  return companies
    .map((c) => ({ id: c.id, name: c.name, company_type: c.company_type, score: computeCompanyScore(c as any, byCompany.get(c.id) ?? []) }))
    .filter((r) => r.score.pct < 100)
    .sort((a, b) => a.score.pct - b.score.pct)
    .slice(0, limit);
}

/* ────── Globális duplikátum-párok ────── */
export type CompanyDuplicatePair = {
  a: { id: string; name: string };
  b: { id: string; name: string };
  reason: "name_exact" | "name_similar" | "domain" | "tax_number";
  confidence: number;
};

export async function scanCompanyDuplicatePairs(): Promise<CompanyDuplicatePair[]> {
  const { data: rows } = await supabase
    .from("companies")
    .select("id,name,website,tax_number")
    .limit(1000);
  const list = rows ?? [];
  const pairs: CompanyDuplicatePair[] = [];
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const aTax = normalizeTaxNumber(a.tax_number);
    const aNorm = normalizeCompanyName(a.name);
    const aDom = extractDomain(a.website);
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (aTax && normalizeTaxNumber(b.tax_number) === aTax) {
        pairs.push({ a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, reason: "tax_number", confidence: 1 });
        continue;
      }
      const bDom = extractDomain(b.website);
      if (aDom && bDom && bDom === aDom && !isPublicDomain(aDom)) {
        pairs.push({ a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, reason: "domain", confidence: 0.95 });
        continue;
      }
      const bNorm = normalizeCompanyName(b.name);
      if (aNorm && bNorm) {
        if (aNorm === bNorm) {
          pairs.push({ a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, reason: "name_exact", confidence: 0.9 });
        } else {
          const sim = similarity(aNorm, bNorm);
          if (sim >= 0.85) pairs.push({ a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name }, reason: "name_similar", confidence: sim });
        }
      }
    }
  }
  return pairs.sort((x, y) => y.confidence - x.confidence);
}

/* ────── Globális kontakt-konfliktusok (több cégen át) ────── */
export type ContactGlobalConflict = {
  key: "email" | "phone";
  value: string;
  contacts: { id: string; name: string | null; company_id: string | null }[];
};

export async function scanContactConflicts(): Promise<ContactGlobalConflict[]> {
  const { data: rows } = await supabase
    .from("contacts")
    .select("id,name,email,phone,company_id")
    .limit(5000);
  if (!rows?.length) return [];

  const group = (key: "email" | "phone", norm: (v: string) => string) => {
    const buckets = new Map<string, { value: string; ids: typeof rows; companies: Set<string> }>();
    for (const r of rows) {
      const raw = r[key] as string | null;
      if (!raw) continue;
      const k = norm(String(raw));
      if (!k) continue;
      const b = buckets.get(k) ?? { value: raw, ids: [] as any, companies: new Set<string>() };
      (b.ids as any).push(r);
      if (r.company_id) b.companies.add(r.company_id);
      buckets.set(k, b);
    }
    const out: ContactGlobalConflict[] = [];
    for (const b of buckets.values()) {
      if (b.companies.size >= 2 || b.ids.length > 2) {
        out.push({
          key, value: b.value,
          contacts: b.ids.map((r: any) => ({ id: r.id, name: r.name, company_id: r.company_id })),
        });
      }
    }
    return out;
  };

  return [
    ...group("email", (v) => v.trim().toLowerCase()),
    ...group("phone", (v) => normalizePhone(v)),
  ];
}

/* ────── Linkeletlen leadek + email threadek ────── */
export type UnlinkedLeadRow = { id: string; email: string; summary: string | null; suggestedCompany: { id: string; name: string } };

export async function scanUnlinkedLeads(): Promise<UnlinkedLeadRow[]> {
  const { data: leads } = await supabase
    .from("leads")
    .select("id,email,summary,company_id")
    .is("company_id", null)
    .not("email", "is", null)
    .limit(500);
  if (!leads?.length) return [];
  const domains = new Map<string, string>();
  for (const l of leads) {
    const d = extractDomain(l.email);
    if (d && !isPublicDomain(d)) domains.set(l.id, d);
  }
  const uniqueDomains = [...new Set(domains.values())];
  if (uniqueDomains.length === 0) return [];
  const { data: companies } = await supabase
    .from("companies")
    .select("id,name,website")
    .not("website", "is", null)
    .limit(5000);
  const byDomain = new Map<string, { id: string; name: string }[]>();
  for (const c of companies ?? []) {
    const d = extractDomain(c.website);
    if (!d) continue;
    const arr = byDomain.get(d) ?? [];
    arr.push({ id: c.id, name: c.name });
    byDomain.set(d, arr);
  }
  const out: UnlinkedLeadRow[] = [];
  for (const l of leads) {
    const d = domains.get(l.id);
    if (!d) continue;
    const matches = byDomain.get(d) ?? [];
    if (matches.length === 1) {
      out.push({ id: l.id, email: l.email!, summary: l.summary, suggestedCompany: matches[0] });
    }
  }
  return out;
}

export type UnlinkedThreadRow = {
  id: string;
  subject: string | null;
  last_message_at: string | null;
  suggestedCompany: { id: string; name: string };
};

export async function scanUnlinkedThreads(): Promise<UnlinkedThreadRow[]> {
  const { data: threads } = await supabase
    .from("email_threads")
    .select("id,subject,participants,last_message_at,company_id")
    .is("company_id", null)
    .order("last_message_at", { ascending: false })
    .limit(300);
  if (!threads?.length) return [];

  // Az összes ismert üzleti domain-cég map.
  const { data: companies } = await supabase
    .from("companies")
    .select("id,name,website")
    .not("website", "is", null)
    .limit(2000);
  const byDomain = new Map<string, { id: string; name: string }>();
  for (const c of companies ?? []) {
    const d = extractDomain(c.website);
    if (d && !isPublicDomain(d)) byDomain.set(d, { id: c.id, name: c.name });
  }

  const out: UnlinkedThreadRow[] = [];
  for (const t of threads) {
    const domainsInThread = new Set<string>();
    for (const p of t.participants ?? []) {
      const d = extractDomain(p);
      if (d && !isPublicDomain(d)) domainsInThread.add(d);
    }
    let matched: { id: string; name: string } | null = null;
    for (const d of domainsInThread) {
      const m = byDomain.get(d);
      if (m) { matched = m; break; }
    }
    if (matched) {
      out.push({ id: t.id, subject: t.subject, last_message_at: t.last_message_at, suggestedCompany: matched });
    }
  }
  return out;
}

/* ────── Mutációk: 1-kattintásos összekapcsolás ────── */
export async function linkLeadToCompany(leadId: string, companyId: string) {
  const { error } = await supabase.from("leads").update({ company_id: companyId }).eq("id", leadId);
  if (error) throw error;
}
export async function linkThreadToCompany(threadId: string, companyId: string) {
  const { error } = await supabase.from("email_threads").update({ company_id: companyId }).eq("id", threadId);
  if (error) throw error;
}