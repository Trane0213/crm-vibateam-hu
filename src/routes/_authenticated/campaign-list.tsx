import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Radar, Mail, Phone, Building2, Search, Send, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposer } from "@/components/emails/email-composer";
import { CampaignDraftPrecheck } from "@/components/marketing/campaign-draft-precheck";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { readMarketingMeta, withMarketingStatus } from "@/lib/marketing-status";
import { selectMarketingCompanies } from "@/lib/marketing-universe";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/campaign-list")({
  head:()=>({meta:[{title:'Kampánylista | VIBA CRM'},{name:'description',content:'Kijelölt marketingkampány és kereshető CRM-cégek.'},{property:'og:title',content:'Kampánylista | VIBA CRM'},{property:'og:description',content:'Marketingcégek és kapcsolattartók a VIBA CRM-ben.'},{property:'og:type',content:'website'},{name:'twitter:card',content:'summary'}]}),
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

/**
 * Egységesített aktív-kampány definíció: az a cég aktív, amelynek a
 * unified marketing státusza `new`. Bármi más (contacted / qualified /
 * handoff / rejected) kikerül az aktív kampánylistából, így a
 * marketing-home pipeline és a campaign-list ugyanazt a rekordot
 * ugyanabban az állapotban mutatja.
 */
function isActiveCampaign(notes: string | null): boolean {
  return readMarketingMeta(notes).status === "new";
}

function CampaignListPage() {
  const [scope,setScope]=useState<"campaign"|"all">("campaign");
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState<{ to: string; company: string; companyId: string; contactId?: string } | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; name: string; notes: string | null } | null>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["campaign-list", "marketing-universe",scope],
    queryFn: async (): Promise<CampaignRow[]> => {
      const companies = scope==='campaign' ? await selectMarketingCompanies(supabase,"id,name,website,notes,created_at",{limit:1000}) : await (async()=>{
        const rows: any[]=[];
        for(let from=0;;from+=1000){const r=await supabase.from('companies').select('id,name,website,notes,created_at').order('id').range(from,from+999);if(r.error)throw r.error;rows.push(...(r.data??[]));if((r.data?.length??0)<1000)break;}
        return rows;
      })();
      const ids = (companies ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id,name,email,phone,company_id")
        .in("company_id", ids);
      if(contactsError) throw contactsError;
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

  const active = useMemo(
    () => (q.data ?? []).filter((r) => isActiveCampaign(r.notes)),
    [q.data],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const source=scope==='all' ? q.data??[] : active;
    if (!s) return source;
    return source.filter((r) => {
      const hay = [
        r.name, r.website,
        r.contacts.map((k) => `${k.name ?? ""} ${k.email ?? ""} ${k.phone ?? ""}`).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [active, search,scope,q.data]);

  const total = active.length;

  async function markEmailSent(companyId: string, currentNotes: string | null) {
    const next = withMarketingStatus(currentNotes, "contacted");
    const { error } = await supabase
      .from("companies")
      .update({ notes: next } as any)
      .eq("id", companyId);
    if (error) {
      toast.error("Nem sikerült rögzíteni az email küldést", { description: humanizeSupabaseError(error) });
      return;
    }
    qc.invalidateQueries({ queryKey: ["campaign-list", "marketing-universe"] });
  }

  async function rejectFromCampaign() {
    if (!rejecting) return;
    const next = withMarketingStatus(rejecting.notes, "rejected");
    const { error } = await supabase
      .from("companies")
      .update({ notes: next } as any)
      .eq("id", rejecting.id);
    if (error) {
      toast.error("Elutasítás nem sikerült", { description: humanizeSupabaseError(error) });
      return;
    }
    toast.success("Eltávolítva az aktív kampánylistából", { description: rejecting.name });
    setRejecting(null);
    qc.invalidateQueries({ queryKey: ["campaign-list", "marketing-universe"] });
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kampánylista"
        description="Aktív kampánylista — a marketing workflow Új állapotú cégei. Lead csak manuális döntésből jöhet létre."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              <ListPlus className="mr-1 h-3 w-3" /> {total} aktív
            </Badge>
          </div>
        }
      />
      <div className="space-y-3 p-6">
        <CampaignDraftPrecheck companyIds={filtered.map((r) => r.id)} />
        <div className="flex gap-2"><Button variant={scope==='campaign'?'default':'outline'} onClick={()=>setScope('campaign')}>Aktív kampány</Button><Button variant={scope==='all'?'default':'outline'} onClick={()=>setScope('all')}>Minden cég</Button></div>
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
              ? "A cég adatlapján vagy a Minden cég nézetből vehetsz fel ide cégeket."
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
                              {scope==='campaign' && k?.email && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setComposer({ to: k.email ?? "", company: r.name, companyId: r.id, contactId: k.id })}
                                  title="Egyszeri email küldése ennek a kapcsolattartónak"
                                >
                                  <Send className="mr-1 h-3.5 w-3.5" /> Email
                                </Button>
                              )}
                              {scope==='campaign' && <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRejecting({ id: r.id, name: r.name, notes: r.notes })}
                                title="Elutasítás — kikerül az aktív kampánylistából (a cég és kontakt megmarad)"
                                aria-label="Elutasítás"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>}
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
          Az aktív lista a marketing univerzum azon cégeit mutatja, amelyek marketing státusza
          <Badge variant="outline" className="mx-1">Új</Badge>. Email küldés, elutasítás vagy
          sales-átadás után a cég automatikusan kikerül az aktív listáról, de a marketing
          dashboardon és a riportokban tovább látszik a saját bucketjében.
          Lead automatikusan soha nem jön létre.
        </p>
      </div>
      <EmailComposer
        open={!!composer}
        onOpenChange={(v) => { if (!v) setComposer(null); }}
        defaultTo={composer?.to ?? ""}
        defaultSubject={composer ? `${composer.company} — ajánlat` : ""}
        companyId={composer?.companyId}
        contactId={composer?.contactId}
        onSent={() => {
          if (!composer) return;
          const row = (q.data ?? []).find((r) => r.id === composer.companyId);
          if (row) void markEmailSent(row.id, row.notes);
          qc.invalidateQueries({ queryKey: ["mkt-home", "marketing-companies"] });
          setComposer(null);
        }}
      />
      <AlertDialog open={!!rejecting} onOpenChange={(v) => { if (!v) setRejecting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elutasítás a kampánylistából</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{rejecting?.name}</strong> kikerül az aktív kampánylistából.
              A cég és a kapcsolattartó <strong>nem törlődik</strong> a CRM-ből, csak megjelölésre kerül.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction onClick={rejectFromCampaign}>Elutasítás</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}