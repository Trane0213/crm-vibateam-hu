import {it,expect} from 'vitest';
import {prepareCompanyCall} from './marketing-call';
it('requires a callback deadline',async()=>expect(prepareCompanyCall({} as any,{outcome:'callback'})).rejects.toThrow('időpontja kötelező'));
it('keeps a valid callback in the existing phone call fields',async()=>expect((await prepareCompanyCall({} as any,{outcome:'callback',callback_date:'2026-11-06T11:00:00Z'})).callback_date).toBe('2026-11-06T11:00:00Z'));