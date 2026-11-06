import { describe, expect, it } from 'vitest';
import { companyBlockInput, companyBlockAllows, verifyCompanyBlockReceipt } from './company-block';

const input = { companyId: '11111111-1111-4111-8111-111111111111', blocked: true, reason: 'TESZT üzleti tiltás', expectedRevision: null };
describe('company marketing block rules', () => {
  it('requires a reason', () => expect(companyBlockInput.safeParse({ ...input, reason: ' ' }).success).toBe(false));
  it('permits Marketing to block but only Owner to release', () => {
    expect(companyBlockAllows('marketing', true)).toBe(true);
    expect(companyBlockAllows('marketing', false)).toBe(false);
    expect(companyBlockAllows('owner', false)).toBe(true);
    expect(companyBlockAllows('sales', true)).toBe(false);
    expect(companyBlockAllows('project_manager', true)).toBe(false);
  });
  it('never proves success with a missing user-visible saved row', () => {
    expect(() => verifyCompanyBlockReceipt(null, null, input, 'owner')).toThrow('nem igazolt');
  });
  it('requires exact saved block metadata and authenticated actor', () => {
    const receipt = { company_id: input.companyId, blocked: true, reason: input.reason, changed_by: 'owner', changed_at: '2026-11-06T17:00:00Z', revision: 'new-revision' };
    const row = { id: input.companyId, marketing_blocked: true, marketing_block_reason: input.reason, marketing_block_changed_by: 'owner', marketing_block_changed_at: receipt.changed_at, marketing_block_revision: receipt.revision };
    expect(verifyCompanyBlockReceipt(receipt, row, input, 'owner')).toEqual(receipt);
    expect(() => verifyCompanyBlockReceipt(receipt, { ...row, marketing_blocked: false }, input, 'owner')).toThrow();
    expect(() => verifyCompanyBlockReceipt(receipt, row, input, 'other-user')).toThrow();
  });
});