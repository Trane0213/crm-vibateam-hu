import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { ALWAYS_VISIBLE_AGENT_IDS } from "@/lib/ai/agent-registry";

/**
 * A bejelentkezett felhasználó saját role_id-jéhez tartozó látható agent_id-k.
 *
 * Fallback szabályok:
 *  - Ha még nincs profil / role_id → csak az `alwaysVisible` agentek (George).
 *  - Ha a táblát nem lehet olvasni → csak az `alwaysVisible` agentek.
 *  - Ha owner → minden registry-beli agent látható (admin szuper-jogosultság).
 */
export function useVisibleAgents() {
  const { profile, role, isLoading } = usePermissions();
  const roleId: string | null = profile?.role_id ?? null;

  const q = useQuery({
    queryKey: ["agent_role_access", "visible", roleId],
    enabled: !!roleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_role_access")
        .select("agent_id, can_view")
        .eq("role_id", roleId)
        .eq("can_view", true);
      if (error) {
        console.warn("[useVisibleAgents] lekérdezés sikertelen:", error.message);
        return [] as { agent_id: string }[];
      }
      return data ?? [];
    },
  });

  const visible = new Set<string>(ALWAYS_VISIBLE_AGENT_IDS);
  for (const row of q.data ?? []) visible.add(row.agent_id);

  return {
    visibleAgentIds: visible,
    isOwner: role === "owner",
    isLoading: isLoading || q.isLoading,
  };
}