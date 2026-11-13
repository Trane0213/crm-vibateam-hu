/**
 * AI OS — beépített core toolok regisztrálása.
 *
 * Ezek a toolok CRM-függetlenek:
 *   - handoff_to        : George ténylegesen lefuttatja a specialistát (olvasó konzultáció)
 *   - memory_write      : objektum-alapú memóriába írás (jóváhagyás kötelező)
 *   - memory_read       : adott objektum memóriadarabjainak lekérése
 */

import { registerTool } from "./tool-registry";
import { listHandoffTargets } from "./agents";
import { DAILY_CACHE_PATTERN } from './daily-sales';

export function registerCoreTools() {
  const handoffTargets = listHandoffTargets();
  registerTool(
    {
      name: "handoff_to",
      description:
        "Szakértői konzultáció: lefuttatja a megnevezett specialistát a felhasználó jogosultságával, " +
        "kizárólag olvasó eszközökkel, és strukturált jelentést ad vissza (összefoglaló, forrásokkal " +
        "alátámasztott megállapítások, javasolt lépések, nyitott kérdések). Csak az orchestrator (George) hívhatja. " +
        "A specialista semmit nem módosít; írási művelethez a felhasználónak külön kell kérnie.",
      domain: "core.handoff",
      allowed_agents: ["george"],
      parameters: {
        type: "object",
        properties: {
          agent: {
            type: "string",
            enum: handoffTargets,
            description: "A célagent id-ja. Csak nem-orchestrator agent lehet.",
          },
          reason: { type: "string", description: "Miért adod át." },
          question: { type: "string", description: "A specialistának feltett, önmagában érthető kérdés (minden szükséges azonosítóval)." },
        },
        required: ["agent", "reason", "question"],
      },
    },
    async (args, ctx) => {
      // AI OS 2.0/3: tényleges, egyszintű chained-run. A célt szerveroldalon újra validáljuk —
      // a runtime access-check nem látja a tool argumentumát.
      const target = String(args.agent ?? "");
      const validTargets = listHandoffTargets();
      if (!validTargets.includes(target)) {
        return {
          error: `Érvénytelen handoff célpont: "${target}". Engedélyezett: ${validTargets.join(", ")}.`,
        };
      }
      if (target === ctx.agentId) {
        return { error: "Handoff önmagára nem megengedett." };
      }
      const question = String(args.question ?? "").trim().slice(0, 6000);
      const reason = String(args.reason ?? "").trim().slice(0, 500);
      if (!question) return { error: "Üres kérdés nem adható át." };
      const base = { handoff_requested: true, from: ctx.agentId, agent: target, reason, question };
      try {
        // A szerepkörönkénti asszisztens-hozzáférés (agent_role_access, Michael = Owner) konzultációnál is érvényes.
        const { authorizeAgent } = await import("./approval.server");
        try { await authorizeAgent(ctx.supabaseUser, ctx.userId, target); }
        catch { return { ...base, executed: false, error: `A(z) ${target} szakértő a felhasználó szerepköréhez nem érhető el; a kérdést saját eszközeiddel vizsgáld, vagy jelezd a korlátot.` }; }
        const { runAgent } = await import("./runtime.server");
        const { parseSpecialistReport, verifiedSourceIds } = await import("./consult");
        const child = await runAgent(ctx.supabaseUser, ctx.supabaseAdmin, {
          agentId: target,
          userId: ctx.userId,
          userRole: ctx.userRole ?? null,
          threadId: ctx.threadId,
          history: [{ role: "user", content: `George kérdése (indok: ${reason || "—"}):\n${question}` }],
          consult: { fromAgent: ctx.agentId, parentRunId: ctx.runId },
        });
        const report = { ...parseSpecialistReport(target, child.finalText, new Set(child.observedIds)), run_id: child.runId };
        return { ...base, executed: true, child_run_id: child.runId, report, verified_source_ids: verifiedSourceIds(report) };
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        const credit = /429|insufficient_quota|credit/i.test(m);
        return {
          ...base,
          executed: false,
          error: credit
            ? "A szakértő nem futott le: az OpenAI-fiók egyenlege elfogyott. Ne állíts semmit a szakértő nevében."
            : "A szakértői konzultáció most nem futott le. Ne állíts semmit a szakértő nevében.",
        };
      }
    },
  );

  registerTool(
    {
      name: "memory_read",
      description:
        "Egy objektumhoz (cég, lead, projekt, kapcsolat, user) tartozó memória-darabok lekérése.",
      domain: "core.memory",
      parameters: {
        type: "object",
        properties: {
          subject_type: { type: "string", description: "user | company | contact | lead | project | conversation" },
          subject_id: { type: "string", description: "Az objektum UUID-ja." },
        },
        required: ["subject_type", "subject_id"],
      },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("ai_memory")
        .select("key,value,scope,source,updated_at")
        .not('key','like',DAILY_CACHE_PATTERN)
        .eq("subject_type", String(args.subject_type))
        .eq("subject_id", String(args.subject_id))
        .order("updated_at", { ascending: false })
        .limit(50);
      if (error) return { error: error.message };
      return { count: data?.length ?? 0, items: data ?? [] };
    },
  );

  registerTool(
    {
      name: "memory_write",
      description:
        "Új memória-darab írása egy objektumhoz. Felhasználói jóváhagyást igényel. " +
        "Csak azok az agentek használhatják, akik hosszú távú tényeket rögzítenek " +
        "(orchestrator, projektvezető, Google Ads specialista).",
      domain: "core.memory",
      needs_approval: true,
      // AI-1.7: memóriaírás szűkítése a valós írókra. A többi agent (Scarlet,
      // Timothy) továbbra is olvashat (`memory_read`), de nem hozhat létre új
      // memória-darabot — ezzel megelőzzük a tudás-elmosódást és az ütköző
      // kulcs-értékek felhalmozódását.
      allowed_agents: ["george", "boss", "michael"],
      parameters: {
        type: "object",
        properties: {
          subject_type: { type: "string" },
          subject_id: { type: "string" },
          key: { type: "string" },
          value: { type: "object" },
          scope: { type: "string", enum: ["shared", "private"], default: "shared" },
        },
        required: ["subject_type", "subject_id", "key", "value"],
      },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("ai_memory")
        .upsert(
          {
            subject_type: String(args.subject_type),
            subject_id: String(args.subject_id),
            key: String(args.key),
            value: args.value as object,
            scope: (args.scope as "shared" | "private") ?? "shared",
            source: `agent:${ctx.agentId}`,
            created_by: ctx.userId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "subject_type,subject_id,scope,key,created_by" },
        )
        .select()
        .single();
      if (error) return { error: error.message };
      return { ok: true, id: (data as { id: string }).id };
    },
  );
}