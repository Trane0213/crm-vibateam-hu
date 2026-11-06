import { describe, expect, it } from 'vitest';
import { importReviewThreadId } from './import-review-thread';

const id = '207e7fe8-5d36-4af4-b503-edf7b14aa818';
describe('import review saved thread identifiers', () => {
  it('opens an email thread whose saved identifier is in title', () => {
    expect(importReviewThreadId({ kind: 'email_thread', title: id, details: { ok: 'TESZT ellenőrzés' } })).toBe(id);
  });
  it('does not treat a company title UUID as a thread', () => {
    expect(importReviewThreadId({ kind: 'company', title: id, details: null })).toBeNull();
  });
  it('does not infer a thread from a malformed identifier or subject', () => {
    expect(importReviewThreadId({ kind: 'email_thread', title: 'TESZT tárgy', details: { szal_id: '-'.repeat(36) } })).toBeNull();
  });
});