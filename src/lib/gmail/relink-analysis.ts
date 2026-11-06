/**
 * DRY-RUN történeti levél→cég összerendelés-elemzés. Tiszta függvények, semmit nem ír.
 * Csak pontos, normalizált kontakt-email bizonyíthat céget; domain/név/tárgy csak javaslat.
 */
export type RelinkCategory =
  | "linked"        // már mentett cég, ellentmondás nélkül (öröklés)
  | "certain"       // pontos kontakt-email → egyetlen cég, a szál még nincs kapcsolva
  | "review"        // csak domain-egyezés, körlevél, gyűjtőcím, hiányos kontakt → kézi ellenőrzés
  | "conflict"      // több cég vagy mentett cégtől eltérő egyezés
  | "no_contact"    // külső résztvevő van, de nincs CRM-kontakt
  | "internal";     // csak belső / tesztcím, nem ügyfélkommunikáció

export type RelinkContact = { id: string; email: string | null; company_id: string | null };
export type RelinkMessage = {
  from_email: string | null; to_emails: string[] | null; cc_emails: string[] | null;
  is_outbound: boolean | null; internal_date: string | null; subject: string | null; gmail_label_ids: string[] | null;
};
export type RelinkThread = { id: string; company_id: string | null; contact_id: string | null; subject: string | null; last_message_at: string | null };
export type RelinkResult = {
  thread_id: string; category: RelinkCategory; subject: string; saved_company_id: string | null;
  suggested_company_id: string | null; matched_contact_ids: string[]; evidence: string[];
  external: string[]; outbound: number; inbound: number; replied: boolean; last_at: string | null;
};

export const INTERNAL_DOMAINS = ["vibateam.hu"];
export const TEST_ADDRESSES = ["viktor.csotai@gmail.com", "info@nexohabit.com"];
const FREE = new Set(["gmail.com", "freemail.hu", "citromail.hu", "hotmail.com", "outlook.com", "yahoo.com", "t-online.hu", "icloud.com", "live.com"]);
const COLLECTIVE = /^(no-?reply|noreply|newsletter|hirlevel|marketing|notifications?|mailer-daemon|postmaster|bounce|support|info|office|iroda|ugyfelszolgalat|hello|kapcsolat|sales|ertekesites|admin|billing|szamla)([.+-]|@)/;
const BULK_RECIPIENTS = 8;

export const normEmail = (a: string | null | undefined) => {
  if (!a) return "";
  const m = a.match(/<([^>]+)>/);
  return (m ? m[1] : a).trim().toLowerCase();
};
const domainOf = (e: string) => e.split("@")[1] ?? "";
export const isInternal = (e: string) => INTERNAL_DOMAINS.includes(domainOf(e)) || TEST_ADDRESSES.includes(e);

export function buildContactIndex(contacts: RelinkContact[]) {
  const byEmail = new Map<string, RelinkContact[]>();
  const byDomain = new Map<string, Set<string>>();
  for (const c of contacts) {
    const e = normEmail(c.email);
    if (!e.includes("@")) continue;
    byEmail.set(e, [...(byEmail.get(e) ?? []), c]);
    const d = domainOf(e);
    if (c.company_id && d && !FREE.has(d) && !INTERNAL_DOMAINS.includes(d)) byDomain.set(d, (byDomain.get(d) ?? new Set()).add(c.company_id));
  }
  return { byEmail, byDomain };
}
export type ContactIndex = ReturnType<typeof buildContactIndex>;

