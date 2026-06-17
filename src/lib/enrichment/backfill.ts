import { supabase } from "@/integrations/supabase/client";
import {
  enrichCompanyFromExistingData,
  enrichContactFromExistingData,
  enrichLeadLinks,
  extractDomain,
  isPublicDomain,
} from "./enrich";

export type BackfillKind = "company" | "contact" | "lead" | "thread";

export type BackfillProgress = {
  kind: BackfillKind;
  total: number;
  processed: number;
  changed: number;
  errors: number;
};

export type BackfillReport = Record<BackfillKind, BackfillProgress>;

function emptyReport(): BackfillReport {
  const mk = (kind: BackfillKind): BackfillProgress => ({ kind, total: 0, processed: 0, changed: 0, errors: 0 });
  return { company: mk("company"), contact: mk("contact"), lead: mk("lead"), thread: mk("thread") };
}

async function fetchAllIds(table: string, extra?: (q: any) => any): Promise<string[]> {
  let q = supabase.from(table).select("id").limit(5000);
  if (extra) q = extra(q);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map((r: any) => r.id);
}

/**
 * Egyszeri historikus backfill: a meglévő D3/D4 motorokat futtatja
 * minden cégen, kapcsolattartón, leaden és email threaden.
 * Nem módosít sémát, nem hoz létre új adatot — csak összeköt és kitölt.
 */
