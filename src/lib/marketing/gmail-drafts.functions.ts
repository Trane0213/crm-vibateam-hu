import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { ownDraftInput } from './gmail-draft-source';

export const listOwnGmailDrafts = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ pageToken: z.string().max(500).optional() }).strict())
  .handler(async ({ data, context }) => {
    try {
      const { listOwnDrafts } = await import('./gmail-drafts.server');
      return await listOwnDrafts(context.supabase, context.userId, data.pageToken);
    } catch { throw new Error('A saját Gmail-piszkozatok nem olvashatók; ellenőrizd a fiók állapotát.'); }
  });

export const readOwnGmailDraft = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(ownDraftInput)
  .handler(async ({ data, context }) => {
    try {
      const { readOwnDraft } = await import('./gmail-drafts.server');
      const { sourceHash } = await import('./campaign-gmail-source.server');
      const source = await readOwnDraft(context.supabase, context.userId, data.draftId);
      return { ...source, hash: sourceHash(source) };
    } catch { throw new Error('A teljes saját piszkozat nem olvasható vagy már megváltozott; másolás nem történt.'); }
  });

export const importGmailCampaignSource = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ campaignId: z.string().uuid(), revision: z.string().min(1), draftId: ownDraftInput.shape.draftId, expectedHash: z.string().regex(/^[a-f0-9]{64}$/), confirmed: z.literal(true) }).strict())
  .handler(async ({ data, context }) => {
    const { importCampaignSource } = await import('./campaign-gmail-source.server');
    return importCampaignSource(context.supabase, context.userId, data);
  });
export const detachGmailCampaignSource = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ campaignId: z.string().uuid(), revision: z.string().min(1), confirmed: z.literal(true) }).strict())
  .handler(async ({ data, context }) => {
    const { detachCampaignSource } = await import('./campaign-gmail-source.server');
    return detachCampaignSource(context.supabase, context.userId, data.campaignId, data.revision);
  });