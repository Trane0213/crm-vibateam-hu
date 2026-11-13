import { z } from 'zod';

const uuid = z.string().uuid();
/** URL selections are preparation intent only, never persisted membership or send permission. */
export function campaignEntrySearch(input: Record<string, unknown>): { companyId?: string; contactId?: string; campaignId?: string } {
  const company = uuid.safeParse(input.companyId);
  const contact = uuid.safeParse(input.contactId);
  const campaign = uuid.safeParse(input.campaignId);
  return {
    companyId: company.success ? company.data : undefined,
    contactId: company.success && contact.success ? contact.data : undefined,
    // Csak megnyitandó tervezet; a szerver olvasása (RLS) dönti el, látható-e.
    campaignId: campaign.success ? campaign.data : undefined,
  };
}

export function campaignEntryContacts(contactId: string | undefined, companyId: string | undefined, candidates: { id: string; company_id: string }[]) {
  return contactId && companyId && candidates.some(c => c.id === contactId && c.company_id === companyId) ? [contactId] : [];
}