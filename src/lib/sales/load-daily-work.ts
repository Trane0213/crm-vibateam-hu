import type { SupabaseClient } from "@supabase/supabase-js";
import { dailyWork, salesOverview, type DailyLead, type DailyQuote } from "./daily-work";

export async function allDailyRows<T>(query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await query(start, start + 999);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("A napi adatok nem érhetők el.");
    const page = data as T[];
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

export async function loadDailyWork(client: SupabaseClient, userId: string, team: boolean, now = new Date()) {
      const leads = await allDailyRows<DailyLead>((from, to) => {
        let q = client.from("leads").select("id,assigned_to,status,summary,source,company_id,contact_id,created_at,next_step_type,next_step_due_at,pipeline_entered_at")
          .not("status", "in", "(won,lost)").order("id");
        if (!team) q = q.eq("assigned_to", userId);
        return q.range(from, to);
      });
      const quotes: DailyQuote[] = [];
      // Bounded ID batches; all versions are fetched but only current non-drafts count.
      for (let i = 0; i < leads.length; i += 100) {
        quotes.push(...await allDailyRows<DailyQuote>((f, t) => client.from("quotes")
          .select("id,lead_id,title,status,is_current").in("lead_id", leads.slice(i, i + 100).map(l => l.id)).order("id").range(f, t)));
      }
      // Sales-only overview supplements the same scoped query; owner/pulse rules are unchanged.
      let overview;
      if (!team) {
        const { count, error } = await client.from("leads").select("id", { count: "exact", head: true })
          .eq("assigned_to", userId).eq("status", "won");
        if (error) throw error;
        if (count === null) throw new Error("A megnyert ügyek száma nem érhető el.");
        overview = salesOverview(leads, quotes, userId, count);
        const companyIds = [...new Set(leads.flatMap(l => l.company_id ? [l.company_id] : []))];
        const names = new Map<string, string>();
        for (let i = 0; i < companyIds.length; i += 100) {
          const rows = await allDailyRows<{ id: string; name: string }>((f, t) => client.from("companies")
            .select("id,name").in("id", companyIds.slice(i, i + 100)).order("id").range(f, t));
          for (const row of rows) names.set(row.id, row.name);
        }
        for (const l of leads) l.company_name = l.company_id ? names.get(l.company_id) ?? null : null;
      }
      return { ...dailyWork(leads, quotes, userId, team, now), overview };
}
