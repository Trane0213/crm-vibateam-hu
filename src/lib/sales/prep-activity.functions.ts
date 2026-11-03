import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { prepActivityInput, prepActivityPayload } from "./prep-activity";

export const recordPrepActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => prepActivityInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: lead, error: readError } = await context.supabase.from("leads")
      .select("id,company_id,status,pipeline_entered_at").eq("id", data.leadId).single();
    if (readError) throw readError;
    if (!lead || lead.pipeline_entered_at || lead.status === "lost" || lead.status === "won") {
      throw new Error("Az ügy már nem az előkészítő szakaszban van.");
    }
    // Same existing followups RLS and owner-assignment trigger as the previous UI write.
    const payload = prepActivityPayload(data, lead.company_id, new Date());
    const { data: saved, error } = await context.supabase.from("followups")
      .insert(payload).select("id,due_date,created_at,completed,followup_type").single();
    if (error) throw error;
    if (!saved || saved.due_date !== saved.created_at || !saved.completed) {
      throw new Error("Az aktivitás mentése nem igazolható.");
    }
    return saved;
  });