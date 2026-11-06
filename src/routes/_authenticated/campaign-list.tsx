import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ListPlus, Radar, Mail, Phone, Building2, Search, Send, Trash2, MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, PageHeader } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { EmailComposer } from "@/components/emails/email-composer";
import { CampaignDraftPrecheck } from "@/components/marketing/campaign-draft-precheck";
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import {
  readMarketingMeta,
  marketingExpected,
  MARKETING_STATE_SELECT,
  type CompanyMarketingState,
} from "@/lib/marketing-status";
import { setCompanyMarketingStatus } from "@/lib/company-marketing.functions";
import { selectMarketingCompanies } from "@/lib/marketing-universe";
import { campaignEntrySearch } from "@/lib/marketing/campaign-entry";
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
  validateSearch: campaignEntrySearch,
  head: () => ({
    meta: [
      { title: "Kampánylista | VIBA CRM" },
      { name: "description", content: "Kijelölt marketingkampány és kereshető CRM-cégek." },
      { property: "og:title", content: "Kampánylista | VIBA CRM" },
      { property: "og:description", content: "Marketingcégek és kapcsolattartók a VIBA CRM-ben." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CampaignListPage,
});

type CampaignRow = CompanyMarketingState & {
  id: string;
  name: string;
  website: string | null;
  notes: string | null;
  created_at: string;
  contacts: { id: string; name: string | null; email: string | null; phone: string | null }[];
};

function firstNoteLine(notes: string | null): string | null {
  if (!notes) return null;
  const line = notes
    .split("\n")
    .map((s) => s.trim())
    .find(Boolean);
  return line ?? null;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("hu-HU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Egységesített aktív-kampány definíció: az a cég aktív, amelynek a
 * unified marketing státusza `new`. Bármi más (contacted / qualified /
 * handoff / rejected) kikerül az aktív kampánylistából, így a
 * marketing-home pipeline és a campaign-list ugyanazt a rekordot
 * ugyanabban az állapotban mutatja.
 */
function isActiveCampaign(row: CampaignRow): boolean {
  return readMarketingMeta(row.notes, row).status === "new";
}

function CampaignListPage() {
  const entry = Route.useSearch();
  const [scope, setScope] = useState<"campaign" | "all">(entry.companyId ? "all" : "campaign");
  const [search, setSearch] = useState("");
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(
    entry.companyId ? [entry.companyId] : [],
  );
  useEffect(() => {
    if (!entry.companyId) return;
    setScope("all");
    setSelectedCompanies((previous) => [
      ...new Set([...previous, entry.companyId].filter((id): id is string => !!id)),
    ]);
  }, [entry.companyId]);
  const [composer, setComposer] = useState<{
    to: string;
    company: string;
    companyId: string;
    contactId?: string;
  } | null>(null);
  const [rejecting, setRejecting] = useState<CampaignRow | null>(null);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["campaign-list", "marketing-universe", scope],
    queryFn: async (): Promise<CampaignRow[]> => {
      const companies =
        scope === "campaign"
          ? await selectMarketingCompanies(
              supabase,
              `id,name,website,notes,created_at,${MARKETING_STATE_SELECT}`,
            )
          : await (async () => {
              const rows: any[] = [];
              for (let from = 0; ; from += 1000) {
                const r = await supabase
                  .from("companies")
                  .select(`id,name,website,notes,created_at,${MARKETING_STATE_SELECT}`)
                  .order("id")
                  .range(from, from + 999);
                if (r.error) throw r.error;
                rows.push(...(r.data ?? []));
                if ((r.data?.length ?? 0) < 1000) break;
              }
              return rows;
            })();
      const ids = (companies ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const contacts: any[] = [];
      for (let chunk = 0; chunk < ids.length; chunk += 200) {
        for (let from = 0; ; from += 1000) {
          const r = await supabase
            .from("contacts")
            .select("id,name,email,phone,company_id")
            .in("company_id", ids.slice(chunk, chunk + 200))
            .order("id")
            .range(from, from + 999);
          if (r.error) throw r.error;
          contacts.push(...(r.data ?? []));
          if ((r.data?.length ?? 0) < 1000) break;
        }
      }
      const byCompany = new Map<string, CampaignRow["contacts"]>();
      for (const k of contacts ?? []) {
        const arr = byCompany.get(k.company_id as string) ?? [];
        arr.push({
          id: k.id,
          name: k.name ?? null,
          email: k.email ?? null,
          phone: k.phone ?? null,
        });
        byCompany.set(k.company_id as string, arr);
      }
      return (companies ?? []).map((c) => ({
        ...c,
        id: c.id,
        name: c.name,
        website: c.website ?? null,
        notes: c.notes ?? null,
        created_at: c.created_at,
        contacts: byCompany.get(c.id) ?? [],
      }));
    },
  });

  const active = useMemo(() => (q.data ?? []).filter((r) => isActiveCampaign(r)), [q.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const source = scope === "all" ? (q.data ?? []) : active;
    if (!s) return source;
    return source.filter((r) => {
      const hay = [
        r.name,
        r.website,
        r.contacts.map((k) => `${k.name ?? ""} ${k.email ?? ""} ${k.phone ?? ""}`).join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(s);
    });
  }, [active, search, scope, q.data]);

  const total = active.length;

  async function rejectFromCampaign() {
    if (!rejecting) return;
    try {
      await setCompanyMarketingStatus({
        data: {
          companyId: rejecting.id,
          status: "rejected",
          handoffLeadId: null,
          expected: marketingExpected(rejecting),
        },
      });
    } catch (error) {
      toast.error("Elutasítás nem sikerült", { description: humanizeSupabaseError(error) });
      qc.invalidateQueries({ queryKey: ["campaign-list"] });
      return;
    }
    toast.success("Eltávolítva az aktív kampánylistából", { description: rejecting.name });
    setRejecting(null);
    qc.invalidateQueries({ queryKey: ["campaign-list"] });
    qc.invalidateQueries({ queryKey: ["mkt-home"] });
    qc.invalidateQueries({ queryKey: ["customers"] });
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kampányok"
        description="Címzettek, kampányüzenet és ütemezés."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              <ListPlus className="mr-1 h-3 w-3" /> {total} aktív
            </Badge>
          </div>
        }
      />
      <div className="space-y-3 p-4 sm:p-6">
        <CampaignDraftPrecheck
          companyIds={selectedCompanies}
          entryContactId={entry.contactId}
          entryCompanyId={entry.companyId}
          candidates={(q.data ?? [])
            .filter((r) => selectedCompanies.includes(r.id))
            .flatMap((r) =>
              r.contacts.map((c) => ({ ...c, company_id: r.id, company_name: r.name })),
            )}
          recipientBrowser={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{selectedCompanies.length} kijelölt cég</Badge>
                <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Cégkijelölés műveletei"><MoreHorizontal /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onSelect={() =>
                    setSelectedCompanies((prev) => [
                      ...new Set([...prev, ...filtered.map((r) => r.id)]),
                    ])
                  }
                >
                  Találatok kijelölése
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!selectedCompanies.length}
                  onSelect={() => setSelectedCompanies([])}
                >
                  Kijelölés törlése
                </DropdownMenuItem></DropdownMenuContent></DropdownMenu>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={scope === "campaign" ? "default" : "outline"}
                  onClick={() => setScope("campaign")}
                >
                  Aktív kampány
                </Button>
                <Button
                  variant={scope === "all" ? "default" : "outline"}
                  onClick={() => setScope("all")}
                >
                  Minden cég
                </Button>
              </div>
              <div className="relative max-w-sm">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Keresés cégnév, kontakt, email, telefon…"
                  className="pl-8"
                />
              </div>

              {q.error ? (
                <p role="alert" className="p-6 text-sm text-destructive">
                  A cégek nem tölthetők be.{" "}
                  <Button variant="outline" size="sm" onClick={() => q.refetch()}>
                    Újrapróbálás
                  </Button>
                </p>
              ) : q.isLoading ? (
                <p className="p-6 text-sm text-muted-foreground">Betöltés…</p>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={ListPlus}
                  title={total === 0 ? "Üres a kampánylista" : "Nincs találat"}
                  description={
                    total === 0
                      ? "A cég adatlapján vagy a Minden cég nézetből vehetsz fel ide cégeket."
                      : "Próbálj más keresőszót, vagy ürítsd a mezőt."
                  }
                />
              ) : (
                <div className="max-h-[480px] min-w-0 overflow-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2">
                          <span className="sr-only">Kijelölés</span>
                        </th>
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
                              <Checkbox
                                aria-label={`${r.name} kijelölése`}
                                checked={selectedCompanies.includes(r.id)}
                                onCheckedChange={(v) =>
                                  setSelectedCompanies((prev) =>
                                    v === true
                                      ? [...new Set([...prev, r.id])]
                                      : prev.filter((id) => id !== r.id),
                                  )
                                }
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Link
                                to="/customers/$id"
                                params={{ id: r.id }}
                                className="font-medium text-primary hover:underline"
                              >
                                <Building2 className="mr-1 inline h-3.5 w-3.5 align-text-bottom" />
                                {r.name}
                              </Link>
                              {r.website && (
                                <div className="text-[11px] text-muted-foreground truncate max-w-[220px]">
                                  {r.website}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {k?.name ? (
                                <span>{k.name}</span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                              {r.contacts.length > 1 && (
                                <span className="ml-1 text-[11px] text-muted-foreground">
                                  +{r.contacts.length - 1}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {k?.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <Mail className="h-3 w-3 text-muted-foreground" />
                                  {k.email}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {k?.phone ? (
                                <span className="inline-flex items-center gap-1">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  {k.phone}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">
                              {firstNoteLine(r.notes) ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                              {fmtDate(r.created_at)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {scope === "campaign" && k?.email && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() =>
                                      setComposer({
                                        to: k.email ?? "",
                                        company: r.name,
                                        companyId: r.id,
                                        contactId: k.id,
                                      })
                                    }
                                    title="Egyszeri email küldése ennek a kapcsolattartónak"
                                  >
                                    <Send className="mr-1 h-3.5 w-3.5" /> Email
                                  </Button>
                                )}
                                {scope === "campaign" && (<DropdownMenu>
                                  <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`${r.name} további műveletei`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                                  <DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setRejecting(r)} className="text-destructive"><Trash2 />Elutasítás az aktív listából</DropdownMenuItem></DropdownMenuContent>
                                </DropdownMenu>)}
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
                </div>
              )}
            </>
          }
        />
        {entry.companyId &&
          !q.isLoading &&
          !q.error &&
          !q.data?.some((r) => r.id === entry.companyId) && (
            <p role="alert" className="text-sm text-destructive">
              A kiválasztott cég nem elérhető; kampánytagság nem lett mentve.
            </p>
          )}

        <details className="border-t pt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">Az aktív lista feltételei</summary><p className="pt-2">
          Az aktív lista a marketing univerzum azon cégeit mutatja, amelyek marketing státusza
          <Badge variant="outline" className="mx-1">
            Új
          </Badge>
          . Email küldés, elutasítás vagy sales-átadás után a cég automatikusan kikerül az aktív
          listáról, de a marketing dashboardon és a riportokban tovább látszik a saját bucketjében.
          Lead automatikusan soha nem jön létre.
        </p></details>
      </div>
      <EmailComposer
        open={!!composer}
        onOpenChange={(v) => {
          if (!v) setComposer(null);
        }}
        defaultTo={composer?.to ?? ""}
        defaultSubject={composer ? `${composer.company} — ajánlat` : ""}
        companyId={composer?.companyId}
        contactId={composer?.contactId}
        onSent={() => {
          if (!composer) return;
          qc.invalidateQueries({ queryKey: ["campaign-list"] });
          qc.invalidateQueries({ queryKey: ["mkt-home"] });
          qc.invalidateQueries({ queryKey: ["customers"] });
          setComposer(null);
        }}
      />
      <AlertDialog
        open={!!rejecting}
        onOpenChange={(v) => {
          if (!v) setRejecting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elutasítás a kampánylistából</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{rejecting?.name}</strong> kikerül az aktív kampánylistából. A cég és a
              kapcsolattartó <strong>nem törlődik</strong> a CRM-ből, csak megjelölésre kerül.
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
