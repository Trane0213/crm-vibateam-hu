import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, Sparkles, Loader2, ExternalLink, UserPlus, Check } from "lucide-react";
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
import { logAiAction, updateAiAction } from "@/lib/ai/action-log";
import {
  researchCompanies,
  type ResearchCompany,
} from "@/lib/ai/research.functions";

type Row = ResearchCompany & {
  _score: number;
  _matched: boolean;
  _lead_id?: string;
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

  async function createLead(idx: number) {
    const r = rows[idx];
    if (!r) return;
    try {
      // 0. DUPLIKÁCIÓ ELLENŐRZÉS — cég név vagy contact email alapján.
      let company_id: string | null = null;
      let dupReason: string | null = null;
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .ilike("name", r.company_name)
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        company_id = existing.id;
        dupReason = "cég név egyezés";
      } else if (r.email) {
        const { data: existContact } = await supabase
          .from("contacts")
          .select("id, company_id")
          .ilike("email", r.email)
          .not("company_id", "is", null)
          .limit(1)
          .maybeSingle();
        if (existContact?.company_id) {
          company_id = existContact.company_id as string;
          dupReason = "kapcsolattartó email egyezés";
        }
      }

      // Ha a cég már létezik, nézzük meg, van-e nyitott lead.
      if (company_id) {
        const { data: openLead } = await supabase
          .from("leads")
          .select("id, status")
          .eq("company_id", company_id)
          .not("status", "in", "(won,lost,archived,closed)")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (openLead?.id) {
          const lead_id = openLead.id as string;
          setRows((prev) =>
            prev.map((row, i) =>
              i === idx ? { ...row, _matched: true, _lead_id: lead_id } : row,
            ),
          );
          toast.info("Már szerepel a CRM-ben", {
            description: `${r.company_name} (${dupReason ?? "egyezés"}) — meglévő lead megnyitása.`,
            action: {
              label: "Megnyitás",
              onClick: () => navigate({ to: "/leads/$id", params: { id: lead_id } }),
            },
          });
          navigate({ to: "/leads/$id", params: { id: lead_id } });
          return;
        }
      }

      // 1. Cég létrehozása, ha még nincs.
      if (!company_id) {
        const noteLines = [
          r.city ? `Település: ${r.city}` : null,
          r.phone ? `Telefon: ${r.phone}` : null,
          r.email ? `Email: ${r.email}` : null,
          r.reason ? `AI indok: ${r.reason}` : null,
        ].filter(Boolean);
        const { data: cIns, error: cErr } = await supabase
          .from("companies")
          .insert({
            name: r.company_name,
            website: r.website,
            notes: noteLines.join("\n") || null,
          } as any)
          .select("id")
          .single();
        if (cErr) throw cErr;
        company_id = (cIns as any).id;
      }

      // 2. Kapcsolattartó: ha van email vagy telefon, létrehoz egy „Iroda” kontaktot,
      //    de csak akkor, ha még nincs ilyen email a céghez.
      let contact_id: string | null = null;
      if (r.email || r.phone) {
        if (r.email) {
          const { data: existContact } = await supabase
            .from("contacts")
            .select("id")
            .eq("company_id", company_id)
            .ilike("email", r.email)
            .limit(1)
            .maybeSingle();
          if (existContact?.id) contact_id = existContact.id;
        }
        if (!contact_id) {
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
          contact_id = (kIns as any).id;
        }
      }

      // 3. Lead.
      const summary = `${r.company_name}${r.city ? ` (${r.city})` : ""} — ${r.reason ?? "Marketing kutatás"}`;
      const { data: lIns, error: lErr } = await supabase
        .from("leads")
        .insert({
          summary,
          source: "Marketing Agent",
          project_type: keyword || null,
          status: "new",
          company_id,
          contact_id,
        } as any)
        .select("id")
        .single();
      if (lErr) throw lErr;
      const lead_id = (lIns as any).id as string;

      const logId = await logAiAction({
        agent_type: "sales",
        action_type: "create_lead",
        payload: { source: "marketing_agent", company_name: r.company_name },
        approved: true,
        executed: true,
        result: { lead_id, company_id, contact_id },
      });
      if (logId) await updateAiAction(logId, { executed: true });

      setRows((prev) =>
        prev.map((row, i) =>
          i === idx ? { ...row, _matched: true, _lead_id: lead_id } : row,
        ),
      );
      toast.success("Érdeklődő létrehozva", {
        description: r.company_name,
        action: {
          label: "Megnyitás",
          onClick: () => navigate({ to: "/leads/$id", params: { id: lead_id } }),
        },
      });
    } catch (e: any) {
      toast.error("Érdeklődő létrehozás hiba", { description: humanizeSupabaseError(e) });
    }
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Scarlet – Marketing Stratéga"
        description="AI-alapú cégkutatás — találj potenciális ügyfeleket és hozz létre belőlük leadeket egy kattintással."
        actions={
          <Badge variant="secondary">
            <Sparkles className="mr-1 h-3 w-3" />MVP · Gemini
          </Badge>
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
                    <TableHead className="w-32 text-right">CRM Lead</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, idx) => (
                    <TableRow key={`${r.company_name}-${idx}`}>
                      <TableCell className="font-medium">
                        <div>{r.company_name}</div>
                        {r.reason && (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {r.reason}
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
                        <Badge variant="outline" className={scoreTone(r._score)}>
                          {r._score}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {r._matched && r._lead_id ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              navigate({ to: "/leads/$id", params: { id: r._lead_id! } })
                            }
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Megnyit
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => createLead(idx)}>
                            <UserPlus className="mr-1 h-3.5 w-3.5" /> Lead
                          </Button>
                        )}
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