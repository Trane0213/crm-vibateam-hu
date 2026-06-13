import { supabase } from "@/integrations/supabase/client";

export type ActivityAction =
  | "create"
  | "update"
  | "delete"
  | "status_change"
  | "upload"
  | "download";

/**
 * Best-effort audit napló az élő `activities` táblába.
 * Soha nem dob hibát — ha nincs jogosultság, csak warningot ír a konzolra.
 *
 * Az `activities` séma: { id, user_id, agent_id, action, details(jsonb), created_at }.
 * Mi a `details` jsonb-be tesszük az entity_type / entity_id / payload mezőket,
 * mert a táblában nincs külön oszlopa ezeknek.
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
      action,
      details: {
        entity_type,
        entity_id: entity_id ?? null,
        payload: payload ?? null,
      },
    };
    if (user_id) row.user_id = user_id;
    const { error } = await supabase.from("activities").insert(row);
    if (error) console.warn("[activities] insert sikertelen:", error.message);
  } catch (e: any) {
    console.warn("[activities] kivétel:", e?.message ?? e);
  }
}

export type ActivityEntry = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: ActivityAction;
  details: {
    entity_type?: string | null;
    entity_id?: string | null;
    payload?: Record<string, any> | null;
  } | null;
};

/**
 * Egy projekt teljes idővonalának lekérése az `activities` táblából.
 * Mivel az entity_type / entity_id / payload a `details` jsonb-ben él,
 * a szűrés is oda mutat (`details->>...`).
 */
export async function fetchProjectActivity(projectId: string, limit = 200): Promise<ActivityEntry[]> {
  try {
    const { data, error } = await supabase
      .from("activities")
      .select("*")
      .or(
        `and(details->>entity_type.eq.projects,details->>entity_id.eq.${projectId}),details->payload->>project_id.eq.${projectId}`,
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) {
      console.warn("[activities] fetch sikertelen:", error.message);
      return [];
    }
    return (data ?? []) as ActivityEntry[];
  } catch (e: any) {
    console.warn("[activities] kivétel:", e?.message ?? e);
    return [];
  }
}