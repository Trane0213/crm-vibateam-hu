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

  // 4) Threads — domain alapján céghez kötés
  const { data: threads, error: tErr } = await supabase
    .from("email_threads")
    .select("id,participants,company_id")
    .is("company_id", null)
    .limit(2000);
  if (tErr) throw tErr;
  const threadList = threads ?? [];
  report.thread.total = threadList.length;
  tick();

  // Domain → company map (egyszer betöltjük)
  const { data: companies } = await supabase
    .from("companies")
    .select("id,website")
    .not("website", "is", null)
    .limit(5000);
  const domainMap = new Map<string, string>();
  for (const c of companies ?? []) {
    const d = extractDomain(c.website);
    if (d && !isPublicDomain(d)) domainMap.set(d, c.id);
  }

  // Kapcsolattartó email → company_id map (ha a thread résztvevője egy
  // ismert kapcsolattartó, akkor a céghez kötjük — akkor is, ha a cégnek
  // nincs website-ja, vagy a domain publikus freemail). Egyértelmű egyezés kell.
  const { data: contactsForMap } = await supabase
    .from("contacts")
    .select("email,company_id")
    .not("email", "is", null)
    .not("company_id", "is", null)
    .limit(10000);
  const emailToCompany = new Map<string, string | null>();
  for (const c of (contactsForMap ?? []) as Array<{ email: string; company_id: string }>) {
    const key = c.email.trim().toLowerCase();
    if (!key) continue;
    if (emailToCompany.has(key)) {
      // több cég használja → nem egyértelmű
      if (emailToCompany.get(key) !== c.company_id) emailToCompany.set(key, null);
    } else {
      emailToCompany.set(key, c.company_id);
    }
  }

  for (const t of threadList) {
    try {
      let matchedCompany: string | null = null;
      // 1) email résztvevő → ismert kapcsolattartó cége
      for (const p of t.participants ?? []) {
        const key = String(p ?? "").trim().toLowerCase();
        if (!key) continue;
        const cid = emailToCompany.get(key);
        if (cid) { matchedCompany = cid; break; }
      }
      // 2) domain → companies.website
      if (!matchedCompany) {
      for (const p of t.participants ?? []) {
        const d = extractDomain(p);
        if (d && !isPublicDomain(d) && domainMap.has(d)) {
          matchedCompany = domainMap.get(d)!;
          break;
        }
      }
      }
      if (matchedCompany) {
        const { error } = await supabase
          .from("email_threads")
          .update({ company_id: matchedCompany })
          .eq("id", t.id);
        if (error) report.thread.errors++;
        else report.thread.changed++;
      }
    } catch { report.thread.errors++; }
    report.thread.processed++;
    if (report.thread.processed % 10 === 0) tick();
  }
  tick();

  return report;
}

export { emptyReport as createEmptyBackfillReport };