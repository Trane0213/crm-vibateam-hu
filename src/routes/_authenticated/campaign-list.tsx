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
import { toast } from "sonner";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { readMarketingMeta } from "@/lib/marketing-status";
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
 * Aktív kampánylistából való kikerülés JELÖLŐI a companies.notes szövegben.
 * Ezek meglévő mezőbe írott szöveges markerek — NEM séma-módosítás.
 * - `[KAMPANY:EMAIL_SENT:YYYY-MM-DD]`  — email elment ennek a cégnek
 * - `[KAMPANY:REJECTED:YYYY-MM-DD]`    — marketinges elutasította
 * Az aktív lista mindkét marker hiányát megköveteli.
 */
const MARKER_EMAIL_SENT = "[KAMPANY:EMAIL_SENT:";
const MARKER_REJECTED   = "[KAMPANY:REJECTED:";

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

function appendMarker(notes: string | null, marker: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const line = `${marker}${today}]`;
  return notes && notes.trim() ? `${notes}\n${line}` : line;
}

function CampaignListPage() {
  const [search, setSearch] = useState("");
  const [composer, setComposer] = useState<{ to: string; company: string; companyId: string; contactId?: string } | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; name: string; notes: string | null } | null>(null);
  const qc = useQueryClient();

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

  const active = useMemo(
    () => (q.data ?? []).filter((r) => isActiveCampaign(r.notes)),
    [q.data],
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return active;
    return active.filter((r) => {
      const hay = [
        r.name, r.website,
        r.contacts.map((k) => `${k.name ?? ""} ${k.email ?? ""} ${k.phone ?? ""}`).join(" "),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [active, search]);

  const total = active.length;

  async function markEmailSent(companyId: string, currentNotes: string | null) {
    const next = appendMarker(currentNotes, MARKER_EMAIL_SENT);
    const { error } = await supabase
      .from("companies")
      .update({ notes: next } as any)
      .eq("id", companyId);
    if (error) {
      toast.error("Nem sikerült rögzíteni az email küldést", { description: humanizeSupabaseError(error) });
      return;
    }
    qc.invalidateQueries({ queryKey: ["campaign-list", "potencialis"] });
  }

  async function rejectFromCampaign() {
    if (!rejecting) return;
    const next = appendMarker(rejecting.notes, MARKER_REJECTED);
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
    qc.invalidateQueries({ queryKey: ["campaign-list", "potencialis"] });
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Kampánylista"
        description="Aktív kampánylista — Scarlet által felvett potenciális cégek, akiknek még nem küldtünk emailt és nem lettek elutasítva. Lead csak manuális döntésből jöhet létre."
        actions={
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="tabular-nums">
              <ListPlus className="mr-1 h-3 w-3" /> {total} aktív
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
                                  onClick={() => setComposer({ to: k.email!, company: r.name, companyId: r.id, contactId: k.id })}
                                  title="Egyszeri email küldése ennek a kapcsolattartónak"
                                >
                                  <Send className="mr-1 h-3.5 w-3.5" /> Email
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setRejecting({ id: r.id, name: r.name, notes: r.notes })}
                                title="Elutasítás — kikerül az aktív kampánylistából (a cég és kontakt megmarad)"
                                aria-label="Elutasítás"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
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
          Az aktív lista azokat a <Badge variant="outline" className="mx-1">company_type = potencialis</Badge>
          cégeket mutatja, amelyek <code className="text-[11px]">notes</code>-ában még nincs sem
          <code className="mx-1 text-[11px]">{MARKER_EMAIL_SENT}</code> sem
          <code className="mx-1 text-[11px]">{MARKER_REJECTED}</code> jelölő. Email küldés és elutasítás
          után a sor automatikusan kikerül innen, de a cég és a kapcsolattartó megmarad a CRM-ben.
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
          const row = (q.data ?? []).find((r) => r.contacts.some((c) => c.email === composer.to));
          if (row) void markEmailSent(row.id, row.notes);
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