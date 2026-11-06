import { z } from 'zod';
export const CONTACT_KIND = { person: 'Személy', shared_mailbox: 'Gyűjtőcím', unknown: 'Ismeretlen' };
export const CONTACT_SOURCE = { manual: 'Kézi adatfelvétel', document_import: 'Dokumentum / import', email_inferred: 'Emailből következtetett', direct_confirmation: 'Közvetlen megerősítés' };
export type ContactProvenance = {
  contact_kind?: string | null; data_source?: string | null; verification_state?: string | null;
  verification_reference?: string | null; verified_by?: string | null; verified_at?: string | null;
};
export function contactProvenanceLabel(c: ContactProvenance) {
  const kind = Object.entries(CONTACT_KIND).find(([key]) => key === c.contact_kind)?.[1] ?? 'Nincs rögzítve';
  return `${kind} · ${c.verification_state === 'human_verified' && c.verified_at && c.verified_by ? 'Ember által ellenőrzött' : 'Nem ellenőrzött'}`;
}
export const contactProvenanceInput = z.object({
  contactId: z.string().uuid(), expected: z.record(z.string(), z.unknown()),
  kind: z.enum(['person','shared_mailbox','unknown']),
  source: z.enum(['manual','document_import','email_inferred','direct_confirmation']),
  state: z.enum(['unverified','human_verified']), reference: z.string().trim().max(500),
}).strict().superRefine((v,ctx) => {
  if (v.state === 'human_verified' && (v.kind === 'unknown' || v.reference.length < 5)) {
    ctx.addIssue({ code: 'custom', path: ['reference'], message: 'Ellenőrzéshez besorolás és legalább 5 karakteres emberi ellenőrzési hivatkozás szükséges.' });
  }
});