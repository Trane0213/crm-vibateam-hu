import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ListPlus, Radar, Mail, Phone, Building2, Search, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposer } from "@/components/emails/email-composer";

export const Route = createFileRoute("/_authenticated/campaign-list")({
  component: CampaignListPage,
});

type CampaignRow = {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  contacts: { id: string; name: string | null; email: string | null; phone: string | null }[];
};

function firstNoteLine(notes: string | null): string | null {
  if (!notes) return null;
  const line = notes.split("\n").map((s) => s.trim()).find(Boolean);
  return line ?? null;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString("hu-HU", { year: "numeric", month: "short", day: "numeric" }); }
  catch { return iso; }
}

function CampaignListPage() {
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState<{ to: string; company: string } | null>(null);

  const q = useQuery({
    queryKey: ["campaign-list", "potencialis"],
    queryFn: async (): Promise<CampaignRow[]> => {
      const { data: companies, error } = await supabase
        .from("companies")
        .select("id,name,website,notes,created_at")
        .eq("company_type", "potencialis")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const ids = (companies ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const { data: contacts } = await supabase
        .from("contacts")
        .select("id,name,email,phone,company_id")
        .in("company_id", ids);
      const byCompany = new Map<string, CampaignRow["contacts"]>();
      for (const k of contacts ?? []) {
        const arr = byCompany.get(k.company_id as string) ?? [];
        arr.push({ id: k.id, name: k.name ?? null, email: k.email ?? null, phone: k.phone ?? null });
        byCompany.set(k.company_id as string, arr);
      }
      return (companies ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        website: c.website ?? null,
        notes: c.notes ?? null,
        created_at: c.created_at,
        contacts: byCompany.get(c.id) ?? [],
      }));
    },
  });

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return q.data ?? [];
    return (q.data ?? []).filter((r) => {
      const hay = [
        r.name, r.website,
        r.contacts.map((k) => `${k.name ?? ""} ${k.email ?? ""} ${k.phone ?? ""}`).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [q.data, search]);

  const total = q.data?.length ?? 0;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kampánylista"
        description="Scarlet által felvett potenciális cégek. Itt még nincs lead — a sales pipeline-ba a Scarlet 'Sales' gombbal kerülnek át."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              <ListPlus className="mr-1 h-3 w-3" /> {total} cég
            </Badge>
            <Button size="sm" variant="outline" asChild>
              <Link to="/sales/research"><Radar className="mr-1 h-3.5 w-3.5" />Scarlet research</Link>
            </Button>
          </div>
        }
      />
      <div className="space-y-3 p-6">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Keresés cégnév, kontakt, email, telefon…"
            className="pl-8"
          />
        </div>

        {q.isLoading ? (
          <p className="p-6 text-sm text-muted-foreground">Betöltés…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={ListPlus}
            title={total === 0 ? "Üres a kampánylista" : "Nincs találat"}
            description={total === 0
              ? "A Scarlet research oldalon a „Kampány” gombbal vehetsz fel ide cégeket."
              : "Próbálj más keresőszót, vagy ürítsd a mezőt."}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Cég</th>
                    <th className="px-3 py-2 text-left">Kapcsolattartó</th>
                    <th className="px-3 py-2 text-left">Email</th>
                    <th className="px-3 py-2 text-left">Telefon</th>
                    <th className="px-3 py-2 text-left">Forrás</th>
                    <th className="px-3 py-2 text-left whitespace-nowrap">Létrehozva</th>
                    <th className="px-3 py-2 text-right">Művelet</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => {
                    const k = r.contacts[0];
                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="px-3 py-2">
                          <Link to="/customers/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline">
                            <Building2 className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                            {r.name}
                          </Link>
                          {r.website && (
                            <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">{r.website}</div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {k?.name ? <span>{k.name}</span> : <span className="text-muted-foreground">—</span>}
                          {r.contacts.length > 1 && (
                            <span className="ml-1 text-[11px] text-muted-foreground">+{r.contacts.length - 1}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {k?.email ? (
                            <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-muted-foreground" />{k.email}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2">
                          {k?.phone ? (
                            <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3 text-muted-foreground" />{k.phone}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{firstNoteLine(r.notes) ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.created_at)}</td>
                        <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {k?.email && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setComposer({ to: k.email!, company: r.name })}
                                  title="Egyszeri email küldése ennek a kapcsolattartónak"
                                >
                                  <Send className="mr-1 h-3.5 w-3.5" /> Email
                                </Button>
                              )}
                              <Link
                                to="/customers/$id"
                                params={{ id: r.id }}
                                className="text-xs text-primary hover:underline"
                              >
                                Megnyitás →
                              </Link>
                            </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}

        <p className="text-xs text-muted-foreground">
          A kampánylista cégei a CRM-ben <Badge variant="outline" className="mx-1">company_type = potencialis</Badge>
          jelöléssel találhatók. Leadet nem hoznak létre — a sales pipeline-ba a Scarlet
          oldalon a „Sales” gombbal kerülnek át.
        </p>
      </div>
      <EmailComposer
        open={!!composer}
        onOpenChange={(v) => { if (!v) setComposer(null); }}
        defaultTo={composer?.to ?? ""}
        defaultSubject={composer ? `${composer.company} — ajánlat` : ""}
      />
    </div>
  );
}