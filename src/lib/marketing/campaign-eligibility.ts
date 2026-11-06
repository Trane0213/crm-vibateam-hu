/**
 * Kampány előtti deduplikáció/alkalmasság (DRY-RUN). Tiszta függvény: nem ír, nem küld.
 * Szabály: ami nem bizonyíthatóan érintetlen, az nem "kész" — bizonytalan előzmény BLOKKOL.
 */
import { normEmail, isInternal, isBusinessMailbox } from "@/lib/gmail/relink-analysis";

export type EligibilityStatus = "ready" | "contacted" | "replied" | "uncertain" | "invalid";
export type CampaignCandidate = { contact_id: string; company_id: string | null; company_name: string | null; name: string | null; email: string | null; email_invalid: boolean | null; marketing_blocked?: boolean; company_marketing_blocked?: boolean };
/** Szerveren minősített előzmény, tartalom nélkül. */
export type HistoryHit = { email: string; direction: "out" | "in" | "unverified"; at: string | null; mailbox: string; verifiedSent?: boolean; verifiedReply?: boolean };
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
  for (const h of hits) { if (!isBusinessMailbox(h.mailbox)) continue; const e = normEmail(h.email); byEmail.set(e, [...(byEmail.get(e) ?? []), h]); }
  const companiesByEmail = new Map<string, Set<string | null>>();
  for (const c of candidates) { const e = normEmail(c.email); companiesByEmail.set(e, (companiesByEmail.get(e) ?? new Set()).add(c.company_id)); }
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
    if (c.company_marketing_blocked) { reasons.push('Cégszintű marketingtiltás'); return row('invalid'); }
    if (!norm || !VALID.test(norm)) { reasons.push("Hiányzó vagy formailag hibás email."); return row("invalid"); }
    if (c.marketing_blocked) { reasons.push("Igazolt marketingküldési tiltás."); return row("invalid"); }
    if (c.email_invalid) { reasons.push("CRM-ben hibásnak jelölt cím."); return row("invalid"); }
    if (isInternal(norm)) { reasons.push("Belső vagy tesztcím."); return row("invalid"); }
    if (!c.contact_id || !c.company_id) { reasons.push("Hiányzó kontaktazonosító vagy cégkapcsolat."); return row("uncertain"); }
    if ((companiesByEmail.get(norm)?.size ?? 0) > 1) { reasons.push("A cím több CRM-céghez tartozik."); return row("uncertain"); }
    if (seen.has(norm)) { reasons.push("Kampányon belüli duplikált cím."); return row("invalid"); }
    seen.add(norm);
    if (!opts.historyComplete) reasons.push("Az előzményvizsgálat nem teljes.");
    if (own.some(h => h.direction === "in" && h.verifiedReply)) { reasons.push("Igazolt küldés után azonos fiókban és szálban érkezett válasz."); return row("replied"); }
    if (own.some(h => h.direction === "out" && h.verifiedSent)) { reasons.push("Tárolt Gmail SENT-bizonyíték, DRAFT nélkül; nem igazolja a levél üzleti célját."); return row("contacted"); }
    if (own.length) reasons.push("Piszkozat vagy nem igazolt levélkapcsolat — nem küldési bizonyíték.");
    if (!c.company_id) reasons.push("A kontakt nincs céghez kötve.");
    if (COLLECTIVE_LOCAL.test(norm.split("@")[0] ?? "")) reasons.push("Gyűjtőcím — személyes kontakt nélkül nem bizonyítható.");
    if (c.company_id && touchedCompanies.has(c.company_id)) reasons.push("A cég másik kontaktja már kapott/küldött levelet.");
    const ch = c.company_id ? coHist.get(c.company_id) : undefined;
    if (ch && ch.threads > 0) reasons.push(`A céghez ${ch.threads} tárolt levélszál kötődik.`);
    return row(reasons.length ? "uncertain" : "ready");
  });
}
