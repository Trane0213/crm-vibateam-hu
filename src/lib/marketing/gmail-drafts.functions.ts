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
      return await readOwnDraft(context.supabase, context.userId, data.draftId);
    } catch { throw new Error('A teljes saját piszkozat nem olvasható vagy már megváltozott; másolás nem történt.'); }
  });