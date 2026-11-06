import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export const setCompanyMarketingStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    companyId: z.string().uuid(),
    status: z.enum(['new', 'contacted', 'qualified', 'handoff', 'rejected']),
    handoffLeadId: z.string().uuid().nullable().default(null),
    expected: z.object({
      marketing_status: z.string().nullable(),
      marketing_status_changed_at: z.string().nullable(),
      notes: z.string().nullable(),
    }).strict(),
  }).strict())
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc('company_set_marketing_status', {
      p_company: data.companyId, p_status: data.status,
      p_expected: data.expected, p_handoff_lead: data.handoffLeadId ?? undefined,
    });
    if (result.error) throw new Error(result.error.message);
    const saved = await context.supabase.from('companies').select('*').eq('id', data.companyId).single();
    if (saved.error) throw new Error('Az állapot mentése után a visszaolvasás nem sikerült. Frissítsd az adatlapot.');
    if (saved.data.marketing_status !== data.status || saved.data.marketing_handoff_lead_id !== data.handoffLeadId) {
      throw new Error('A visszaolvasott állapot eltér. Frissítsd az adatlapot.');
    }
    return saved.data;
  });