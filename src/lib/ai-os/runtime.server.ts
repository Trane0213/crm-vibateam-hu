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
import { isToolErrorEnvelope, sanitizeErrorForLlm, toolError } from "./tool-errors";
import { createApproval, frozenArgs } from "./approval.server";
import { failureResult, type ApprovalSnapshot } from "./approval";
import { modelToolPayload } from "./tool-payload";
import { emailToolAudit } from "./email-audit";
import { documentToolAudit } from "./document-audit";
import { RuntimeOutcome } from './runtime-outcome';
import { collectObservedIds, consultSystemBlock, isConsultReadTool, isReviewTool, MAX_HANDOFFS_PER_RUN, type SpecialistReport } from './consult';
import { validateReadIds, localModelDates, readCaveats, groundedReadAnswer, collectLeadCompanies, correctLeadAsCompany } from './read-quality';

const MAX_STEPS = 50;

/**
 * Szerveroldali jogosultság-ellenőrzés MINDEN tool-hívás előtt.
 *
 * Védelem az ellen, hogy egy jailbroken prompt olyan tool nevet emittáljon,
 * amit a spec-listában NEM adtunk át az LLM-nek. A kliens visible-agents /
 * agent-gate szűrése csak UX — a valós határ itt van.
 *
 * Visszatérés: null = OK, string = deny indoklás (kerül az LLM-hez).
 */
function assertAgentToolAccess(opts: {
  toolName: string;
  toolDomain: string;
  agentId: string;
  agentDomains: string[];
  agentExtraTools?: string[];
  toolAllowedAgents?: string[];
  toolAllowedRoles?: string[];
  userRole: string | null;
}): string | null {
  const domainOk =
    opts.agentDomains.includes(opts.toolDomain) ||
    (opts.agentExtraTools?.includes(opts.toolName) ?? false);
  if (!domainOk) {
    return `Access denied: a(z) "${opts.toolName}" tool (${opts.toolDomain}) nem érhető el a(z) "${opts.agentId}" agent számára.`;
  }
  if (opts.toolAllowedAgents?.length && !opts.toolAllowedAgents.includes(opts.agentId)) {
    return `Access denied: a(z) "${opts.toolName}" tool ehhez az agenthez nem engedélyezett.`;
  }
  if (opts.toolAllowedRoles?.length) {
    if (!opts.userRole || !opts.toolAllowedRoles.includes(opts.userRole)) {
      return `Access denied: a(z) "${opts.toolName}" tool a jelenlegi felhasználói szerepkörrel ("${opts.userRole ?? "ismeretlen"}") nem hívható.`;
    }
  }
  return null;
}

export type RunAgentInput = {
  agentId: string;
  userId: string;
  userRole: string | null;
  threadId: string | null;
  /** A teljes beszélgetés-történet (system prompt nélkül — azt a runtime adja hozzá). */
  history: ChatMessage[];
  /** Memóriához betöltendő subjectek (pl. cég/lead/projekt amiről szó van). */
  memorySubjects?: Array<{ subject_type: string; subject_id: string }>;
  /** Legacy callers are rejected; these IDs never grant permission. */
  approvedToolCallIds?: string[];
  /** AI OS 2.0/3: George által indított szakértői konzultáció — csak olvasó eszközök, JSON-szerződés. */
  consult?: { fromAgent: string; parentRunId: string };
  /** Csak olvasó futás (konzultáció engedélyezett), pl. George hibajegy-vizsgálata. */
  readOnly?: boolean;
};

export type RunAgentResult = {
  runId: string;
  agentId: string;
  finalText: string;
  /** Ha az LLM olyan write toolt akart hívni, ami jóváhagyásra vár, itt jelezzük. */
  pendingApprovals: ApprovalSnapshot[];
  steps: number;
  usage: { prompt_tokens: number; completion_tokens: number };
  /** Az eszköz-eredményekben ténylegesen látott azonosítók (forrás-ellenőrzéshez). */
  observedIds: string[];
  /** A futás alatt ténylegesen lefutott szakértői konzultációk strukturált jelentései. */
  consultations: SpecialistReport[];
};

