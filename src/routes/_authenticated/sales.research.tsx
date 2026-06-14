import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Sparkles, Loader2, ExternalLink, Check, ListPlus, Info, Building2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AgentGate } from "@/components/ai/agent-gate";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logAiAction } from "@/lib/ai/action-log";
import { withMarketingStatus } from "@/lib/marketing-status";
import {
  researchCompanies,
  type ResearchCompany,
} from "@/lib/ai/research.functions";

type Row = ResearchCompany & {
  _score: number;
  _matched: boolean;
  /** Igaz, ha a sor cégét hozzáadtuk a kampánylistához. */
  _in_campaign?: boolean;
  /** A létrejött/talált companies.id, ha kampánylistára került. */
  _company_id?: string;
};

function scoreRow(r: ResearchCompany, keyword: string, area: string | null): number {
  let s = 0;
  if (r.email) s += 30;
  if (r.phone) s += 20;
  if (r.website) s += 20;
  const kw = keyword.toLowerCase();
  const hay = `${r.company_name} ${r.reason ?? ""}`.toLowerCase();
  if (kw && hay.includes(kw)) s += 15;
  if (area && r.city && r.city.toLowerCase().includes(area.toLowerCase())) s += 15;
  return Math.min(s, 100);
}

function scoreBreakdown(r: ResearchCompany, keyword: string, area: string | null) {
  const kw = keyword.toLowerCase();
  const hay = `${r.company_name} ${r.reason ?? ""}`.toLowerCase();
  return [
    { label: "Email cím",        got: !!r.email,                            pts: 30 },
    { label: "Telefon",          got: !!r.phone,                            pts: 20 },
    { label: "Weboldal",         got: !!r.website,                          pts: 20 },
    { label: "Kulcsszó egyezés", got: !!kw && hay.includes(kw),             pts: 15 },
    { label: "Terület egyezés",  got: !!area && !!r.city && r.city.toLowerCase().includes((area ?? "").toLowerCase()), pts: 15 },
  ];
}

const SHORTLIST_KEY = "marketing.research.shortlist.v1";
/**
 * Régi localStorage shortlist takarítása: ha a felhasználó böngészőjében
 * még van adat, töröljük, hogy ne maradjon árva állapot.
 * (Az új Kampánylista valós CRM-rekord, explicit marketing markerrel.)
 */
function purgeLegacyShortlist() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(SHORTLIST_KEY); } catch { /* noop */ }
}

function scoreTone(score: number): string {
  if (score >= 70) return "bg-[color:var(--status-success)]/15 text-[color:var(--status-success)] border-[color:var(--status-success)]/30";
  if (score >= 40) return "bg-[color:var(--status-warning)]/15 text-[color:var(--status-warning)] border-[color:var(--status-warning)]/30";
  return "bg-muted text-muted-foreground border-border";
}

