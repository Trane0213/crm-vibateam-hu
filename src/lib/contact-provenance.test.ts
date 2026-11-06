import { expect, it } from 'vitest';
import { contactProvenanceInput, contactProvenanceLabel } from './contact-provenance';
const base = { contactId:'11111111-1111-4111-8111-111111111111',expected:{},kind:'person',source:'email_inferred',state:'human_verified',reference:'' };
it('inferred name cannot be verified without explicit human evidence', () => {
  expect(contactProvenanceInput.safeParse(base).success).toBe(false);
  expect(contactProvenanceInput.safeParse({...base,reference:'TESZT személyes egyeztetés'}).success).toBe(true);
});
it('unknown identity cannot be marked human verified', () => {
  expect(contactProvenanceInput.safeParse({...base,kind:'unknown',reference:'TESZT egyeztetés'}).success).toBe(false);
});
it('missing fields or source do not imply person or verified', () => {
  expect(contactProvenanceLabel({})).toBe('Nincs rögzítve · Nem ellenőrzött');
  expect(contactProvenanceLabel({contact_kind:'person',data_source:'direct_confirmation'})).toBe('Személy · Nem ellenőrzött');
});
it('all three kinds and four sources remain valid when unverified', () => {
  for(const kind of ['person','shared_mailbox','unknown']) for(const source of ['manual','document_import','email_inferred','direct_confirmation']) {
    expect(contactProvenanceInput.safeParse({...base,kind,source,state:'unverified'}).success).toBe(true);
  }
});