export async function runAgent(
  userClient: SupabaseClient,
  adminClient: SupabaseClient,
  input: RunAgentInput,
): Promise<RunAgentResult> {
  const agent = getAgent(input.agentId);
  if (!agent) throw new Error(`Ismeretlen agent: ${input.agentId}`);
  if (input.approvedToolCallIds?.length) throw new Error("Régi jóváhagyás nem hajtható végre; új művelet szükséges.");

  // 1) Tool-lista a registry-ből (szerepkör + agent szűrés).
  const allowedTools = toolsForAgent({
    agentId: agent.id,
    agentDomains: agent.tool_domains,
    agentExtraTools: agent.extra_tools,
    userRole: input.userRole,
  }).filter((t) => (input.consult ? isConsultReadTool(t) : input.readOnly ? isReviewTool(t) : true));
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
  if (agent.id === 'timothy') systemPrompt += `\nELLENŐRZÖTT MŰVELETI KERET: ${JSON.stringify({ role: input.userRole, allowed_actions: allowedTools.filter(t => t.needs_approval || (t.approval && t.approval !== 'safe')).map(t => t.name), lead_reassignment_available: allowedTools.some(t => t.name === 'sales_reassign_lead'), assignment_scope: 'owner_only_open_lead_P0; won/lost_terminal; assigned_sales_not_owner' })}. Csak a felsorolt műveleteket ajánld a felhasználónak; az elérhetőség nem egyedi rekordengedély.\n`;
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

  if (input.consult) systemPrompt += `\n\n${consultSystemBlock(input.consult.fromAgent)}`;

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

  const outcome = new RuntimeOutcome();
  const caveats=new Set<string>(); const observedLeadCompanies=new Map<string,string>();
  let stepNo = 0;
  let totalPrompt = 0;
  let totalCompletion = 0;
  const pendingApprovals: RunAgentResult["pendingApprovals"] = [];
  const observed = new Set<string>();
  const consultations: SpecialistReport[] = [];
  let handoffs = 0;

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
        api: agent.api,
        reasoning_effort: agent.reasoning_effort,
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
          status: outcome.failed ? "error" : "ok",
          promptTokens: totalPrompt,
          completionTokens: totalCompletion,
          totalSteps: stepNo,
        });
        return {
          runId,
          agentId: agent.id,
          finalText: input.consult ? result.text : outcome.text(agent.id==='timothy' ? groundedReadAnswer(result.text,[...caveats],input.userRole) : result.text, pendingApprovals.length > 0),
          pendingApprovals,
          steps: stepNo,
          usage: { prompt_tokens: totalPrompt, completion_tokens: totalCompletion },
          observedIds: [...observed],
          consultations,
        };
      }

      // Tool-hívások feldolgozása.
      messages.push({ role: "assistant", content: result.text, tool_calls: result.tool_calls });

      for (const call of result.tool_calls) {
        const tool = getTool(call.function.name);
        if (!tool) {
          outcome.record(call.function.name, true, false);
          const msg = `Ismeretlen tool: ${call.function.name}`;
          await logStep(adminClient, { runId, stepNo: ++stepNo, kind: "error", toolName: call.function.name, error: msg });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: msg }) });
          continue;
        }
        // Szerveroldali access-check (defense in depth). A tool létezik a
        // registryben, de ellenőrizzük, hogy a jelenlegi agent+role hívhatja-e.
        const denyReason = assertAgentToolAccess({
          toolName: tool.name,
          toolDomain: tool.domain,
          agentId: agent.id,
          agentDomains: agent.tool_domains,
          agentExtraTools: agent.extra_tools,
          toolAllowedAgents: tool.allowed_agents,
          toolAllowedRoles: tool.allowed_roles,
          userRole: input.userRole,
        });
        if (denyReason) {
          outcome.record(tool.name, true, false);
          await logStep(adminClient, {
            runId, stepNo: ++stepNo, kind: "error",
            toolName: tool.name, agentId: agent.id, error: denyReason,
          });
          messages.push({
            role: "tool", tool_call_id: call.id,
            content: JSON.stringify({ error: denyReason }),
          });
          continue;
        }
        const extraDeny = (input.consult && !isConsultReadTool(tool)) || (input.readOnly && !isReviewTool(tool))
          ? `Access denied: ebben a vizsgálati módban csak olvasó eszköz hívható ("${tool.name}").`
          : tool.domain === "core.handoff" && handoffs >= MAX_HANDOFFS_PER_RUN
            ? `Egy futásban legfeljebb ${MAX_HANDOFFS_PER_RUN} szakértői konzultáció indítható; foglald össze az eddigieket.`
            : null;
        if (extraDeny) {
          outcome.record(tool.name, true, false);
          await logStep(adminClient, { runId, stepNo: ++stepNo, kind: "error", toolName: tool.name, agentId: agent.id, error: extraDeny });
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: extraDeny }) });
          continue;
        }
        if (tool.domain === "core.handoff") handoffs++;
        // M5 approval + dry_run állapotgép.
        // 1) Approval szint meghatározása (backward compat: needs_approval → confirm).
        const approvalLevel: ApprovalLevel =
          tool.approval ?? (tool.needs_approval ? "confirm" : "safe");
        // 2) Args parse (mode kiolvasásához).
        let parsedArgs: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(call.function.arguments || "{}");
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Érvénytelen műveleti paraméterek.");
          parsedArgs = parsed as Record<string, unknown>;
        } catch { throw new Error("Érvénytelen műveleti paraméterek; nem történt végrehajtás."); }
        // 3) Effektív mode: ha a tool nem támogatja a dry_run-t, minden "execute".
        //    Ha támogatja és a hívó nem adott meg mode-ot → alapból "dry_run" (biztonság).
        const rawMode = typeof parsedArgs.mode === "string" ? (parsedArgs.mode as string) : undefined;
        const effectiveMode: "dry_run" | "execute" = tool.supports_dry_run
          ? (rawMode === "execute" ? "execute" : "dry_run")
          : "execute";
        // 4) Approval csak akkor kell, ha a művelet valóban végrehajtó (execute) ÉS a
        //    szint nem safe. Dry run soha nem igényel jóváhagyást.
        const requiresApproval =
          approvalLevel !== "safe" && effectiveMode === "execute";
        if (requiresApproval) {
          const args = await frozenArgs(userClient, tool.domain, { ...parsedArgs, ...(tool.supports_dry_run ? { mode: effectiveMode } : {}) });
          const pending = await createApproval(adminClient, {
            runId, userId: input.userId, stepNo: ++stepNo, agentId: agent.id,
            toolName: tool.name, callId: call.id, args,
            approval: approvalLevel === "dangerous" ? "dangerous" : "confirm",
            supportsDryRun: tool.supports_dry_run ?? false,
          });
          pendingApprovals.push(pending);
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
        // E1: strukturált hiba normalizálás + automatikus retry retriable hibáknál.
        const tStart = Date.now();
        let args: Record<string, unknown> = {
          ...parsedArgs,
          ...(tool.supports_dry_run ? { mode: effectiveMode } : {}),
        };
        let output: unknown;
        let errMsg: string | undefined;
        let attempts = 0;
        const MAX_ATTEMPTS = 2; // egy retry — csak retriable hibáknál, csak read-only toolnál
        // Retry csak olyan hívásoknál engedélyezett, amelyeknek nincs
        // állapotváltoztató hatása: safe read-only tool, vagy dry_run mód.
        const readOnly = (approvalLevel === "safe" && !tool.needs_approval && (tool.domain.startsWith('crm.') || tool.domain === 'kg' || tool.domain === 'website.knowledge' || tool.name === 'memory_read')) || effectiveMode === "dry_run";
        const canRetry = readOnly;
        let idCorrected = false;
        if (agent.id === 'timothy' && readOnly) { const c = correctLeadAsCompany(args, observedLeadCompanies); args = c.args; idCorrected = c.corrected; }
        while (attempts < MAX_ATTEMPTS) {
          attempts++;
          try {
            if(agent.id==='timothy' && readOnly)validateReadIds(args);
            output = await tool.execute(args, {
              userId: input.userId, agentId: agent.id,
              userRole: input.userRole,
              threadId: input.threadId, runId,
              supabaseUser: userClient,
              supabaseAdmin: adminClient,
            });
            errMsg = undefined;
          } catch (e: unknown) {
            output = toolError.fromException(e);
            errMsg = e instanceof Error ? e.message : String(e);
          }
          // Retry döntés: csak strukturált, retriable hiba + safe (read-only) tool.
          if (
            attempts < MAX_ATTEMPTS &&
            canRetry &&
            isToolErrorEnvelope(output) &&
            output.error.retriable
          ) {
            await new Promise((r) => setTimeout(r, 250 * attempts));
            continue;
          }
          break;
        }
        if (failureResult(output)) { outcome.record(tool.name, true, readOnly); errMsg = "A művelet sikertelen."; }
        else {
          outcome.observe(output);
          if (tool.domain === "core.handoff") {
            const o = output as { report?: SpecialistReport; verified_source_ids?: unknown };
            if (o && o.report) consultations.push(o.report);
            if (Array.isArray(o?.verified_source_ids)) for (const id of o.verified_source_ids) if (typeof id === "string") observed.add(id.toLowerCase());
          } else collectObservedIds(output, observed);
          if(agent.id==='timothy'){for(const c of readCaveats(output))caveats.add(c);collectLeadCompanies(tool.name,output,observedLeadCompanies);}}
        // Az LLM-hez sanitizált változat megy — a technical_reason audit-only.
        const llmPayload: unknown = isToolErrorEnvelope(output)
          ? { ok: false, error: sanitizeErrorForLlm(output.error) }
          : output;
        await logStep(adminClient, {
          runId,
          stepNo: ++stepNo,
          // AI-1.5: a handoff-jellegű toolokat külön naplózzuk, hogy az
          // audit-view egyértelműen szét tudja választani a delegálást a
          // sima tool-hívásoktól.
          kind: tool.domain === "core.handoff" ? "handoff" : "tool",
          toolName: tool.name,
          agentId: agent.id,
          input: { ...args, __approval: approvalLevel, __mode: effectiveMode, ...(idCorrected ? { __lead_id_as_company_corrected: true } : {}) },
          // A teljes (technical_reason-nel együtt) output kerül auditba,
          // a `retry_attempts` mező jelzi ha volt retry.
          output: { ...(["crm_read_email_thread", "scarlet_read_email_thread"].includes(tool.name) ? emailToolAudit(output) as Record<string, unknown> : tool.name === "crm_read_document" ? documentToolAudit(output) : typeof output === "object" && output ? output : { value: output }), __attempts: attempts },
          error: errMsg,
          durationMs: Date.now() - tStart,
        });
        messages.push({
          role: "tool", tool_call_id: call.id,
          content: modelToolPayload(agent.id==='timothy'?localModelDates(idCorrected && llmPayload && typeof llmPayload==='object' && !Array.isArray(llmPayload) ? { ...(llmPayload as Record<string, unknown>), id_correction: 'A company_id mezőben lead-azonosító volt; a lead mentett cégazonosítójával olvastam.' } : llmPayload):llmPayload),
        });
      }

      // Ha minden tool-hívás approval-ra vár → szakítsuk meg a loopot.
      const allPending = result.tool_calls.every(
        (c: ToolCall) => pendingApprovals.some((p) => p.tool_call_id === c.id),
      );
      if (allPending && pendingApprovals.length) {
        await finishRun(adminClient, {
          runId, status: outcome.failed ? "error" : "ok",
          promptTokens: totalPrompt, completionTokens: totalCompletion, totalSteps: stepNo,
        });
        return {
          runId, agentId: agent.id, finalText: outcome.text(result.text, pendingApprovals.length > 0),
          pendingApprovals, steps: stepNo,
          usage: { prompt_tokens: totalPrompt, completion_tokens: totalCompletion },
          observedIds: [...observed], consultations,
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