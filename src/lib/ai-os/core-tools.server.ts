/**
 * AI OS — beépített core toolok regisztrálása.
 *
 * Ezek a toolok CRM-függetlenek:
 *   - handoff_to        : George átadja a kérdést egy specialistának
 *   - memory_write      : objektum-alapú memóriába írás (jóváhagyás kötelező)
 *   - memory_read       : adott objektum memóriadarabjainak lekérése
 */

import { registerTool } from "./tool-registry";
import { listHandoffTargets } from "./agents";

export function registerCoreTools() {
  const handoffTargets = listHandoffTargets();
  registerTool(
    {
      name: "handoff_to",
      description:
        "Deklarálja, hogy a kérdést egy specialista agentnek kell átadni. " +
        "Csak az orchestrator (George) hívhatja. A tool nem futtat le másik agentet — " +
        "a runtime naplózza mint `handoff` lépést, és George a saját válaszában " +
        "foglalja össze a specialistának feltett kérdést a felhasználó felé.",
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
          question: { type: "string", description: "A specialistának feltett kérdés." },
        },
        required: ["agent", "reason", "question"],
      },
    },
    async (args, ctx) => {
      // AI-1.5: kizárólag deklaratív. A tényleges chained-run később, külön
      // sprintben (nem stabilizációs feladat). Itt szerveroldalon még egyszer
      // validáljuk a célt — a runtime access-check nem látja a tool argumentumát.
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
      return {
        handoff_requested: true,
        from: ctx.agentId,
        agent: target,
        reason: String(args.reason ?? ""),
        question: String(args.question ?? ""),
      };
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
        "Új memória-darab írása egy objektumhoz. Felhasználói jóváhagyást igényel.",
      domain: "core.memory",
      needs_approval: true,
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