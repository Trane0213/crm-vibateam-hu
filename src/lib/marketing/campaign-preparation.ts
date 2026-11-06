import { z } from 'zod';
import type { ContactProvenance } from '@/lib/contact-provenance';

export const campaignCopyInput = z.object({
  id: z.string().uuid().nullable().optional(),
  expectedUpdatedAt: z.string().nullable().optional(),
  name: z.string().trim().min(1, 'A kampány neve kötelező.').max(200),
  target_group: z.string().trim().max(500).nullable().optional(),
  message_subject: z.string().max(500),
  message_body: z.string().max(20000),
}).strict().superRefine((v, ctx) => {
  if (v.id && !v.expectedUpdatedAt) ctx.addIssue({ code: 'custom', path: ['expectedUpdatedAt'], message: 'Nyisd újra az aktuális tervezetet.' });
});

export function explicitContactIds(selected: string[], available: string[]) {
  const allowed = new Set(available);
  return [...new Set(selected)].filter(id => allowed.has(id));
}

export function campaignPreview(subject: string, body: string, contact: ContactProvenance & { name?: string | null; company_name?: string | null }) {
  const personalName = contact.contact_kind === 'person' && contact.verification_state === 'human_verified'
    && contact.verified_at && contact.verified_by ? contact.name ?? '' : '';
  const render = (text: string) => text.replace(/\{\{(ceg|nev)\}\}/g, (_, key: string) => key === 'ceg' ? contact.company_name ?? '' : personalName);
  return { subject: render(subject), body: render(body), personalNameUsed: !!personalName };
}