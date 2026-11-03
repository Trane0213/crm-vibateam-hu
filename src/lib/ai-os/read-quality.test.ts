import {describe,it,expect} from 'vitest';
import {validateReadIds,localModelDates,groundedReadAnswer,readCaveats} from './read-quality';
describe('Shared read quality boundaries',()=>{
 it('rejects malformed and me record IDs before reads',()=>{for(const v of ['me','Ramon','',42])expect(()=>validateReadIds({company_id:v})).toThrow();});
 it('accepts exact UUID while retaining own-assignee alias',()=>{expect(()=>validateReadIds({company_id:'00000000-0000-4000-8000-000000000001',assigned_to:'me'})).not.toThrow();});
 it('model dates are localized once across timeline and records',()=>{const r=localModelDates({at:'2026-11-03T09:00:00Z'}) as {at:string};expect(r.at).toContain('10:00');expect(localModelDates(r)).toEqual(r);});
 it('does not keep definitive absent Gmail reply beside a caveat',()=>{const c=readCaveats({data:{mailbox_context:{}}});expect(groundedReadAnswer('Nem érkezett válasz.',c,'sales')).not.toContain('Nem érkezett válasz.');});
 it('withholds invented reason for missing company data',()=>{expect(groundedReadAnswer('mivel a cég nem valós',readCaveats({data:{company:{}}}),'sales')).not.toContain('mivel a cég nem valós');});
 it('completed history stays distinct from planned followup',()=>{const c=readCaveats({data:{section:'followups',items:[{completed:true},{completed:true}]}});expect(groundedReadAnswer('egy tervezett és egy megtörtént',c,'sales')).not.toContain('egy tervezett és');});
});