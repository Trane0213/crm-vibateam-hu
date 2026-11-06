import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { companyBlockInput, companyBlockAllows, verifyCompanyBlockReceipt, type CompanyBlockReceipt } from './company-block';

const COLUMNS = 'id,marketing_blocked,marketing_block_reason,marketing_block_changed_by,marketing_block_changed_at,marketing_block_revision';
export const readCompanyBlock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    const result = await context.supabase.from('companies').select(COLUMNS).eq('id', data.companyId).maybeSingle();
    if (result.error || !result.data) throw new Error('A cég tiltási állapota nem olvasható.');
    return result.data;
  });

export const setCompanyBlock = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(companyBlockInput)
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc('crm_role_of', { _auth_user: context.userId });
    if (role.error || !companyBlockAllows(String(role.data), data.blocked)) throw new Error('Nincs jogosultság a tiltás módosításához.');
    const saved = await context.supabase.rpc('company_set_marketing_block', {
      p_company: data.companyId, p_blocked: data.blocked, p_reason: data.reason, p_expected_revision: data.expectedRevision,
    });
    if (saved.error) throw new Error(saved.error.message);
    const read = await context.supabase.from('companies').select(COLUMNS).eq('id', data.companyId).maybeSingle();
    if (read.error) throw new Error('A mentés visszaellenőrzése nem sikerült; frissítsd az adatlapot.');
    return verifyCompanyBlockReceipt(saved.data as CompanyBlockReceipt | null, read.data, data, context.userId);
  });