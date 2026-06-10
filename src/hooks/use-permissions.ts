import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRole, type RoleSlug } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";

/**
 * Lekéri a bejelentkezett felhasználó szerepkörét a `users_profile` táblából.
 * Ha a tábla / oszlop nem létezik vagy nincs profil → "owner" fallback,
 * hogy a rendszer használható maradjon (TODO: profil-seed indításkor).
 */
export function usePermissions() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["users_profile", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) {
        console.warn("[usePermissions] users_profile lekérdezés sikertelen:", error.message);
        return null;
      }
      return data as Record<string, any> | null;
    },
  });

  const raw = q.data?.role ?? q.data?.user_role ?? null;
  const role: RoleSlug = normalizeRole(raw);
  return {
    role,
    profile: q.data ?? null,
    isLoading: loading || q.isLoading,
    hasRole: (...roles: RoleSlug[]) => roles.includes(role),
  };
}