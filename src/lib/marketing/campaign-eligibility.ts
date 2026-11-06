/**
 * Kampány előtti deduplikáció/alkalmasság (DRY-RUN). Tiszta függvény: nem ír, nem küld.
 * Szabály: ami nem bizonyíthatóan érintetlen, az nem "kész" — bizonytalan előzmény BLOKKOL.
 */
import { normEmail, isInternal } from "@/lib/gmail/relink-analysis";

export type EligibilityStatus = "ready" | "contacted" | "replied" | "uncertain" | "invalid";
export type CampaignCandidate = { contact_id: string; company_id: string | null; company_name: string | null; name: string | null; email: string | null; email_invalid: boolean | null };
/** Szerveren minősített előzmény, tartalom nélkül. */
export type HistoryHit = { email: string; direction: "out" | "in"; at: string | null; mailbox: string };
export type CompanyHistory = { company_id: string; threads: number; last_at: string | null };
export type EligibilityRow = CampaignCandidate & { norm: string; status: EligibilityStatus; reasons: string[]; last_at: string | null; mailboxes: string[] };

const VALID = /^[^\s@<>()",;]+@[a-z0-9.-]+\.[a-z]{2,}$/;
export const COLLECTIVE_LOCAL = /^(no-?reply|noreply|newsletter|hirlevel|marketing|notifications?|mailer-daemon|postmaster|bounce|support|info|office|iroda|ugyfelszolgalat|hello|kapcsolat|sales|ertekesites|admin|billing|szamla)$/;

export function classifyCandidates(
  candidates: CampaignCandidate[],
  hits: HistoryHit[],
  companyHistory: CompanyHistory[],
  opts: { historyComplete: boolean },
): EligibilityRow[] {
  const byEmail = new Map<string, HistoryHit[]>();
  for (const h of hits) { const e = normEmail(h.email); byEmail.set(e, [...(byEmail.get(e) ?? []), h]); }
  const coHist = new Map(companyHistory.map(c => [c.company_id, c]));
  // Cégszintű érintettség: a cég bármely kontaktjának kimenő/bejövő előzménye.
  const touchedCompanies = new Set<string>();
  for (const c of candidates) if (c.company_id && byEmail.has(normEmail(c.email))) touchedCompanies.add(c.company_id);
  const seen = new Set<string>();
  return candidates.map(c => {
    const norm = normEmail(c.email);
    const reasons: string[] = [];
    const own = byEmail.get(norm) ?? [];
    const last_at = own.map(h => h.at ?? "").sort().at(-1) || null;
    const mailboxes = [...new Set(own.map(h => h.mailbox))];
    const row = (status: EligibilityStatus) => ({ ...c, norm, status, reasons, last_at, mailboxes });
    if (!norm || !VALID.test(norm)) { reasons.push("Hiányzó vagy formailag hibás email."); return row("invalid"); }
    if (c.email_invalid) { reasons.push("CRM-ben hibásnak jelölt cím."); return row("invalid"); }
    if (isInternal(norm)) { reasons.push("Belső vagy tesztcím."); return row("invalid"); }
    if (seen.has(norm)) { reasons.push("Kampányon belüli duplikált cím."); return row("invalid"); }
    seen.add(norm);
    if (own.some(h => h.direction === "in")) { reasons.push("Bejövő levél érkezett erről a címről."); return row("replied"); }
    if (own.some(h => h.direction === "out")) { reasons.push("Már ment kimenő megkeresés erre a címre."); return row("contacted"); }
    if (!opts.historyComplete) reasons.push("Az előzményvizsgálat nem teljes.");
    if (!c.company_id) reasons.push("A kontakt nincs céghez kötve.");
    if (COLLECTIVE_LOCAL.test(norm.split("@")[0] ?? "")) reasons.push("Gyűjtőcím — személyes kontakt nélkül nem bizonyítható.");
    if (c.company_id && touchedCompanies.has(c.company_id)) reasons.push("A cég másik kontaktja már kapott/küldött levelet.");
    const ch = c.company_id ? coHist.get(c.company_id) : undefined;
    if (ch && ch.threads > 0) reasons.push(`A céghez ${ch.threads} tárolt levélszál kötődik.`);
    return row(reasons.length ? "uncertain" : "ready");
  });
}
