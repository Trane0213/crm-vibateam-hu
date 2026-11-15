import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { WsPageHeader } from "@/components/workspace-v2/parts";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { MARKETING_STATUS_LABEL, readMarketingMeta } from "@/lib/marketing-status";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { wsHead } from "@/lib/workspace-v2/head";

const PAGE = 50;

export const Route = createFileRoute("/_authenticated/munka/ugyfelek")({
  head: () => wsHead("Ügyfelek", "Cégek és magánszemélyek keresése, egységes ügyféladatlap."),
  component: CustomersPage,
});

function CustomersPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const term = search.trim();
  const q = useQuery({
    queryKey: ["companies", "v2-list", term, page],
    queryFn: async () => {
      let query = supabase.from("companies").select("id,name,company_type,notes,marketing_status,marketing_status_changed_at,marketing_status_changed_by,marketing_status_source,marketing_handoff_lead_id", { count: "exact" })
        .order("name").order("id").range(page * PAGE, page * PAGE + PAGE - 1);
      if (term) query = query.ilike("name", `%${term.replace(/[%_]/g, "")}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data ?? [], count: count ?? null };
    },
  });
  const total = q.data?.count ?? null;
  return (
    <>
      <WsPageHeader title="Ügyfelek" subtitle={total == null ? "Cégek és magánszemélyek" : `${total} találat a jogosultságod szerint`} />
      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Keresés név szerint…" className="pl-8" aria-label="Ügyfél keresése" />
      </div>
      <section className="rounded-xl border bg-card p-2 shadow-[var(--shadow-card)]">
        {q.isLoading ? <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betöltés…</div>
          : q.isError ? <p role="alert" className="p-4 text-sm text-destructive">Az ügyfelek nem tölthetők be: {humanizeSupabaseError(q.error)}</p>
          : q.data!.rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nincs találat.</p>
          : (
            <ul className="divide-y">
              {q.data!.rows.map((c) => {
                const meta = readMarketingMeta(c.notes, c);
                return (
                  <li key={c.id}>
                    <Link to="/munka/ugyfel/$id" params={{ id: c.id }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-2 py-2.5 hover:bg-muted/40">
                      <span className="min-w-0 truncate text-sm font-medium">{c.name}</span>
                      <span className="flex shrink-0 gap-2 text-xs text-muted-foreground">
                        {c.company_type && <span>{COMPANY_TYPE_LABEL[c.company_type] ?? c.company_type}</span>}
                        {meta.status && <span className="hidden sm:inline">· {MARKETING_STATUS_LABEL[meta.status]}</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
      </section>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Előző</Button>
        <span className="text-xs text-muted-foreground">{page + 1}. oldal</span>
        <Button size="sm" variant="outline" disabled={total == null || (page + 1) * PAGE >= total} onClick={() => setPage((p) => p + 1)}>Következő</Button>
      </div>
    </>
  );
}
