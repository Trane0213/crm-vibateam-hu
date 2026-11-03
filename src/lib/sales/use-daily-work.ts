import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { budapestDayBounds } from "@/lib/owner-kpis";
import { dailyWork, salesOverview, type DailyLead, type DailyQuote } from "./daily-work";

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await query(start, start + 999);
    if (error) throw error;
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

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
      const leads = await allRows<DailyLead>((from, to) => {
        let q = supabase.from("leads").select("id,assigned_to,status,summary,source,company_id,contact_id,created_at,next_step_type,next_step_due_at,pipeline_entered_at")
          .not("status", "in", "(won,lost)").order("id");
        if (!team) q = q.eq("assigned_to", user.id);
        return q.range(from, to);
      });
      const quotes: DailyQuote[] = [];
      // Bounded ID batches; all versions are fetched but only current non-drafts count.
      for (let i = 0; i < leads.length; i += 100) {
        quotes.push(...await allRows<DailyQuote>((f, t) => supabase.from("quotes")
          .select("id,lead_id,title,status,is_current").in("lead_id", leads.slice(i, i + 100).map(l => l.id)).order("id").range(f, t)));
      }
      // Sales-only overview supplements the same scoped query; owner/pulse rules are unchanged.
      let overview;
      if (!team) {
        const { count, error } = await supabase.from("leads").select("id", { count: "exact", head: true })
          .eq("assigned_to", user.id).eq("status", "won");
        if (error) throw error;
        if (count === null) throw new Error("A megnyert ügyek száma nem érhető el.");
        overview = salesOverview(leads, quotes, user.id, count);
        const companyIds = [...new Set(leads.flatMap(l => l.company_id ? [l.company_id] : []))];
        const names = new Map<string, string>();
        for (let i = 0; i < companyIds.length; i += 100) {
          const rows = await allRows<{ id: string; name: string }>((f, t) => supabase.from("companies")
            .select("id,name").in("id", companyIds.slice(i, i + 100)).order("id").range(f, t));
          for (const row of rows) names.set(row.id, row.name);
        }
        for (const l of leads) l.company_name = l.company_id ? names.get(l.company_id) ?? null : null;
      }
      return { ...dailyWork(leads, quotes, user.id, team, new Date()), overview };
    },
  });
}