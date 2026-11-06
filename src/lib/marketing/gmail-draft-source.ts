import { z } from 'zod';

export const ownDraftInput = z.object({ draftId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/) }).strict();
export type DraftSource = {
  draftId: string; messageId: string; mailbox: string; subject: string;
  text: string | null; html: string | null; attachments: number; readAt: string;
};
export function savedDraftSource(value: unknown): { mailbox: string; draft_id: string; read_at: string } | null {
  const schema = z.object({ mailbox: z.string(), draft_id: z.string(), read_at: z.string() });
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
/** Plain campaign path cannot silently flatten HTML or discard attachments. */
export function draftTextCopy(source: DraftSource) {
  if (source.attachments) throw new Error('A mellékletes piszkozat nem másolható a szöveges kampányba.');
  if (source.text === null || !source.text.trim()) throw new Error('Nincs teljes szöveges változat; a HTML-piszkozat nem alakítható át automatikusan.');
  if (source.subject.length > 500 || source.text.length > 20000) throw new Error('A piszkozat hosszabb a kampány megengedett méreténél; nem csonkítjuk.');
  return { subject: source.subject, body: source.text };
}