export async function runHistoricalBackfill(
  onProgress?: (report: BackfillReport) => void,
): Promise<BackfillReport> {
  const report = emptyReport();
  const tick = () => onProgress?.({ ...report, company: { ...report.company }, contact: { ...report.contact }, lead: { ...report.lead }, thread: { ...report.thread } });

  // 1) Companies
  const companyIds = await fetchAllIds("companies");
  report.company.total = companyIds.length;
  tick();
  for (const id of companyIds) {
    try {
      const res = await enrichCompanyFromExistingData(id);
      if (!res.ok) report.company.errors++;
      else if (res.changed.length) report.company.changed++;
    } catch { report.company.errors++; }
    report.company.processed++;
    if (report.company.processed % 5 === 0) tick();
  }
  tick();

  // 2) Contacts
  const contactIds = await fetchAllIds("contacts");
  report.contact.total = contactIds.length;
  tick();
  for (const id of contactIds) {
    try {
      const res = await enrichContactFromExistingData(id);
      if (!res.ok) report.contact.errors++;
      else if (res.changed.length) report.contact.changed++;
    } catch { report.contact.errors++; }
    report.contact.processed++;
    if (report.contact.processed % 5 === 0) tick();
  }
  tick();

  // 3) Leads
  const leadIds = await fetchAllIds("leads");
  report.lead.total = leadIds.length;
  tick();
  for (const id of leadIds) {
    try {
      const res = await enrichLeadLinks(id);
      if (!res.ok) report.lead.errors++;
      else if (res.changed.length) report.lead.changed++;
    } catch { report.lead.errors++; }
    report.lead.processed++;
    if (report.lead.processed % 5 === 0) tick();
  }
  tick();

  // 4) Threads — historikus backfill: company_id, contact_id, lead_id
  // Az ÖSSZES threadet feldolgozzuk lapozva (nem csak az első 2000-et).
  // A már beállított kapcsolatokat NEM írjuk felül, csak a hiányzókat töltjük.

  // Domain → company map
  const { data: companies } = await supabase
    .from("companies")
    .select("id,website")
    .not("website", "is", null)
    .limit(10000);
  const domainMap = new Map<string, string>();
  for (const c of companies ?? []) {
    const d = extractDomain(c.website);
    if (d && !isPublicDomain(d)) domainMap.set(d, c.id);
  }

  // Contact email → { contact_id, company_id }
  const { data: contactsForMap } = await supabase
    .from("contacts")
    .select("id,email,company_id")
    .not("email", "is", null)
    .limit(20000);
  type ContactRef = { contact_id: string | null; company_id: string | null };
  const emailToContact = new Map<string, ContactRef>();
  for (const c of (contactsForMap ?? []) as Array<{ id: string; email: string; company_id: string | null }>) {
    const key = c.email.trim().toLowerCase();
    if (!key) continue;
    const existing = emailToContact.get(key);
    if (!existing) {
      emailToContact.set(key, { contact_id: c.id, company_id: c.company_id });
    } else {
      // több találat → kapcsolat nem egyértelmű
      if (existing.contact_id !== c.id) existing.contact_id = null;
      if (existing.company_id !== c.company_id) existing.company_id = null;
    }
  }

  // Lead email → lead_id (+ company_id, contact_id ha van)
  const { data: leadsForMap } = await supabase
    .from("leads")
    .select("id,email,company_id,contact_id")
    .not("email", "is", null)
    .limit(20000);
  type LeadRef = { lead_id: string | null; company_id: string | null; contact_id: string | null };
  const emailToLead = new Map<string, LeadRef>();
  for (const l of (leadsForMap ?? []) as Array<{ id: string; email: string; company_id: string | null; contact_id: string | null }>) {
    const key = l.email.trim().toLowerCase();
    if (!key) continue;
    const existing = emailToLead.get(key);
    if (!existing) {
      emailToLead.set(key, { lead_id: l.id, company_id: l.company_id, contact_id: l.contact_id });
    } else {
      if (existing.lead_id !== l.id) existing.lead_id = null;
      if (existing.company_id !== l.company_id) existing.company_id = null;
      if (existing.contact_id !== l.contact_id) existing.contact_id = null;
    }
  }

  // Lapozva töltjük be az összes threadet
  const PAGE = 1000;
  let offset = 0;
  const allThreads: Array<{ id: string; participants: string[] | null; company_id: string | null; contact_id: string | null; lead_id: string | null }> = [];
  // Először megszámoljuk a sorokat
  {
    const { count } = await supabase
      .from("email_threads")
      .select("id", { count: "exact", head: true });
    report.thread.total = count ?? 0;
    tick();
  }
  while (true) {
    const { data: page, error: tErr } = await supabase
      .from("email_threads")
      .select("id,participants,company_id,contact_id,lead_id")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (tErr) throw tErr;
    const batch = page ?? [];
    if (batch.length === 0) break;
    allThreads.push(...(batch as any));
    offset += batch.length;
    if (batch.length < PAGE) break;
  }

  for (const t of allThreads) {
    try {
      const patch: Record<string, string> = {};
      let matchedCompany: string | null = t.company_id;
      let matchedContact: string | null = t.contact_id;
      let matchedLead: string | null = t.lead_id;

      const parts = (t.participants ?? []).map((p) => String(p ?? "").trim().toLowerCase()).filter(Boolean);

      // 1) Kapcsolattartó (és származtatott cég)
      if (!matchedContact || !matchedCompany) {
        for (const key of parts) {
          const ref = emailToContact.get(key);
          if (!ref) continue;
          if (!matchedContact && ref.contact_id) matchedContact = ref.contact_id;
          if (!matchedCompany && ref.company_id) matchedCompany = ref.company_id;
          if (matchedContact && matchedCompany) break;
        }
      }

      // 2) Lead (és származtatott cég/kapcsolattartó)
      if (!matchedLead || !matchedCompany || !matchedContact) {
        for (const key of parts) {
          const ref = emailToLead.get(key);
          if (!ref) continue;
          if (!matchedLead && ref.lead_id) matchedLead = ref.lead_id;
          if (!matchedCompany && ref.company_id) matchedCompany = ref.company_id;
          if (!matchedContact && ref.contact_id) matchedContact = ref.contact_id;
          if (matchedLead && matchedCompany && matchedContact) break;
        }
      }

      // 3) Domain → companies.website
      if (!matchedCompany) {
        for (const p of t.participants ?? []) {
          const d = extractDomain(p);
          if (d && !isPublicDomain(d) && domainMap.has(d)) {
            matchedCompany = domainMap.get(d)!;
            break;
          }
        }
      }

      if (matchedCompany && matchedCompany !== t.company_id) patch.company_id = matchedCompany;
      if (matchedContact && matchedContact !== t.contact_id) patch.contact_id = matchedContact;
      if (matchedLead && matchedLead !== t.lead_id) patch.lead_id = matchedLead;

      let changed = false;
      if (Object.keys(patch).length) {
        const { error } = await supabase
          .from("email_threads")
          .update(patch)
          .eq("id", t.id);
        if (error) report.thread.errors++;
        else changed = true;
      }

      // A szálhoz tartozó `emails` sorokat is ugyanazon cég/kapcsolattartó/lead
      // alá rendezzük, hogy a CRM-ben a kommunikáció tulajdonosa a cég legyen,
      // ne a küldő VIBA-felhasználó. Csak a hiányzó mezőket töltjük.
      const emailPatch: Record<string, string> = {};
      if (matchedCompany) emailPatch.company_id = matchedCompany;
      if (matchedContact) emailPatch.contact_id = matchedContact;
      if (matchedLead) emailPatch.lead_id = matchedLead;
      if (Object.keys(emailPatch).length) {
        // Csak akkor írjuk felül, ha a hozzárendelés az adott mezőre még üres.
        for (const [field, value] of Object.entries(emailPatch)) {
          await supabase
            .from("emails")
            .update({ [field]: value })
            .eq("thread_id", t.id)
            .is(field, null);
        }
        changed = true;
      }

      if (changed) report.thread.changed++;
    } catch { report.thread.errors++; }
    report.thread.processed++;
    if (report.thread.processed % 25 === 0) tick();
  }
  tick();

  return report;
}

export { emptyReport as createEmptyBackfillReport };