function ResearchPage() {
  const navigate = useNavigate();
  const callResearch = useServerFn(researchCompanies);

  const [keyword, setKeyword] = useState("");
  const [area, setArea] = useState("");
  const [count, setCount] = useState(15);
  const [rows, setRows] = useState<Row[]>([]);
  // Egyszeri legacy takarítás — a localStorage shortlist már nem használt.
  if (typeof window !== "undefined") purgeLegacyShortlist();

  /**
   * Kampány gomb — a céget bevezeti a CRM-be explicit marketing státusz
   * markerrel, opcionálisan kapcsolattartóval, DE leadet
   * NEM hoz létre. Így a marketing nem nyom rá sales pipeline-ra.
   */
  async function addToCampaign(idx: number) {
    const r = rows[idx];
    if (!r) return;
    try {
      // Duplikáció — cégnév vagy contact email egyezés
      let company_id: string | null = null;
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", r.company_name)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        company_id = existing.id;
      } else if (r.email) {
        const { data: existContact } = await supabase
          .from("contacts")
          .select("id, company_id")
          .ilike("email", r.email)
          .not("company_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (existContact?.company_id) company_id = existContact.company_id as string;
      }

      if (company_id) {
        setRows((prev) =>
          prev.map((row, i) => i === idx ? { ...row, _in_campaign: true, _company_id: company_id! } : row),
        );
        toast.info("Már szerepel a CRM-ben", {
          description: r.company_name,
          action: {
            label: "Megnyitás",
            onClick: () => navigate({ to: "/customers/$id", params: { id: company_id! } }),
          },
        });
        return;
      }

      // Cég létrehozása kampányjelöléssel
      const today = new Date().toISOString().slice(0, 10);
      const noteLines = [
        `Forrás: Scarlet kampány (${today})`,
        r.city ? `Település: ${r.city}` : null,
        r.phone ? `Telefon: ${r.phone}` : null,
        r.email ? `Email: ${r.email}` : null,
        r.reason ? `AI indok: ${r.reason}` : null,
      ].filter(Boolean);
      const notes = withMarketingStatus(noteLines.join("\n") || null, "new");
      const { data: cIns, error: cErr } = await supabase
        .from("companies")
        .insert({
          name: r.company_name,
          website: r.website,
          notes,
        } as any)
        .select("id")
        .single();
      if (cErr) throw cErr;
      company_id = (cIns as any).id as string;

      // Opcionális kontakt
      let contact_id: string | null = null;
      if (r.email || r.phone) {
        const { data: kIns, error: kErr } = await supabase
          .from("contacts")
          .insert({
            name: "Iroda",
            company_id,
            email: r.email,
            phone: r.phone,
            position: null,
          } as any)
          .select("id")
          .single();
        if (kErr) throw kErr;
        contact_id = (kIns as any).id as string;
      }

      await logAiAction({
        // A kampány-művelet a marketing agent (Scarlet) cselekedete; a
        // szigorú típuslistán belül a 'sales' agent_type a legközelebb
        // (a Sales gomb is ezt használja), az action_type pedig 'other',
        // mert nincs még külön 'add_to_campaign' érték a logban.
        agent_type: "sales",
        action_type: "other",
        payload: { company_name: r.company_name, source: "scarlet_research" },
        approved: true,
        executed: true,
        result: { company_id, contact_id },
      });

      setRows((prev) =>
        prev.map((row, i) => i === idx ? { ...row, _in_campaign: true, _company_id: company_id! } : row),
      );
      toast.success("Hozzáadva a kampánylistához", {
        description: r.company_name,
        action: {
          label: "Kampánylista",
          onClick: () => navigate({ to: "/campaign-list" }),
        },
      });
    } catch (e: any) {
      toast.error("Kampánylistára helyezés hiba", { description: humanizeSupabaseError(e) });
    }
  }

  const search = useMutation({
    mutationFn: async () => {
      const res = await callResearch({
        data: { keyword, area: area || null, count },
      });
      return res;
    },
    onSuccess: (res) => {
      const mapped: Row[] = res.results.map((r) => ({
        ...r,
        _score: scoreRow(r, keyword, area || null),
        _matched: false,
      }));
      mapped.sort((a, b) => b._score - a._score);
      setRows(mapped);
      logAiAction({
        agent_type: "sales",
        action_type: "company_research",
        payload: { keyword, area, count },
        result: { count: mapped.length, model: res.model },
        approved: true,
        executed: true,
      });
      if (mapped.length === 0) toast.info("Nincs találat — próbálj más kulcsszót.");
    },
    onError: (e: any) => {
      toast.error("AI keresés hiba", { description: humanizeSupabaseError(e) });
    },
  });

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Scarlet – Marketing Stratéga"
        description="AI-alapú cégkutatás — találj potenciális ügyfeleket és hozz létre belőlük leadeket egy kattintással."
        actions={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/campaign-list">
                <ListPlus className="mr-1 h-3.5 w-3.5" />Kampánylista
              </Link>
            </Button>
            <Badge variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" />MVP · Gemini
            </Badge>
          </div>
        }
      />
      <div className="space-y-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Keresés</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 md:grid-cols-[2fr_1fr_120px_auto]"
              onSubmit={(e) => {
                e.preventDefault();
                if (!keyword.trim()) {
                  toast.error("Adj meg egy kulcsszót.");
                  return;
                }
                search.mutate();
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="kw">Kulcsszó / tevékenység</Label>
                <Input
                  id="kw"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="pl. generálkivitelező"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="area">Terület</Label>
                <Input
                  id="area"
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="pl. Budapest"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="count">Darabszám</Label>
                <Input
                  id="count"
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value) || 15)}
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" disabled={search.isPending} className="w-full md:w-auto">
                  {search.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="mr-1.5 h-4 w-4" />
                  )}
                  Keresés
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              Példák: „generálkivitelező Budapest", „társasház kivitelező Pest megye", „ipari kivitelező Győr", „beruházó Budapest".
              Az eredményeket AI generálja — mindig ellenőrizd az adatokat lead létrehozás előtt.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Találatok {rows.length > 0 && <span className="text-muted-foreground font-normal">({rows.length})</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {search.isPending
                  ? "AI kutatás folyamatban…"
                  : "Indíts egy keresést a fenti űrlappal."}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cégnév</TableHead>
                    <TableHead>Weboldal</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Település</TableHead>
                    <TableHead className="w-20">Score</TableHead>
                    <TableHead className="w-[230px] text-right">Akciók</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={`${r.company_name}-${idx}`}>
                      <TableCell className="font-medium">
                        <div>{r.company_name}</div>
                        {r.reason && (
                          <div className="mt-1 flex items-start gap-1 rounded border-l-2 border-primary/40 bg-primary/5 px-2 py-1 text-xs text-muted-foreground">
                            <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" />
                            <span className="line-clamp-2"><span className="font-medium text-foreground">Scarlet:</span> {r.reason}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {r.website ? (
                          <a
                            href={r.website.startsWith("http") ? r.website : `https://${r.website}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{r.phone ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {r.email ? (
                          <a href={`mailto:${r.email}`} className="text-primary hover:underline">
                            {r.email}
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{r.city ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {(() => {
                          const parts = scoreBreakdown(r, keyword, area || null);
                          const tip = parts
                            .map((p) => `${p.got ? "✓" : "·"} ${p.label} (+${p.pts})`)
                            .join("\n");
                          return (
                            <span title={`Score-bontás:\n${tip}`} className="inline-flex items-center gap-1 cursor-help">
                              <Badge variant="outline" className={scoreTone(r._score)}>{r._score}</Badge>
                              <Info className="h-3 w-3 text-muted-foreground" />
                            </span>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => addToCampaign(idx)}
                            disabled={r._in_campaign}
                            title="Hozzáadás a CRM kampánylistájához (céget hoz létre, leadet nem)"
                          >
                            {r._in_campaign ? <Check className="mr-1 h-3.5 w-3.5" /> : <ListPlus className="mr-1 h-3.5 w-3.5" />}
                            {r._in_campaign ? "Kampányban" : "Kampány"}
                          </Button>
                          {r._in_campaign && r._company_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                navigate({ to: "/customers/$id", params: { id: r._company_id! } })
                              }
                              title="Cég adatlap megnyitása"
                            >
                              <Building2 className="mr-1 h-3.5 w-3.5" /> Megnyit
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/sales/research")({
  component: ResearchRoute,
});

function ResearchRoute() {
  // Scarlet (marketing) agent — ugyanaz a visibility gate, mint az ai-assistant URL guard.
  return (
    <AgentGate agentId="marketing">
      <ResearchPage />
    </AgentGate>
  );
}