/**
 * AI OS — beépített core toolok regisztrálása.
 *
 * Ezek a toolok CRM-függetlenek:
 *   - handoff_to        : George átadja a kérdést egy specialistának
 *   - memory_write      : objektum-alapú memóriába írás (jóváhagyás kötelező)
 *   - memory_read       : adott objektum memóriadarabjainak lekérése
 */

import { registerTool } from "./tool-registry";

export function registerCoreTools() {
  registerTool(
    {
      name: "handoff_to",
      description:
        "Átadja a kérdést egy specialista agentnek. Csak az orchestrator (George) használhatja.",
      domain: "core.handoff",
      allowed_agents: ["george"],
      parameters: {
        type: "object",
        properties: {
          agent: { type: "string", enum: ["scarlet", "timothy", "boss"] },
          reason: { type: "string", description: "Miért adod át." },
          question: { type: "string", description: "A specialistának feltett kérdés." },
        },
        required: ["agent", "reason", "question"],
      },
    },
    async (args) => {
      // A handoff végrehajtása a runtime felső rétegében történik (külön call).
      // Itt csak jelezzük, hogy az LLM a handoff-ot kérte.
      return {
        handoff_requested: true,
        agent: args.agent,
        reason: args.reason,
        question: args.question,
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
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { data, error } = await admin
        .from("ai_memory")
        .select("key,value,scope,source,updated_at")
        .eq("subject_type", String(args.subject_type))
        .eq("subject_id", String(args.subject_id))
        .or(`scope.eq.shared,created_by.eq.${ctx.userId}`)
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
      const { createClient } = await import("@supabase/supabase-js");
      const admin = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      const { data, error } = await admin
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