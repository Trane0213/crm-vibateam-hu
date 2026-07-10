/**
 * AI OS — runtime. EGYETLEN belépési pont MINDEN agenthez.
 *
 * Felelősség:
 *   1. Agent definíció + system prompt összeállítás
 *   2. Központi memória betöltése (objektum-alapú)
 *   3. Tool-lista (registry ∩ agent ∩ role)
 *   4. LLM → tool → LLM loop (max stepCount védelemmel)
 *   5. Minden lépés naplózása agent_run_steps-be
 *   6. Approval-igénylő toolok blokkolása user jóváhagyás nélkül
 *
 * SERVER-ONLY. CRM-független.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgent } from "./agents";
import { finishRun, logStep, startRun } from "./audit.server";
import { getMemory } from "./memory.server";
import { callLlm } from "./providers.server";
import { getTool, toolsForAgent, toSpec } from "./tool-registry";
import type { ApprovalLevel, ChatMessage, ToolCall } from "./types";

const MAX_STEPS = 50;

export type RunAgentInput = {
  agentId: string;
  userId: string;
  userRole: string | null;
  threadId: string | null;
  /** A teljes beszélgetés-történet (system prompt nélkül — azt a runtime adja hozzá). */
  history: ChatMessage[];
  /** Memóriához betöltendő subjectek (pl. cég/lead/projekt amiről szó van). */
  memorySubjects?: Array<{ subject_type: string; subject_id: string }>;
  /** Approval engedélyezett tool-hívás-azonosítók (a kliens jóváhagyásai). */
  approvedToolCallIds?: string[];
};

export type RunAgentResult = {
  runId: string;
  agentId: string;
  finalText: string;
  /** Ha az LLM olyan write toolt akart hívni, ami jóváhagyásra vár, itt jelezzük. */
  pendingApprovals: Array<{
    tool_call_id: string;
    tool_name: string;
    arguments_json: string;
    approval: ApprovalLevel;
    supports_dry_run: boolean;
  }>;
  steps: number;
  usage: { prompt_tokens: number; completion_tokens: number };
};

