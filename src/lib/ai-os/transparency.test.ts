import { describe, expect, it } from 'vitest';
import { TransparencyTracker, friendlyAiError, runState, sourceLabel } from './transparency';

describe('AI-futás átláthatóság', () => {
  it('forráskategóriákat egyedileg gyűjt és külön jelzi a hibát és a jogosultsághiányt', () => {
    const t = new TransparencyTracker();
    t.record('crm_read_lead', 'ok'); t.record('crm_list_leads', 'ok');
    t.record('crm_read_quote', 'failed'); t.record('crm_read_email_thread', 'denied');
    const s = t.summary({ consulted: [], observedCount: 4, pendingApprovals: 0 });
    expect(s.checked).toEqual(['Értékesítési ügyek']);
    expect(s.failed).toEqual(['Ajánlatok']);
    expect(s.denied).toEqual(['Levelezés']);
    expect(runState(s)).toBe('partial');
  });
  it('jóváhagyásra váró művelet esetén döntést kér, akkor is ha minden olvasás sikerült', () => {
    const t = new TransparencyTracker(); t.record('crm_read_lead', 'ok');
    expect(runState(t.summary({ consulted: [], observedCount: 1, pendingApprovals: 1 }))).toBe('decision');
  });
  it('forrás nélküli válasz általánosnak számít, sikeres konzultáció nem kerül a forráslistába', () => {
    const t = new TransparencyTracker(); t.record('handoff_to', 'ok');
    const s = t.summary({ consulted: ['timothy', 'timothy'], observedCount: 0, pendingApprovals: 0 });
    expect(s.checked).toEqual([]); expect(s.consulted).toEqual(['timothy']); expect(runState(s)).toBe('done');
    expect(runState(new TransparencyTracker().summary({ consulted: [], observedCount: 0, pendingApprovals: 0 }))).toBe('general');
  });
  it('valós eszköznevekhez a megfelelő forráscímkét adja', () => {
    expect(sourceLabel('crm_list_leads')).toBe('Értékesítési ügyek');
    expect(sourceLabel('list_ads')).toBe('Google Ads-adatok');
    expect(sourceLabel('get_change_history')).toBe('Google Ads-adatok');
    expect(sourceLabel('crm_lead_history')).toBe('Előzmények és teendők');
    expect(sourceLabel('crm_list_company_email_threads')).toBe('Levelezés');
    expect(sourceLabel('crm_historical_unit_prices')).toBe('Ajánlatok');
    expect(sourceLabel('crm_list_company_contacts')).toBe('Ügyfelek és kapcsolattartók');
    expect(sourceLabel('crm_search')).toBe('CRM-adatok');
  });
  it('kredit- és jogosultsági hibát érthetően, módosítás nélküliként ír le', () => {
    expect(friendlyAiError('429 credit_balance_exhausted')).toMatch(/nem érhető el.*semmi nem módosult/i);
    expect(friendlyAiError('Access denied: tool')).toMatch(/nincs jogosultságod/);
  });
});
