export type CrmLink = { company_id: string | null; contact_id: string | null; lead_id: string | null };
type Contact = { id: string; email: string | null; company_id: string | null };
type Lead = { id: string; contact_id: string | null; company_id: string | null };
const empty = (): CrmLink => ({ company_id: null, contact_id: null, lead_id: null });
/** Exact contact addresses only: domains, participant order and duplicate rows never decide a company. */
export function matchCrmAddresses(addresses: string[], contacts: Contact[], leads: Lead[]): { link: CrmLink; review: boolean } {
  const emails = new Set(addresses.map(a => a.trim().toLowerCase()));
  const matched = contacts.filter(c => c.email && emails.has(c.email.trim().toLowerCase()));
  const companies = new Set(matched.map(c => c.company_id).filter((id): id is string => !!id));
  if (companies.size > 1 || matched.some(c => !c.company_id)) return { link: empty(), review: true };
  const company_id = [...companies][0] ?? null;
  const contact_id = matched.length === 1 ? matched[0]?.id ?? null : null;
  const candidates = contact_id ? leads.filter(l => l.contact_id === contact_id && l.company_id === company_id) : [];
  return { link: { company_id, contact_id, lead_id: candidates.length === 1 ? candidates[0]?.id ?? null : null }, review: matched.length > 1 || candidates.length > 1 };
}
/** Never mix a newly matched company with an existing thread's contact or lead. Historical rows are not rewritten. */
export function resolveThreadLink(saved: CrmLink, candidate: CrmLink): { link: CrmLink; conflict: boolean; patch: Partial<CrmLink> } {
  const conflict = (Object.keys(saved) as (keyof CrmLink)[]).some(k => saved[k] && candidate[k] && saved[k] !== candidate[k]);
  if (conflict) return { link: saved, conflict: true, patch: {} };
  // A partial historical assignment cannot safely be completed using another participant.
  if (!saved.company_id && (saved.contact_id || saved.lead_id)) return {link:saved,conflict:false,patch:{}};
  const link = { company_id: saved.company_id ?? candidate.company_id, contact_id: saved.contact_id ?? candidate.contact_id, lead_id: saved.lead_id ?? candidate.lead_id };
  const patch: Partial<CrmLink> = {};
  for (const key of Object.keys(saved) as (keyof CrmLink)[]) if (!saved[key] && link[key]) patch[key] = link[key];
  return { link, conflict: false, patch };
}