export async function runAgent(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const agent = getAgent(input.agentId);
  if (!agent) throw new Error(`Ismeretlen agent: ${input.agentId}`);

  // 1) Tool-lista a registry-ből (szerepkör + agent szűrés).
  const allowedTools = toolsForAgent({
    agentId: agent.id,
    agentDomains: agent.tool_domains,
    agentExtraTools: agent.extra_tools,
    userRole: input.userRole,
  });
  const toolSpecs = allowedTools.map(toSpec);

  // 2) Memória betöltés (user + explicit subjectek).
  const subjects = [
    { subject_type: "user", subject_id: input.userId },
    ...(input.memorySubjects ?? []),
  ];
  const memory = await getMemory(userClient, subjects, { limit: 50 }).catch(() => []);

  // 3) System prompt összeállítás.
  const promptCtx = {
    userId: input.userId,
    userRole: input.userRole,
    nowIso: new Date().toISOString(),
    memory: memory.map((m) => ({
      subject_type: m.subject_type,
      subject_id: m.subject_id,
      key: m.key,
      value: m.value,
    })),
  };
  let systemPrompt = agent.buildSystemPrompt(promptCtx);
  if (agent.augmentSystemPrompt) {
    try {
      const extra = await agent.augmentSystemPrompt(promptCtx, userClient);
      if (extra && extra.trim()) systemPrompt = `${systemPrompt}\n\n${extra.trim()}`;
    } catch (e) {
      // Az augment nem-kritikus — logoljuk és futunk tovább.
      // eslint-disable-next-line no-console
      console.warn(`[ai-os] augmentSystemPrompt failed for ${agent.id}:`, e);
    }
  }

  // 4) Run létrehozás.
  const runId = await startRun(adminClient, {
    userId: input.userId,
    agentId: agent.id,
    threadId: input.threadId,
    provider: agent.provider,
    model: agent.model,
  });

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...input.history,
  ];

  const approved = new Set(input.approvedToolCallIds ?? []);
  let stepNo = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  const pendingApprovals: RunAgentResult["pendingApprovals"] = [];

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      stepNo++;
      const t0 = Date.now();
      const result = await callLlm({
        provider: agent.provider,
        model: agent.model,
        messages,
        tools: toolSpecs.length ? toolSpecs : undefined,
        temperature: agent.temperature,
        max_tokens: agent.max_tokens,
      });
      totalPrompt += result.usage.prompt_tokens ?? 0;
      totalCompletion += result.usage.completion_tokens ?? 0;

      await logStep(adminClient, {
        runId,
        stepNo,
        kind: "llm",
        agentId: agent.id,
        input: { messages: messages.length, model: agent.model },
        output: { text: result.text, tool_calls: result.tool_calls.length, finish: result.finish_reason },
        durationMs: Date.now() - t0,
      });

      // Ha nincs tool-hívás → vége.
      if (!result.tool_calls.length) {
        await finishRun(adminClient, {
          runId,
          status: pendingApprovals.length ? "ok" : "ok",
          promptTokens: totalPrompt,
          completionTokens: totalCompletion,
          totalSteps: stepNo,
        });
        return {
          runId,
          agentId: agent.id,
          finalText: result.text,
          pendingApprovals,
          steps: stepNo,
          usage: { prompt_tokens: totalPrompt, completion_tokens: totalCompletion },
        };
      }

      // Tool-hívások feldolgozása.
      messages.push({ role: "assistant", content: result.text, tool_calls: result.tool_calls });

      for (const call of result.tool_calls) {
        const tool = getTool(call.function.name);
        if (!tool) {
          const msg = `Ismeretlen tool: ${call.function.name}`;
          await logStep(adminClient, { runId, stepNo: ++stepNo, kind: "error", toolName: call.function.name, error: msg });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: msg }) });
          continue;
        }
        // M5 approval + dry_run állapotgép.
        // 1) Approval szint meghatározása (backward compat: needs_approval → confirm).
        const approvalLevel: ApprovalLevel =
          tool.approval ?? (tool.needs_approval ? "confirm" : "safe");
        // 2) Args parse (mode kiolvasásához).
        let parsedArgs: Record<string, unknown> = {};
        try { parsedArgs = JSON.parse(call.function.arguments || "{}"); } catch { /* noop */ }
        // 3) Effektív mode: ha a tool nem támogatja a dry_run-t, minden "execute".
        //    Ha támogatja és a hívó nem adott meg mode-ot → alapból "dry_run" (biztonság).
        const rawMode = typeof parsedArgs.mode === "string" ? (parsedArgs.mode as string) : undefined;
        const effectiveMode: "dry_run" | "execute" = tool.supports_dry_run
          ? (rawMode === "execute" ? "execute" : "dry_run")
          : "execute";
        // 4) Approval csak akkor kell, ha a művelet valóban végrehajtó (execute) ÉS a
        //    szint nem safe. Dry run soha nem igényel jóváhagyást.
        const requiresApproval =
          approvalLevel !== "safe" && effectiveMode === "execute" && !approved.has(call.id);
        if (requiresApproval) {
          const rawArgs = call.function.arguments || "{}";
          pendingApprovals.push({
            tool_call_id: call.id,
            tool_name: tool.name,
            arguments_json: rawArgs,
            approval: approvalLevel,
            supports_dry_run: tool.supports_dry_run ?? false,
          });
          await logStep(adminClient, {
            runId, stepNo: ++stepNo, kind: "approval", toolName: tool.name,
            input: { call_id: call.id, args: parsedArgs, approval: approvalLevel, mode: effectiveMode },
          });
          messages.push({
            role: "tool", tool_call_id: call.id,
            content: JSON.stringify({
              pending_approval: true,
              approval_level: approvalLevel,
              message: approvalLevel === "dangerous"
                ? "DANGEROUS művelet — a felhasználó gépelt megerősítést fog kérni."
                : "Felhasználói jóváhagyásra vár.",
            }),
          });
          continue;
        }
        // Végrehajtás. A tool maga felelős a dry_run vs execute szétválasztásáért
        // (args.mode alapján). A runtime csak biztosítja, hogy execute-hoz volt approval.
        const tStart = Date.now();
        const args: Record<string, unknown> = {
          ...parsedArgs,
          // Ha a tool támogatja a dry_run-t és nem volt explicit mode, injektáljuk a
          // biztonsági alapot, hogy a tool determinisztikusan lássa.
          ...(tool.supports_dry_run ? { mode: effectiveMode } : {}),
        };
        let output: unknown;
        let errMsg: string | undefined;
        try {
          output = await tool.execute(args, {
            userId: input.userId, agentId: agent.id,
            threadId: input.threadId, runId,
            supabaseUser: userClient,
            supabaseAdmin: adminClient,
          });
        } catch (e: any) {
          errMsg = e?.message ?? String(e);
          output = { error: errMsg };
        }
        await logStep(adminClient, {
          runId, stepNo: ++stepNo, kind: "tool", toolName: tool.name,
          input: { ...args, __approval: approvalLevel, __mode: effectiveMode },
          output, error: errMsg, durationMs: Date.now() - tStart,
        });
        messages.push({
          role: "tool", tool_call_id: call.id,
          content: JSON.stringify(output).slice(0, 24_000),
        });
      }

      // Ha minden tool-hívás approval-ra vár → szakítsuk meg a loopot.
      const allPending = result.tool_calls.every(
        (c: ToolCall) => pendingApprovals.some((p) => p.tool_call_id === c.id),
      );
      if (allPending && pendingApprovals.length) {
        await finishRun(adminClient, {
          runId, status: "ok",
          promptTokens: totalPrompt, completionTokens: totalCompletion, totalSteps: stepNo,
        });
        return {
          runId, agentId: agent.id, finalText: result.text,
          pendingApprovals, steps: stepNo,
          usage: { prompt_tokens: totalPrompt, completion_tokens: totalCompletion },
        };
      }
    }

    // Step-limit túllépés.
    await finishRun(adminClient, {
      runId, status: "error", errorMessage: `Step limit elérve (${MAX_STEPS}).`,
      promptTokens: totalPrompt, completionTokens: totalCompletion, totalSteps: stepNo,
    });
    throw new Error(`AI futás megszakítva: elérte a ${MAX_STEPS} lépéses határt.`);
  } catch (e: any) {
    await finishRun(adminClient, {
      runId, status: "error", errorMessage: e?.message ?? String(e),
      promptTokens: totalPrompt, completionTokens: totalCompletion, totalSteps: stepNo,
    });
    throw e;
  }
}