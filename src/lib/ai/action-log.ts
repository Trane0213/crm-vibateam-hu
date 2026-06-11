/**
 * AI Action Log helper — Sprint 3 / Fázis A.
 * Minden AI által javasolt / végrehajtott művelet auditálva van.
 * Kliens oldalról ír a public.ai_action_log táblába (RLS: user_id = auth.uid()).
 */
import { supabase } from "@/integrations/supabase/client";

export type AgentType = "marvin" | "sales" | "pm";

export type ActionType =
  | "navigate"
  | "create_lead"
  | "create_followup"
  | "create_task"
  | "create_contact"
  | "update_lead"
  | "update_followup"
  | "suggest_call_list"
  | "suggest_followup"
  | "detect_lead_from_email"
  | "company_research"
  | "other";

export type LogInsert = {
  agent_type: AgentType;
  action_type: ActionType;
  payload?: Record<string, any>;
  approved?: boolean;
  executed?: boolean;
  result?: Record<string, any> | null;
  error_message?: string | null;
};

/** Új sor beszúrása. Visszaadja a létrejött rekord id-ját (vagy null-t hiba esetén). */
export async function logAiAction(entry: LogInsert): Promise<string | null> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const user_id = userData.user?.id;
    if (!user_id) return null;
    const { data, error } = await supabase
      .from("ai_action_log" as any)
      .insert({
        user_id,
        agent_type: entry.agent_type,
        action_type: entry.action_type,
        payload: entry.payload ?? {},
        approved: entry.approved ?? false,
        executed: entry.executed ?? false,
        result: entry.result ?? null,
        error_message: entry.error_message ?? null,
      })
      .select("id")
      .single();
    if (error) {
      console.warn("[ai-log] insert error:", error.message);
      return null;
    }
    return (data as any)?.id ?? null;
  } catch (e: any) {
    console.warn("[ai-log] exception:", e?.message);
    return null;
  }
}

/** Meglévő sor frissítése (jellemzően approved/executed flag-re). */
export async function updateAiAction(
  id: string,
  patch: { approved?: boolean; executed?: boolean; result?: Record<string, any> | null; error_message?: string | null },
): Promise<void> {
  try {
    const upd: Record<string, any> = { ...patch };
    if (patch.executed) upd.executed_at = new Date().toISOString();
    const { error } = await supabase
      .from("ai_action_log" as any)
      .update(upd)
      .eq("id", id);
    if (error) console.warn("[ai-log] update error:", error.message);
  } catch (e: any) {
    console.warn("[ai-log] update exception:", e?.message);
  }
}