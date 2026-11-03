import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { budapestDayBounds } from "@/lib/owner-kpis";
import { loadDailyWork } from "./load-daily-work";

export function useDailyWork() {
  const { user } = useAuth();
  const { role, profile, isLoading } = usePermissions();
  const team = role === "owner";
  const now = new Date();
  return useQuery({
    queryKey: ["leads", "daily-work", user?.id, team, budapestDayBounds(now).start],
    enabled: !!user?.id && !isLoading && (role === "sales" || team),
    refetchInterval: 60_000,
    queryFn: async () => {
      if (!user) throw new Error("Bejelentkezés szükséges.");
      if (!profile?.roles?.name) throw new Error("A felhasználói profil és szerepkör betöltése sikertelen.");
      return loadDailyWork(supabase, user.id, team);
    },
  });
}