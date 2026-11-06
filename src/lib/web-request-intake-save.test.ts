import { it, expect, vi } from 'vitest';
import { saveIntakeOnce } from './web-request-intake-save';
it('retains saved company on contact failure and never repeats company creation', async () => {
  const progress = { companyId: null as string | null, started: false };
  const company = vi.fn(async () => 'TESZT-company');
  const contact = vi.fn(async () => { throw new Error('TESZT contact failure'); });
  const audit = vi.fn();
  await expect(saveIntakeOnce(progress, company, contact, audit)).rejects.toThrow('TESZT contact failure');
  expect(progress.companyId).toBe('TESZT-company');
  await expect(saveIntakeOnce(progress, company, contact, audit)).rejects.toThrow();
  expect(company).toHaveBeenCalledTimes(1); expect(audit).not.toHaveBeenCalled();
});
it('ambiguous company delivery cannot retry', async () => {
  const progress = { companyId: null, started: false };
  const company = vi.fn(async () => { throw new Error('timeout'); });
  await expect(saveIntakeOnce(progress, company, vi.fn(), vi.fn())).rejects.toThrow('timeout');
  await expect(saveIntakeOnce(progress, company, vi.fn(), vi.fn())).rejects.toThrow();
  expect(company).toHaveBeenCalledTimes(1);
});
it('audit failure retains identity, not full success or replay', async () => {
  const progress = { companyId: null as string | null, started: false };
  const company = vi.fn(async () => 'TESZT-company'); const contact = vi.fn();
  await expect(saveIntakeOnce(progress, company, contact, async () => { throw new Error('audit'); })).rejects.toThrow('audit');
  expect(progress.companyId).toBe('TESZT-company');
  await expect(saveIntakeOnce(progress, company, contact, vi.fn())).rejects.toThrow();
  expect(contact).toHaveBeenCalledTimes(1);
});