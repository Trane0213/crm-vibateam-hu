/**
 * AI OS — TanStack server function belépés a UI számára.
 *
 * NEM CRM-specifikus. Egy generikus `runAiAgent` endpoint, amit minden
 * agent-chat UI használ.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import type { ChatMessage } from "./types";

type RunInput = {
  agentId: string;
  threadId?: string | null;
  history: ChatMessage[];
  memorySubjects?: Array<{ subject_type: string; subject_id: string }>;
  approvedToolCallIds?: string[];
};

function validate(input: unknown): RunInput {
  const i = input as RunInput;
  if (!i || typeof i.agentId !== "string") throw new Error("agentId kötelező");
  if (!Array.isArray(i.history)) throw new Error("history kötelező");
  return i;
}

export const runAiAgent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { ensureBootstrapped } = await import("./bootstrap.server");
    const { runAgent } = await import("./runtime.server");
    const { createClient } = await import("@supabase/supabase-js");
    ensureBootstrapped();

    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // User role lekérés (best effort)
    let userRole: string | null = null;
    try {
      const { data: roleRow } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .limit(1)
        .maybeSingle();
      userRole = (roleRow as { role: string } | null)?.role ?? null;
    } catch { /* noop */ }

    return await runAgent(context.supabase, admin, {
      agentId: data.agentId,
      userId: context.userId,
      userRole,
      threadId: data.threadId ?? null,
      history: data.history,
      memorySubjects: data.memorySubjects,
      approvedToolCallIds: data.approvedToolCallIds,
    });
  });