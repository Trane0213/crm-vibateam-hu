import { describe, it, expect } from 'vitest';
import { matchCrmAddresses, resolveThreadLink } from './crm-association';
const contact = { id: 'contact', email: 'client@example.com', company_id: 'company' };
describe('Exact CRM mail association', () => {
  it('uses the contact company, not a website domain', () => expect(matchCrmAddresses(['CLIENT@example.com'], [contact], []).link.company_id).toBe('company'));
  it('does not guess a company from an unknown address', () => expect(matchCrmAddresses(['other@example.com'], [contact], []).link.company_id).toBeNull());
  it('withholds conflicting company candidates', () => { const result = matchCrmAddresses(['client@example.com'], [contact, { ...contact, id: 'other', company_id: 'other-company' }], []); expect(result.review).toBe(true); expect(result.link.company_id).toBeNull(); });
  it('does not choose between two opportunities', () => { const result = matchCrmAddresses([contact.email], [contact], [{ id:'one', contact_id:'contact', company_id:'company' }, { id:'two', contact_id:'contact', company_id:'company' }]); expect(result.link.lead_id).toBeNull(); });
  it('inherits a saved thread for an incoming reply', () => expect(resolveThreadLink({ company_id:'company', contact_id:'contact', lead_id:null }, {company_id:null,contact_id:null,lead_id:null}).link.company_id).toBe('company'));
  it('does not overwrite a historical contradiction', () => { const result = resolveThreadLink({company_id:'old',contact_id:null,lead_id:null}, {company_id:'new',contact_id:'contact',lead_id:null}); expect(result.conflict).toBe(true); expect(result.patch).toEqual({}); expect(result.link.contact_id).toBeNull(); });
});