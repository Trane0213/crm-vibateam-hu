import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "upload"
  | "download";

/**
 * Best-effort audit napló. Soha nem dob hibát — ha a tábla nem létezik
 * vagy nincs jogosultság, csak warningot ír a konzolra.
 *
 * A `payload` jsonb-be kerül, érdemes csak rövid összefoglalót adni
 * (status mező, kulcsmezők változása, törölt rekord neve).
 */
export async function logActivity(
  entity_type: string,
  action: ActivityAction,
  entity_id?: string | null,
  payload?: Record<string, any> | null,
): Promise<void> {
  try {
    const { data: u } = await supabase.auth.getUser();
    const user_id = u.user?.id ?? null;
    const row: Record<string, any> = {
      entity_type,
      entity_id: entity_id ?? null,
      action,
      payload: payload ?? null,
    };
    if (user_id) row.user_id = user_id;
    const { error } = await supabase.from("activity_log").insert(row);
    if (error) console.warn("[activity_log] insert sikertelen:", error.message);
  } catch (e: any) {
    console.warn("[activity_log] kivétel:", e?.message ?? e);
  }
}

export type ActivityEntry = {
  id: string;
  created_at: string;
  user_id: string | null;
  entity_type: string;
  entity_id: string | null;
  action: ActivityAction;
  payload: Record<string, any> | null;
};

/**
 * Egy projekt teljes idővonalának lekérése. A projekt saját rekordja +
 * minden hozzá tartozó entitás (quotes/tasks/emails/...) ami az
 * activity_log payloadjában project_id-t tartalmaz.
 */
export async function fetchProjectActivity(projectId: string, limit = 200): Promise<ActivityEntry[]> {
  try {
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .or(`and(entity_type.eq.projects,entity_id.eq.${projectId}),payload->>project_id.eq.${projectId}`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[activity_log] fetch sikertelen:", error.message);
      return [];
    }
    return (data ?? []) as ActivityEntry[];
  } catch (e: any) {
    console.warn("[activity_log] kivétel:", e?.message ?? e);
    return [];
  }
}