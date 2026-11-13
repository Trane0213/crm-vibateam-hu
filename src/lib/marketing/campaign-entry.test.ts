import { describe, expect, it } from 'vitest';
import { campaignEntrySearch, campaignEntryContacts } from './campaign-entry';

const companyId = '11111111-1111-4111-8111-111111111111';
const contactId = '22222222-2222-4222-8222-222222222222';
describe('record campaign preparation entry', () => {
  it('accepts a company without a contact but does not select a recipient', () => {
    expect(campaignEntrySearch({ companyId })).toEqual({ companyId, contactId: undefined });
    expect(campaignEntryContacts(undefined, companyId, [])).toEqual([]);
  });
  it('rejects invalid record identifiers and unscoped contacts', () => {
    expect(campaignEntrySearch({ companyId: 'TESZT', contactId })).toEqual({ companyId: undefined, contactId: undefined });
  });
  it('accepts only a UUID campaign deep link, without selecting recipients', () => {
    const campaignId = '44444444-4444-4444-8444-444444444444';
    expect(campaignEntrySearch({ campaignId })).toEqual({ campaignId });
    expect(campaignEntrySearch({ campaignId: 'TESZT' }).campaignId).toBeUndefined();
  });
  it('selects only the explicit visible contact of the selected company', () => {
    expect(campaignEntryContacts(contactId, companyId, [{ id: contactId, company_id: companyId }])).toEqual([contactId]);
    expect(campaignEntryContacts(contactId, companyId, [{ id: contactId, company_id: '33333333-3333-4333-8333-333333333333' }])).toEqual([]);
  });
});