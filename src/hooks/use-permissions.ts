import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeRole, type RoleSlug } from "@/lib/permissions";
import { useAuth } from "@/hooks/use-auth";

/**
 * Lekéri a bejelentkezett felhasználó profilját és szerepkörét.
 * A valós séma: users_profile.auth_user_id → auth.users.id, role_id → roles.id (név oszlop a roles-on).
 * Ha nincs profil sor → "owner" fallback (a useEnsureProfile hook hoz létre egyet).
 */
export function usePermissions() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["users_profile", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*, roles ( id, name )")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      if (error) {
        console.warn("[usePermissions] users_profile lekérdezés sikertelen:", error.message);
        return null;
      }
      return data as Record<string, any> | null;
    },
  });

  const raw = q.data?.roles?.name ?? q.data?.role ?? null;
  const role: RoleSlug = normalizeRole(raw);
  return {
    role,
    profile: q.data ?? null,
    isLoading: loading || q.isLoading,
    hasRole: (...roles: RoleSlug[]) => roles.includes(role),
  };
}