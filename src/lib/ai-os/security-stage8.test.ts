import { describe, expect, it } from 'vitest';
import { hasSensitive, redactSecrets, safeAudit } from './approval';
import { buildConstitutionBlock } from './constitution';

describe('AI OS 2.0/8 — titkok kezelése', () => {
  it('magyar jelszót, ismert kulcsformátumot, JWT-t és privát kulcsot felismer', () => {
    expect(hasSensitive('JELSZO :VIBATEAM0213')).toBe(true);
    expect(hasSensitive('jelszó: Titok123')).toBe(true);
    expect(hasSensitive('kulcs sk-proj-abcdefghijklmnop')).toBe(true);
    expect(hasSensitive('sb_secret_abcdefghijklmnop')).toBe(true);
    expect(hasSensitive('eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJlX3Rlc3Q')).toBe(true);
    expect(hasSensitive('-----BEGIN RSA PRIVATE KEY-----')).toBe(true);
  });
  it('hétköznapi üzleti szöveget nem jelöl titoknak', () => {
    expect(hasSensitive('Az ajánlat jelszóval védett PDF-ben megy ki holnap.')).toBe(false);
    expect(hasSensitive('Tokaji projekt, 2026-11-13 határidő')).toBe(false);
  });
  it('a naplóba titkot tartalmazó szöveg nem kerül be', () => {
    expect(safeAudit({ text: 'jelszó: Titok123' })).toEqual({ text: '[védett adat]' });
  });
  it('a chatből csak a titkot cseréli le, a kérdés többi része megmarad', () => {
    const out = redactSecrets('Lépj be info@vibateam.hu jelszó: Titok123 és nézd meg a leadeket');
    expect(out).not.toContain('Titok123');
    expect(out).toContain('info@vibateam.hu');
    expect(out).toContain('nézd meg a leadeket');
  });
});

describe('AI OS 2.0/8 — nem megbízható tartalom', () => {
  it('minden agent közös alapszabálya kimondja, hogy a forrásban írt utasítás nem rendszerutasítás, és titkot nem ismétel', () => {
    const c = buildConstitutionBlock({} as never);
    expect(c).toMatch(/NEM MEGBÍZHATÓ TARTALOM/);
    expect(c).toMatch(/soha nem írja felül/);
    expect(c).toMatch(/TITKOK/);
  });
});
