import { z } from 'zod';

export const companyBlockInput = z.object({
  companyId: z.string().uuid(), blocked: z.boolean(),
  reason: z.string().trim().min(5, 'Legalább 5 karakteres indok kötelező.').max(500),
  expectedRevision: z.string().uuid().nullable(),
}).strict();

export function companyBlockAllows(role: string, blocked: boolean) {
  return role === 'owner' || (role === 'marketing' && blocked);
}

export type CompanyBlockReceipt = { company_id: string; blocked: boolean; reason: string; changed_by: string; changed_at: string; revision: string };
export function verifyCompanyBlockReceipt(receipt: CompanyBlockReceipt | null, row: {
  id: string; marketing_blocked: boolean | null; marketing_block_reason: string | null;
  marketing_block_changed_by: string | null; marketing_block_changed_at: string | null; marketing_block_revision: string | null;
} | null, input: z.infer<typeof companyBlockInput>, userId: string) {
  if (!receipt || !row || receipt.company_id !== input.companyId || row.id !== input.companyId
    || receipt.blocked !== input.blocked || row.marketing_blocked !== input.blocked
    || receipt.reason !== input.reason.trim() || row.marketing_block_reason !== receipt.reason
    || receipt.changed_by !== userId || row.marketing_block_changed_by !== userId
    || !receipt.changed_at || row.marketing_block_changed_at !== receipt.changed_at
    || !receipt.revision || row.marketing_block_revision !== receipt.revision) {
    throw new Error('A tiltás mentése nem igazolt; frissítsd az adatlapot, ne ismételd vakon a mentést.');
  }
  return receipt;
}