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
    const { getAdminClient } = await import("@/integrations/supabase/server");
    ensureBootstrapped();

    const admin = getAdminClient();

    // User role lekérés (best effort). A CRM séma: users_profile.role_id → roles.name.
    // Régebbi kód a nem létező `user_roles` táblát olvasta, ezért mindig null-t adott.
    let userRole: string | null = null;
    try {
      const { data: prof } = await context.supabase
        .from("users_profile")
        .select("role_id, roles:role_id ( name )")
        .eq("auth_user_id", context.userId)
        .maybeSingle();
      const raw = (prof as any)?.roles?.name as string | undefined;
      userRole = raw ? raw.toLowerCase() : null;
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