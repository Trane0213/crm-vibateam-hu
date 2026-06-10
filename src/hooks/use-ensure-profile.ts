import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * Biztosítja, hogy a bejelentkezett auth.users.id-ra létezzen sor a `users_profile`-ban.
 * Idempotens: minden bejelentkezésnél egyszer fut. Ha nincs sor, létrehoz egyet az
 * email-cím alapján, és megpróbál egy „owner" / „Tulajdonos" szerepkört kiosztani,
 * ha létezik. Hibákat csak logol, nem dob — sose blokkolja a UI-t.
 */
export function useEnsureProfile() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (loading || !user?.id) return;
    if (ranFor.current === user.id) return;
    ranFor.current = user.id;

    (async () => {
      try {
        const { data: existing } = await supabase
          .from("users_profile")
          .select("id")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (existing?.id) return;

        let roleId: string | null = null;
        const { data: roles } = await supabase.from("roles").select("id, name");
        if (roles && roles.length) {
          const owner = roles.find((r: any) =>
            /tulajdonos|owner|admin/i.test(String(r.name ?? "")),
          );
          roleId = (owner ?? roles[0])?.id ?? null;
        }

        const payload: Record<string, any> = {
          auth_user_id: user.id,
          email: user.email ?? null,
          full_name:
            (user.user_metadata as any)?.full_name ??
            (user.user_metadata as any)?.name ??
            (user.email ? user.email.split("@")[0] : null),
          active: true,
        };
        if (roleId) payload.role_id = roleId;

        const { error } = await supabase.from("users_profile").insert(payload);
        if (error) {
          console.warn("[useEnsureProfile] profil létrehozás sikertelen:", error.message);
          return;
        }
        qc.invalidateQueries({ queryKey: ["users_profile"] });
      } catch (e: any) {
        console.warn("[useEnsureProfile] kivétel:", e?.message ?? e);
      }
    })();
  }, [user?.id, loading, qc, user]);
}