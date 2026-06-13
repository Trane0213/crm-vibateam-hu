import { supabase } from "@/integrations/supabase/client";
import { normalizeCompanyName, normalizePhone, normalizeTaxNumber, similarity } from "./normalize";
import { extractDomain, isPublicDomain } from "@/lib/enrichment/enrich";

/* ──────────────────────────────────────────────
 * COMPANY DUPLICATES
 * Visszaadja a céggel potenciálisan duplikált rekordokat (önmagát nem).
 * ────────────────────────────────────────────── */
export type CompanyDupMatch = {
  id: string;
  name: string;
  reason: "name_exact" | "name_similar" | "domain" | "tax_number";
  confidence: number; // 0..1
};

export async function findCompanyDuplicates(companyId: string): Promise<CompanyDupMatch[]> {
  if (!companyId) return [];
  const { data: self } = await supabase
    .from("companies")
    .select("id,name,domain,tax_number")
    .eq("id", companyId)
    .maybeSingle();
  if (!self) return [];

  const normSelf = normalizeCompanyName(self.name);
  const taxSelf  = normalizeTaxNumber(self.tax_number);
  const dom      = self.domain?.toLowerCase() ?? null;

  // Mintavétel: legfeljebb 1000 cég. Marketing CRM-méretben elég.
  const { data: rows } = await supabase
    .from("companies")
    .select("id,name,domain,tax_number")
    .neq("id", companyId)
    .limit(1000);

  const out: CompanyDupMatch[] = [];
  for (const r of rows ?? []) {
    // tax_number egyezés (8 jegyes törzs) — erős jel
    if (taxSelf && normalizeTaxNumber(r.tax_number) === taxSelf) {
      out.push({ id: r.id, name: r.name, reason: "tax_number", confidence: 1 });
      continue;
    }
    // domain egyezés
    if (dom && r.domain && r.domain.toLowerCase() === dom && !isPublicDomain(dom)) {
      out.push({ id: r.id, name: r.name, reason: "domain", confidence: 0.95 });
      continue;
    }
    // név alapú
    const n = normalizeCompanyName(r.name);
    if (n && normSelf) {
      if (n === normSelf) {
        out.push({ id: r.id, name: r.name, reason: "name_exact", confidence: 0.9 });
      } else {
        const sim = similarity(n, normSelf);
        if (sim >= 0.82) out.push({ id: r.id, name: r.name, reason: "name_similar", confidence: sim });
      }
    }
  }
  // dedup és csökkenő konfidencia
  const map = new Map<string, CompanyDupMatch>();
  for (const m of out) {
    const prev = map.get(m.id);
    if (!prev || m.confidence > prev.confidence) map.set(m.id, m);
  }
  return [...map.values()].sort((a, b) => b.confidence - a.confidence);
}

/* ──────────────────────────────────────────────
 * CONTACT CONFLICTS — egy cégen belül azonos email/telefon/név.
 * ────────────────────────────────────────────── */
export type ContactConflict = {
  key: "email" | "phone" | "name";
  value: string;
  ids: string[];
  names: string[];
};

export async function findContactConflicts(companyId: string): Promise<ContactConflict[]> {
  if (!companyId) return [];
  const { data: rows } = await supabase
    .from("contacts")
    .select("id,name,email,phone")
    .eq("company_id", companyId);
  if (!rows || rows.length < 2) return [];

  const group = <K extends "email" | "phone" | "name">(key: K, norm: (v: string) => string) => {
    const buckets = new Map<string, { ids: string[]; names: string[]; raw: string }>();
    for (const r of rows) {
      const raw = (r as any)[key] as string | null;
      if (!raw) continue;
      const k = norm(String(raw));
      if (!k) continue;
      const b = buckets.get(k) ?? { ids: [], names: [], raw };
      b.ids.push(r.id); b.names.push(r.name ?? "");
      buckets.set(k, b);
    }
    return [...buckets.entries()]
      .filter(([, v]) => v.ids.length > 1)
      .map<ContactConflict>(([, v]) => ({ key, value: v.raw, ids: v.ids, names: v.names }));
  };

  return [
    ...group("email", (v) => v.trim().toLowerCase()),
    ...group("phone", (v) => normalizePhone(v)),
    ...group("name",  (v) => v.trim().toLowerCase().replace(/\s+/g, " ")),
  ];
}

/* ──────────────────────────────────────────────
 * LEAD DUPLICATE — nyitott lead ugyanazon cégen / emailen.
 * Visszaadja a már létező nyitott lead-et, ha van.
 * ────────────────────────────────────────────── */
const CLOSED_STATUSES = ["won", "lost", "archived", "closed", "converted"];

export async function findOpenLeadDuplicate(input: {
  companyId?: string | null;
  email?: string | null;
}): Promise<{ id: string; reason: "company" | "email" } | null> {
  if (input.companyId) {
    const { data } = await supabase
      .from("leads")
      .select("id,status")
      .eq("company_id", input.companyId)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data?.id) return { id: data.id, reason: "company" };
  }
  if (input.email) {
    const d = extractDomain(input.email);
    if (d && !isPublicDomain(d)) {
      const { data } = await supabase
        .from("leads")
        .select("id,status")
        .ilike("email", input.email)
        .not("status", "in", `(${CLOSED_STATUSES.join(",")})`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.id) return { id: data.id, reason: "email" };
    }
  }
  return null;
}