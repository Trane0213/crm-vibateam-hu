import { z } from 'zod';
import { canonical, hasSensitive } from './approval';

const header = z.string().min(1).max(300).refine(v => !/[\r\n]/.test(v));
const address = z.string().email().max(254);
export const emailSendInput = z.object({
  leadId: z.string().uuid(), mailbox: address,
  to: z.array(address).min(1).max(20), cc: z.array(address).max(20).default([]), bcc: z.array(address).max(20).default([]),
  subject: header, body: z.string().trim().min(1).max(16000),
  quoteId: z.string().uuid().optional(), threadId: z.string().uuid().optional(),
  documents: z.array(z.object({ source: z.enum(['quote_documents','company_documents','project_documents']), document_id: z.string().uuid(), project_id: z.string().uuid().optional() }).strict()).max(10).default([]),
}).strict().superRefine((v, ctx) => {
  const all = [...v.to,...v.cc,...v.bcc].map(x => x.toLowerCase());
  if (new Set(all).size !== all.length) ctx.addIssue({ code: 'custom', message: 'Ismétlődő címzett.' });
  if (new Set(v.documents.map(d => d.document_id)).size !== v.documents.length) ctx.addIssue({ code: 'custom', message: 'Ismétlődő melléklet.' });
  if (hasSensitive(v)) ctx.addIssue({ code: 'custom', message: 'Védett adat nem küldhető.' });
});
export const emailSendAction = z.object({
  message: emailSendInput,
  context: z.object({ lead: z.record(z.string(),z.unknown()), company: z.record(z.string(),z.unknown()), contact: z.record(z.string(),z.unknown()).nullable(), quote: z.record(z.string(),z.unknown()).nullable(), thread: z.record(z.string(),z.unknown()).nullable() }).strict(),
  attachments: z.array(z.object({ source: z.string(), document_id: z.string().uuid(), key: z.string().min(1).max(1024), name: header, mime: header, size: z.number().int().min(0), sha256: z.string().regex(/^[a-f0-9]{64}$/), version: z.unknown() }).strict()).max(10),
}).strict();
export type EmailSendAction = z.infer<typeof emailSendAction>;
export function assertSameEmail(expected: unknown, actual: unknown) {
  if (canonical(expected) !== canonical(actual)) throw new Error('Megváltozott ügy vagy melléklet; új jóváhagyás szükséges.');
}
export async function byteHash(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
export function verifyEmailSend(value: unknown, args: Record<string, unknown>): boolean {
  const a = emailSendAction.safeParse(args);
  const d = value as { gmail_message_id?: string; email_id?: string; thread_id?: string; mailbox?: string; lead_id?: string; verified_sent?: boolean; proof_saved?: boolean } | null;
  return a.success && !!d?.gmail_message_id && !!d.email_id && !!d.thread_id && d.mailbox === a.data.message.mailbox && d.lead_id === a.data.message.leadId && d.verified_sent === true && d.proof_saved === true;
}