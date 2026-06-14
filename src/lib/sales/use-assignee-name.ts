import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * `users_profile` (auth_user_id → full_name/email) lookup map.
 * Cached for 5 perc, RLS engedi az authenticated szerepköröknek.
 */
export function useAssigneeLookup() {
  const q = useQuery({
    queryKey: ["users_profile", "assignee-lookup"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("auth_user_id, full_name, email")
        .not("auth_user_id", "is", null);
      if (error) throw error;
      const map = new Map<string, string>();
      for (const r of (data ?? []) as any[]) {
        map.set(r.auth_user_id, (r.full_name ?? r.email ?? "").trim() || r.auth_user_id);
      }
      return map;
    },
  });
  return (id: string | null | undefined): string => {
    if (!id) return "Nincs kiosztva";
    return q.data?.get(id) ?? `#${id.slice(0, 8)}`;
  };
}
