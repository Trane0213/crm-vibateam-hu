import { z } from "zod";

export const prepActivityInput = z.object({
  leadId: z.string().uuid(),
  type: z.enum(["call", "email"]),
  result: z.string().trim().max(10000),
}).strict();

/** The recording clock is supplied only by the server handler, never the caller. */
export function prepActivityPayload(input: z.infer<typeof prepActivityInput>, companyId: string | null, recordedAt: Date) {
  const timestamp = recordedAt.toISOString();
  return { lead_id: input.leadId, company_id: companyId, followup_type: input.type,
    result: input.result || null, completed: true, due_date: timestamp, created_at: timestamp };
}