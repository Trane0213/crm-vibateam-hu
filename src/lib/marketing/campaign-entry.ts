import { z } from 'zod';

const uuid = z.string().uuid();
/** URL selections are preparation intent only, never persisted membership or send permission. */
export function campaignEntrySearch(input: Record<string, unknown>) {
  const company = uuid.safeParse(input.companyId);
  const contact = uuid.safeParse(input.contactId);
  return {
    companyId: company.success ? company.data : undefined,
    contactId: company.success && contact.success ? contact.data : undefined,
  };
}

export function campaignEntryContacts(contactId: string | undefined, companyId: string | undefined, candidates: { id: string; company_id: string }[]) {
  return contactId && companyId && candidates.some(c => c.id === contactId && c.company_id === companyId) ? [contactId] : [];
}