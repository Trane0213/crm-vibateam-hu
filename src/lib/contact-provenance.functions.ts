import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { contactProvenanceInput } from './contact-provenance';
import type { Json } from '@/integrations/supabase/types';

export const saveContactProvenance = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator(contactProvenanceInput)
  .handler(async ({ data, context }) => {
    const result = await context.supabase.rpc('contact_set_provenance', {
      p_contact: data.contactId, p_expected: data.expected as Json,
      p_kind: data.kind, p_source: data.source, p_state: data.state,
      p_reference: data.reference || undefined,
    });
    if (result.error) throw new Error(result.error.message);
    const saved = await context.supabase.from('contacts').select('*').eq('id',data.contactId).single();
    if (saved.error || saved.data.contact_kind !== data.kind || saved.data.data_source !== data.source || saved.data.verification_state !== data.state) {
      throw new Error('Az ellenőrzöttség visszaolvasása nem igazolt. Frissítsd a kapcsolattartót.');
    }
    return saved.data;
  });