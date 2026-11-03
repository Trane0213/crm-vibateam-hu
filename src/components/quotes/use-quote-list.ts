import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { quoteAmounts } from "@/lib/quotes/amounts";

export type QuoteListRow = {
  id: string; title: string | null; status: string | null; is_current: boolean | null; version: number | null;
  alternative_key: string | null; lead_id: string | null; project_id: string | null; quote_kind: string | null;
  responsible_user_id: string | null; sent_at: string | null; created_at: string | null;
  company_id: string | null; company_name: string | null; lead_summary: string | null; project_title: string | null;
  net: number | null; next_followup: string | null; searchText: string;
};

/** S7: az Ajánlatok lista és a riport közös adatforrása (RLS a hívó jogosultsága szerint). */
export function useQuoteList() {
  return useQuery({
    queryKey: ["quotes", "list-v2"],
    queryFn: async (): Promise<QuoteListRow[]> => {
      const raw: any[] = [];
      for (let from = 0; from < 10_000; from += 1000) {
        const { data, error } = await supabase.from("quotes")
          .select("id,title,status,is_current,version,alternative_key,lead_id,project_id,quote_kind,responsible_user_id,sent_at,created_at,total_amount,manual_net_amount,tax_percent,quote_items(count),leads(company_id,summary),projects(title,company_id)")
          .order("created_at", { ascending: false }).order("id").range(from, from + 999);
        if (error) throw error;
        raw.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const ids = raw.map((r) => r.id);
      const next = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error } = await supabase.from("followups").select("quote_id,due_date")
          .in("quote_id", ids.slice(i, i + 200)).eq("completed", false);
        if (error) throw error;
        for (const f of data ?? []) if (f.quote_id && f.due_date) next.set(f.quote_id, f.due_date);
      }
      const companyIds = Array.from(new Set(raw.map((r) => r.leads?.company_id ?? r.projects?.company_id).filter(Boolean)));
      const names = new Map<string, string>();
      for (let i = 0; i < companyIds.length; i += 200) {
        const { data, error } = await supabase.from("companies").select("id,name").in("id", companyIds.slice(i, i + 200));
        if (error) throw error;
        for (const c of data ?? []) names.set(c.id, c.name);
      }
      return raw.map((r) => {
        const company_id = r.leads?.company_id ?? r.projects?.company_id ?? null;
        const itemCount = Number(r.quote_items?.[0]?.count ?? 0);
        const net = quoteAmounts({ itemCount, totalAmount: r.total_amount, manualNetAmount: r.manual_net_amount, taxPercent: r.tax_percent }).net;
        const company_name = company_id ? names.get(company_id) ?? null : null;
        return {
          id: r.id, title: r.title, status: r.status, is_current: r.is_current, version: r.version, alternative_key: r.alternative_key,
          lead_id: r.lead_id, project_id: r.project_id, quote_kind: r.quote_kind, responsible_user_id: r.responsible_user_id,
          sent_at: r.sent_at, created_at: r.created_at, company_id, company_name,
          lead_summary: r.leads?.summary ?? null, project_title: r.projects?.title ?? null, net,
          next_followup: next.get(r.id) ?? null,
          searchText: [r.title, company_name, r.leads?.summary, r.projects?.title, r.id].filter(Boolean).join(" "),
        };
      });
    },
  });
}
