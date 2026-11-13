/**
 * AI OS — TanStack server function belépés a UI számára.
 *
 * NEM CRM-specifikus. Egy generikus `runAiAgent` endpoint, amit minden
 * agent-chat UI használ.
 */

import { createServerFn } from "@tanstack/react-start";
import { redactSecrets } from "./approval";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import type { ChatMessage } from "./types";
import { z } from "zod";
import { decisionSchema, statusSchema } from "./approval";
import { progressLabel } from './progress';

type RunInput = {
  agentId: string;
  threadId?: string | null;
  history: ChatMessage[];
  memorySubjects?: Array<{ subject_type: string; subject_id: string }>;
  approvedToolCallIds?: string[];
};

function validate(input: unknown): RunInput {
  return z.object({
    agentId: z.string().min(1).max(80), threadId: z.string().uuid().nullable().optional(),
    history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(24000) }).strict()).max(20),
    memorySubjects: z.array(z.object({ subject_type: z.string().max(80), subject_id: z.string().uuid() }).strict()).max(20).optional(),
  }).strict().parse(input);
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

    const { authorizeAgent } = await import("./approval.server");
    const userRole = await authorizeAgent(context.supabase, context.userId, data.agentId);

    // agent_runs.thread_id → ai_threads FK: a kliens szál-UUID-jához saját, tartalommentes
    // ai_threads sort biztosítunk user-RLS-sel; ha nem a hívóé, szál nélkül futunk.
    let threadId: string | null = null;
    if (data.threadId) {
      await context.supabase.from("ai_threads")
        .upsert({ id: data.threadId, user_id: context.userId, agent_id: data.agentId }, { onConflict: "id", ignoreDuplicates: true });
      const own = await context.supabase.from("ai_threads").select("id").eq("id", data.threadId).eq("user_id", context.userId).maybeSingle();
      threadId = own.data?.id ?? null;
    }

    return await runAgent(context.supabase, admin, {
      agentId: data.agentId,
      userId: context.userId,
      userRole,
      threadId,
      history: data.history.map((m) => ({ ...m, content: redactSecrets(m.content) })),
      memorySubjects: data.memorySubjects,
    });
  });
export const getOwnRunProgress=createServerFn({method:'POST'})
  .middleware([requireSupabaseAuth])
  .inputValidator((v:unknown)=>z.object({threadId:z.string().uuid(),since:z.string().datetime()}).strict().parse(v))
  .handler(async({data,context})=>{
    const run=await context.supabase.from('agent_runs').select('id,status').eq('user_id',context.userId).eq('thread_id',data.threadId).gte('started_at',data.since).order('started_at',{ascending:false}).limit(1).maybeSingle();
    if(run.error || !run.data)return null;
    const step=await context.supabase.from('agent_run_steps').select('tool_name,error').eq('run_id',run.data.id).eq('kind','tool').order('step_no',{ascending:false}).limit(1).maybeSingle();
    return {label:progressLabel(step.error?null:step.data?.tool_name??null,run.data.status,!!step.data?.error)};
  });
export const decideAiAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => decisionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { ensureBootstrapped } = await import("./bootstrap.server");
    const { decideAction } = await import("./approval.server");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    ensureBootstrapped();
    return decideAction(context.supabase, getAdminClient(), context.userId, data, context.accessToken);
  });

export const getAiActions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { ensureBootstrapped } = await import("./bootstrap.server");
    const { decideAction } = await import("./approval.server");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    ensureBootstrapped();
    const admin = getAdminClient();
    return Promise.all(data.actionIds.map(actionId => decideAction(context.supabase, admin, context.userId, { actionId, decision: "check" })));
  });
