/**
 * Egy projekt átadási forrásainak olvasása a hívó jogosultságával (RLS) —
 * a lead munkafelület „Projektátadás” kártyájához. Csak SELECT, darabszámok;
 * egy hibás forrás „NINCS ADAT”, nem „rendben”.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { handoffSummary, type HandoffProject, type HandoffSummary } from "@/lib/handoff/sales-pm-handoff";

export type ProjectHandoffRow = HandoffProject & { title: string | null };
export const HANDOFF_PROJECT_COLS = "id,title,status,lead_id,address,deadline,project_manager_user_id,handoff_payload,handoff_at";

async function countOrNull(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const r = await q;
  return r.error ? null : r.count ?? 0;
}

export function useProjectHandoff(project: ProjectHandoffRow | null | undefined) {
  return useQuery({
    queryKey: ["projects", "handoff-sources", project?.id],
    enabled: !!project?.id,
    queryFn: async (): Promise<HandoffSummary> => {
      const id = project!.id;
      const head = { count: "exact" as const, head: true };
      const [quoteCount, acceptedCount, contactCount, contractDocCount, taskCount] = await Promise.all([
        countOrNull(supabase.from("quotes").select("id", head).eq("project_id", id)),
        countOrNull(supabase.from("quotes").select("id", head).eq("project_id", id).eq("status", "accepted")),
        countOrNull(supabase.from("project_contacts").select("id", head).eq("project_id", id)),
        countOrNull(supabase.from("project_documents").select("id", head).eq("project_id", id).eq("document_type", "contract")),
        countOrNull(supabase.from("tasks").select("id", head).eq("project_id", id)),
      ]);
      return handoffSummary({ project: project!, quoteCount, acceptedCount, contactCount, contractDocCount, taskCount });
    },
  });
}
