import { describe, it, expect } from 'vitest';
import { RuntimeOutcome } from './runtime-outcome';
describe('Runtime read versus mutation failure', () => {
  it('uses the observed quote path unchanged instead of an invented website host', () => {
    const o=new RuntimeOutcome();o.observe({data:{from:{source_link:'/quotes/TESZT-v1'},to:{source_link:'/quotes/TESZT-v2'}}});
    expect(o.text('[v1](https://vibateam.hu/quotes/TESZT-v1) [v2](https://vibateam.hu/quotes/TESZT-v2)')).toBe('[v1](/quotes/TESZT-v1) [v2](/quotes/TESZT-v2)');
  });
  it('does not present an unobserved invented quote as a verified link', () => {
    expect(new RuntimeOutcome().text('/quotes/invented')).not.toContain('/quotes/invented');
  });
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