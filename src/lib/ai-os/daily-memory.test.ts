import { it,expect,vi } from 'vitest';
import { getMemory } from './memory.server';
import type { SupabaseClient } from '@supabase/supabase-js';
it('excludes reserved daily cache before ordering/limiting any automatic agent memory read',async()=>{
 const q={select:vi.fn(),not:vi.fn(),or:vi.fn(),order:vi.fn(),limit:vi.fn()};
 for(const fn of [q.select,q.not,q.or,q.order])fn.mockReturnValue(q);
 q.limit.mockResolvedValue({data:[{key:'ordinary',value:'TESZT'}],error:null});
 const client={from:vi.fn(()=>q)} as unknown as SupabaseClient;
 expect(await getMemory(client,[{subject_type:'user',subject_id:'00000000-0000-4000-8000-000000000001'}])).toEqual([{key:'ordinary',value:'TESZT'}]);
 expect(q.not).toHaveBeenCalledWith('key','like','system:daily-sales:%');
 expect(q.not.mock.invocationCallOrder[0]).toBeLessThan(q.limit.mock.invocationCallOrder[0]??0);
});