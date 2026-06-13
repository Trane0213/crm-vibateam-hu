import { supabase } from "@/integrations/supabase/client";
import { computeCompanyScore } from "@/lib/dedupe/scoring";
import { scanCompanyDuplicatePairs, scanContactConflicts } from "@/lib/dedupe/global-scans";
import { resolveCompanyIdentity } from "@/lib/dedupe/company-identity";

const ACTIVE_LEAD_STATUSES = new Set(["new", "contacted", "qualified"]);

export type CompanySurfaceRow = {
  companyId: string;
  contactCount: number;
  activeLeadCount: number;
  emailActivityCount: number;
  conflictCount: number;
  duplicateCount: number;
  identityStrength: number;
  qualityPct: number;
  qualityBand: "green" | "yellow" | "red";
};

export async function loadCompanySurfaceMap(): Promise<Map<string, CompanySurfaceRow>> {
  const [
    { data: companies },
    { data: contacts },
    { data: leads },
    { data: threads },
    dupPairs,
    contactConflicts,
  ] = await Promise.all([
    supabase.from("companies").select("id,name,company_type,website,domain,tax_number,city").limit(2000),
    supabase.from("contacts").select("id,company_id,email,phone").limit(5000),
    supabase.from("leads").select("id,company_id,status").limit(5000),
    supabase.from("email_threads").select("id,company_id,last_message_at").limit(5000),
    scanCompanyDuplicatePairs(),
    scanContactConflicts(),
  ]);

  const contactsByCompany = new Map<string, { id: string; email?: string | null; phone?: string | null }[]>();
  for (const contact of contacts ?? []) {
    if (!contact.company_id) continue;
    const list = contactsByCompany.get(contact.company_id) ?? [];
    list.push(contact);
    contactsByCompany.set(contact.company_id, list);
  }

  const leadCountByCompany = new Map<string, number>();
  for (const lead of leads ?? []) {
    if (!lead.company_id || !ACTIVE_LEAD_STATUSES.has(lead.status ?? "")) continue;
    leadCountByCompany.set(lead.company_id, (leadCountByCompany.get(lead.company_id) ?? 0) + 1);
  }

  const threadCountByCompany = new Map<string, number>();
  for (const thread of threads ?? []) {
    if (!thread.company_id) continue;
    threadCountByCompany.set(thread.company_id, (threadCountByCompany.get(thread.company_id) ?? 0) + 1);
  }

  const dupCountByCompany = new Map<string, number>();
  for (const pair of dupPairs) {
    dupCountByCompany.set(pair.a.id, (dupCountByCompany.get(pair.a.id) ?? 0) + 1);
    dupCountByCompany.set(pair.b.id, (dupCountByCompany.get(pair.b.id) ?? 0) + 1);
  }

  const conflictsByCompany = new Map<string, number>();
  for (const conflict of contactConflicts) {
    const companyIds = new Set(conflict.contacts.map((item) => item.company_id).filter(Boolean));
    for (const companyId of companyIds) {
      conflictsByCompany.set(companyId as string, (conflictsByCompany.get(companyId as string) ?? 0) + 1);
    }
  }

  const identities = await Promise.all((companies ?? []).map((company) => resolveCompanyIdentity(company.id)));
  const identityMap = new Map<string, number>();
  for (const identity of identities) {
    if (!identity) continue;
    identityMap.set(identity.id, identity.identityStrength);
  }

  const map = new Map<string, CompanySurfaceRow>();
  for (const company of companies ?? []) {
    const companyContacts = contactsByCompany.get(company.id) ?? [];
    const score = computeCompanyScore(company as any, companyContacts);
    map.set(company.id, {
      companyId: company.id,
      contactCount: companyContacts.length,
      activeLeadCount: leadCountByCompany.get(company.id) ?? 0,
      emailActivityCount: threadCountByCompany.get(company.id) ?? 0,
      conflictCount: conflictsByCompany.get(company.id) ?? 0,
      duplicateCount: dupCountByCompany.get(company.id) ?? 0,
      identityStrength: identityMap.get(company.id) ?? 0,
      qualityPct: score.pct,
      qualityBand: score.band,
    });
  }

  return map;
}

export type ContactSurfaceRow = {
  contactId: string;
  qualityPct: number;
  companyId: string | null;
  activeLeadCount: number;
  emailActivityCount: number;
  conflictBadges: Array<"email" | "phone">;
};

export async function loadContactSurfaceMap(): Promise<Map<string, ContactSurfaceRow>> {
  const [{ data: contacts }, { data: leads }, { data: threads }, conflicts] = await Promise.all([
    supabase.from("contacts").select("id,email,phone,company_id").limit(5000),
    supabase.from("leads").select("id,contact_id,status").limit(5000),
    supabase.from("email_threads").select("id,contact_id").limit(5000),
    scanContactConflicts(),
  ]);

  const leadsByContact = new Map<string, number>();
  for (const lead of leads ?? []) {
    if (!lead.contact_id || !ACTIVE_LEAD_STATUSES.has(lead.status ?? "")) continue;
    leadsByContact.set(lead.contact_id, (leadsByContact.get(lead.contact_id) ?? 0) + 1);
  }

  const threadsByContact = new Map<string, number>();
  for (const thread of threads ?? []) {
    if (!thread.contact_id) continue;
    threadsByContact.set(thread.contact_id, (threadsByContact.get(thread.contact_id) ?? 0) + 1);
  }

  const conflictsByContact = new Map<string, Array<"email" | "phone">>();
  for (const conflict of conflicts) {
    if (conflict.key !== "email" && conflict.key !== "phone") continue;
    for (const item of conflict.contacts) {
      const list = conflictsByContact.get(item.id) ?? [];
      if (!list.includes(conflict.key)) list.push(conflict.key);
      conflictsByContact.set(item.id, list);
    }
  }

  const map = new Map<string, ContactSurfaceRow>();
  for (const contact of contacts ?? []) {
    const filled = [contact.email, contact.phone, contact.company_id].filter(Boolean).length;
    map.set(contact.id, {
      contactId: contact.id,
      qualityPct: Math.round((filled / 3) * 100),
      companyId: contact.company_id ?? null,
      activeLeadCount: leadsByContact.get(contact.id) ?? 0,
      emailActivityCount: threadsByContact.get(contact.id) ?? 0,
      conflictBadges: conflictsByContact.get(contact.id) ?? [],
    });
  }
  return map;
}