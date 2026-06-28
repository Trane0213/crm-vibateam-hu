/**
 * AI OS — Summary Dialog server function.
 *
 * Az `AiSummaryDialog` komponens hívja. A frontend összegyűjt egy CRM kontextust
 * (string) és egy promptot (kérdést) — mi pedig George agentet futtatjuk rajta.
 *
 * Nem érinti a régi `src/lib/ai/*` réteget.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

type Input = { context: string; prompt: string };

function validate(input: unknown): Input {
  const i = input as Input;
  if (!i || typeof i.prompt !== "string" || !i.prompt.trim()) {
    throw new Error("prompt kötelező");
  }
  return {
    context: typeof i.context === "string" ? i.context : "",
    prompt: i.prompt,
  };
}

export const runAiSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
  .handler(async ({ data, context }) => {
    const { ensureBootstrapped } = await import("./bootstrap.server");
    const { runAgent } = await import("./runtime.server");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    ensureBootstrapped();

    const admin = getAdminClient();
    const userPrompt = [
      data.prompt.trim(),
      ``,
      `[CRM KONTEXTUS]`,
      data.context || "(nincs kontextus)",
    ].join("\n");

    const result = await runAgent(context.supabase, admin, {
      agentId: "crm_summary",
      userId: context.userId,
      userRole: null,
      threadId: null,
      history: [{ role: "user", content: userPrompt }],
    });

    return { text: result.finalText, runId: result.runId };
  });