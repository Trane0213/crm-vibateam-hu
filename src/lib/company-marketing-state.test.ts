import { describe, expect, it } from 'vitest';
import { readMarketingMeta, marketingStateOrigin, marketingExpected } from './marketing-status';
import { isMarketingCompany } from './marketing-universe';

describe('company marketing structured state', () => {
  for (const status of ['new', 'contacted', 'qualified', 'handoff', 'rejected']) {
    it(`prefers saved ${status} over contradictory legacy markers`, () => {
      expect(readMarketingMeta('[MKT:STATUS:rejected:2026-11-01]', { marketing_status: status }).status).toBe(status);
    });
  }
  it('preserves legacy precedence without treating null as explicit new', () => {
    expect(readMarketingMeta('[KAMPANY:EMAIL_SENT:2026-11-01]', { marketing_status: null }).status).toBe('contacted');
    expect(readMarketingMeta('[KAMPANY:EMAIL_SENT:2026-11-01]\n[KAMPANY:REJECTED:2026-11-02]').status).toBe('rejected');
    expect(readMarketingMeta('[MKT:STATUS:qualified:2026-11-03]\n[KAMPANY:REJECTED:2026-11-02]').status).toBe('qualified');
  });
  it('distinguishes absent state from explicit new and legacy evidence', () => {
    expect(marketingStateOrigin(null, { marketing_status: null })).toBe('missing');
    expect(marketingStateOrigin(null, { marketing_status: 'new' })).toBe('structured');
    expect(marketingStateOrigin('[KAMPANY:EMAIL_SENT:2026-11-01]')).toBe('legacy');
  });
  it('uses Budapest date and exact structured handoff lead', () => {
    const meta = readMarketingMeta('[MKT:STATUS:handoff:2026-11-01:old]', { marketing_status: 'handoff', marketing_status_changed_at: '2026-11-06T23:30:00Z', marketing_handoff_lead_id: 'saved' });
    expect(meta.statusDate).toBe('2026-11-07');
    expect(meta.handoffLeadId).toBe('saved');
    expect(readMarketingMeta('[MKT:STATUS:handoff:2026-11-01:old]', { marketing_status: 'qualified' }).handoffLeadId).toBeNull();
  });
  it('keeps sales note and lead source independently of structured status', () => {
    const notes = '[MKT:SALES_NOTE]\nTESZT\n[/MKT:SALES_NOTE]\n[MKT:LEAD_SOURCE:phone]';
    expect(readMarketingMeta(notes, { marketing_status: 'qualified' })).toMatchObject({ salesNote: 'TESZT', leadSource: 'phone' });
    expect(marketingExpected({ notes })).toEqual({ notes, marketing_status: null, marketing_status_changed_at: null });
  });
  it('includes structured company state in the shared marketing universe', () => {
    expect(isMarketingCompany({ notes: null, marketing_status: 'qualified' })).toBe(true);
    expect(isMarketingCompany({ notes: null, marketing_status: null })).toBe(false);
  });
});