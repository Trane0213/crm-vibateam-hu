import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, Phone, Sparkles, Building2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/contacts/$id")({
  component: ContactDetail,
});

function ContactDetail() {
  const { id } = Route.useParams();
  const companyLabel = useLookup("companies", "name");
  const q = useQuery({
    queryKey: ["contacts", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const calls = useListWhere<any>("phone_calls", "contact_id", id, { order: "created_at", ascending: false });
  const leads = useListWhere<any>("leads", "contact_id", id, { order: "created_at", ascending: false });

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Kapcsolattartó betöltése…</div>;
  if (q.error || !q.data) {
    return <div className="p-6"><EmptyState icon={UserPlus} title="Kapcsolattartó nem található" description={(q.error as any)?.message} /></div>;
  }
  const c = q.data;
  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Kapcsolattartó</div>
        <h1 className="mt-1 text-xl font-semibold">{c.name}</h1>
        <div className="mt-1 text-sm text-muted-foreground">
          {c.position ? `${c.position} · ` : ""}
          {c.company_id ? (
            <Link to="/customers/$id" params={{ id: c.company_id }} className="text-primary hover:underline">
              <Building2 className="mr-1 inline h-3.5 w-3.5" />{companyLabel(c.company_id)}
            </Link>
          ) : ""}
        </div>
      </div>
      <div className="grid gap-4 p-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Elérhetőség</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <Row label="E-mail" value={c.email ?? "—"} />
            <Row label="Telefon" value={c.phone ?? "—"} />
            <Row label="Beosztás" value={c.position ?? "—"} />
            <Row label="Létrejött" value={fmtDate(c.created_at)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Phone className="h-4 w-4" />Hívások</CardTitle></CardHeader>
          <CardContent>
            {(calls.data ?? []).length === 0 ? (
              <EmptyState icon={Phone} title="Még nincs hívás" />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(calls.data ?? []).slice(0, 10).map((r) => (
                  <li key={r.id} className="flex justify-between gap-2">
                    <span className="truncate">{r.direction ?? "—"} · {r.summary ?? r.outcome ?? "—"}</span>
                    <span className="tabular-nums text-muted-foreground">{fmtDateTime(r.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" />Leadek</CardTitle></CardHeader>
          <CardContent>
            {(leads.data ?? []).length === 0 ? (
              <EmptyState icon={Sparkles} title="Még nincs lead" />
            ) : (
              <ul className="space-y-1.5 text-sm">
                {(leads.data ?? []).map((l) => (
                  <li key={l.id} className="flex justify-between gap-2">
                    <Link to="/leads/$id" params={{ id: l.id }} className="truncate text-primary hover:underline">
                      {l.summary ?? `#${String(l.id).slice(0, 8)}`}
                    </Link>
                    <span className="text-muted-foreground">{l.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}