export function analyzeThread(thread: RelinkThread, messages: RelinkMessage[], mailbox: string, idx: ContactIndex): RelinkResult {
  const me = normEmail(mailbox);
  const external = new Set<string>();
  let outbound = 0, inbound = 0, firstOut: number | null = null, replied = false, bulk = false, promo = false;
  const sorted = [...messages].sort((a, b) => (a.internal_date ?? "").localeCompare(b.internal_date ?? ""));
  for (const m of sorted) {
    const from = normEmail(m.from_email);
    const rcpt = [...(m.to_emails ?? []), ...(m.cc_emails ?? [])].map(normEmail).filter(Boolean);
    if (rcpt.length >= BULK_RECIPIENTS) bulk = true;
    if ((m.gmail_label_ids ?? []).some(l => l === "CATEGORY_PROMOTIONS" || l === "CATEGORY_SOCIAL" || l === "CATEGORY_FORUMS")) promo = true;
    const out = !!m.is_outbound || from === me;
    const t = m.internal_date ? Date.parse(m.internal_date) : 0;
    if (out) { outbound++; if (firstOut === null) firstOut = t; }
    else { inbound++; if (firstOut !== null && t >= firstOut && from && !isInternal(from)) replied = true; }
    for (const a of [from, ...rcpt]) if (a && a !== me && !isInternal(a)) external.add(a);
  }
  // Üres üzenet-tárgy esetén a szál tárgya a forrás.
  const subject = (sorted.map(m => m.subject).find(s => s && s.trim()) ?? thread.subject ?? "").trim() || "(nincs tárgy)";
  const evidence: string[] = [];
  const base = { thread_id: thread.id, subject, saved_company_id: thread.company_id, external: [...external], outbound, inbound, replied, last_at: thread.last_message_at };
  if (external.size === 0) return { ...base, category: "internal", suggested_company_id: null, matched_contact_ids: [], evidence: ["Csak belső vagy tesztcím résztvevő."] };

  const matched: RelinkContact[] = [];
  const unlinkedContact: string[] = [];
  for (const e of external) for (const c of idx.byEmail.get(e) ?? []) { matched.push(c); if (!c.company_id) unlinkedContact.push(e); }
  const companies = new Set(matched.map(c => c.company_id).filter((x): x is string => !!x));
  for (const c of matched) evidence.push(`Pontos kontakt-email: ${normEmail(c.email)}`);
  const result = (category: RelinkCategory, suggested: string | null, extra: string[] = []) =>
    ({ ...base, category, suggested_company_id: suggested, matched_contact_ids: [...new Set(matched.map(c => c.id))], evidence: [...evidence, ...extra] });

  if (companies.size > 1) return result("conflict", null, [`${companies.size} különböző cég kontaktja szerepel a szálban.`]);
  const only = [...companies][0] ?? null;
  if (thread.company_id && only && only !== thread.company_id) return result("conflict", only, ["A mentett cég eltér a pontos kontakt-egyezéstől."]);
  if (thread.company_id) return result("linked", thread.company_id, ["Korábban mentett cégkapcsolat, ellentmondás nélkül."]);
  if (only) {
    const flags: string[] = [];
    if (unlinkedContact.length) flags.push("Céghez nem kötött kontakt is egyezik.");
    if (bulk) flags.push(`Körlevélgyanú (≥${BULK_RECIPIENTS} címzett).`);
    if (promo) flags.push("Gmail promóció/közösségi címke.");
    const collective = matched.filter(c => COLLECTIVE.test(normEmail(c.email)));
    if (collective.length) flags.push("Gyűjtőcímre szóló egyezés.");
    return flags.length ? result("review", only, flags) : result("certain", only);
  }
  if (unlinkedContact.length) return result("review", null, ["Kontakt létezik, de nincs céghez kötve."]);
  const domainCompanies = new Set<string>();
  for (const e of external) for (const id of idx.byDomain.get(domainOf(e)) ?? []) domainCompanies.add(id);
  if (domainCompanies.size === 1) return result("review", [...domainCompanies][0]!, ["Csak domain-egyezés — nem bizonyíték."]);
  if (domainCompanies.size > 1) return result("review", null, ["Domain több céghez is illik — nem bizonyíték."]);
  return result("no_contact", null, [promo || bulk ? "Nincs CRM-kontakt; körlevél/promóció gyanú." : "Nincs CRM-kontakt a külső címekhez."]);
}

/** Szinkron-ellenőrzőpont: csak akkor léphet előre, ha minden új üzenet feldolgozása lezárult. */
export function nextHistoryCheckpoint(input: { start: string; latest: string; pending: number; transientErrors: number }): string {
  return input.pending > 0 || input.transientErrors > 0 ? input.start : input.latest;
}
/** Végleges (nem ismételhető) hiba: a Gmailből törölt/nem található üzenet. */
export const isPermanentMessageError = (msg: string) => /\b(404|not found|notFound)\b/i.test(msg);
