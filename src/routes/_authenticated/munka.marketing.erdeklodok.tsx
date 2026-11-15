import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { listQuoteRequests } from "@/lib/quote-requests.functions";
import { receivedAt, isTestRequest } from "@/lib/quote-request-display";
import { WsPageHeader } from "@/components/workspace-v2/parts";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { formatDateTime } from "@/lib/format";
import { wsHead } from "@/lib/workspace-v2/head";

export const Route = createFileRoute("/_authenticated/munka/marketing/erdeklodok")({
  head: () => wsHead("Érdeklődők", "Weboldali érdeklődések feldolgozása és átadás a Salesnek."),
  component: InboundPage,
});

/** Nyers webes érdeklődés nem Sales-ügy: a felvétel és átadás a meglévő, ellenőrzött lépéseken történik. */
function InboundPage() {
  const list = useServerFn(listQuoteRequests);
  const q = useQuery({ queryKey: ["quote-requests", "v2"], queryFn: () => list(), staleTime: 60_000 });
  const [search, setSearch] = useState("");
  const [hideTest, setHideTest] = useState(true);
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data ?? []).filter((r) => (!hideTest || !isTestRequest(r)) && (!s || [r.name, r.email, r.company_name, r.phone, r.message].filter(Boolean).join(" ").toLowerCase().includes(s)));
  }, [q.data, search, hideTest]);

  return (
    <>
      <WsPageHeader title="Érdeklődők" subtitle="Weboldalról beérkezett ajánlatkérések" />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés: név, cég, e-mail…" className="pl-8" aria-label="Érdeklődő keresése" />
        </div>
        <Button size="sm" variant={hideTest ? "default" : "outline"} aria-pressed={hideTest} onClick={() => setHideTest((v) => !v)}>TESZT elrejtése</Button>
      </div>
      <section className="rounded-xl border bg-card p-2 shadow-[var(--shadow-card)]">
        {q.isLoading ? <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betöltés…</div>
          : q.isError ? <p role="alert" className="p-4 text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Nem tölthető be."}</p>
          : rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Nincs érdeklődő.</p>
          : (
            <ul className="divide-y">
              {rows.slice(0, 200).map((r) => (
                <li key={r.id}>
                  <Link to="/munka/marketing/erdeklodo/$id" params={{ id: r.id }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded px-2 py-2.5 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{r.company_name || r.name || "Névtelen érdeklődő"}</div>
                      <div className="truncate text-xs text-muted-foreground">{[r.project_type, r.form_type, formatDateTime(receivedAt(r))].filter(Boolean).join(" · ")}</div>
                    </div>
                    {isTestRequest(r) ? <StatusBadge status="planned" label="TESZT" /> : <StatusBadge status="review" label="Feldolgozandó" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </>
  );
}
