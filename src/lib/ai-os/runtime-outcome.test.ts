import { describe, it, expect } from 'vitest';
import { RuntimeOutcome } from './runtime-outcome';
describe('Runtime read versus mutation failure', () => {
  it('retains a later read answer with an explicit failure caveat', () => {
    const outcome = new RuntimeOutcome();
    outcome.record('crm_list_followups', true, true);
    outcome.record('crm_list_followups', false, true);
    expect(outcome.text('Nincs saját nyitott utánkövetés.')).toContain('Nincs saját nyitott utánkövetés.');
    expect(outcome.text('adat')).toContain('nem igazolt');
    expect(outcome.failed).toBe(true);
  });
  it('never presents a failed write as success after a successful read', () => {
    const outcome = new RuntimeOutcome(); outcome.record('sales_send_email', true, false); outcome.record('crm_list_quotes', false, true);
    expect(outcome.text('Levél elküldve.')).toBe('A művelet sikertelen; nem igazolt végrehajtás.');
  });
  it('keeps access denial blocking', () => {
    const outcome = new RuntimeOutcome(); outcome.record('forbidden', true, false);
    expect(outcome.text('siker', true)).toBe('A művelet sikertelen; nem igazolt végrehajtás.');
  });
  it('keeps pending approval separate from execution', () => {
    expect(new RuntimeOutcome().text('siker', true)).toBe('Jóváhagyást igénylő művelet vár rád.');
  });
});