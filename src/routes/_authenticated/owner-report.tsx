import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, ShieldAlert, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { ownerReportGenerate, ownerReportOverview } from "@/lib/owner-report/owner-report.functions";
import { KIND_LABEL, type FactItem, type FactSection, type OwnerFacts, type ReportKind } from "@/lib/owner-report/model";
import { parseInternalLink } from "@/lib/owner/owner-day-flow";
import type { SpecialistReport } from "@/lib/ai-os/consult";

export const Route = createFileRoute("/_authenticated/owner-report")({
  head: () => ({ meta: [
    { title: "George tulajdonosi jelentése | VIBA CRM" },
    { name: "description", content: "Napi összesítő és heti fejlesztési lista ellenőrzött, forrásrekordhoz kötött tényekből." },
    { property: "og:title", content: "George tulajdonosi jelentése | VIBA CRM" },
    { property: "og:description", content: "Azonnali figyelem, napi összesítő és priorizált heti fejlesztési lista." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: OwnerReportPage,
});

type ReportRow = { id: string; period_label: string; status: string; report: SpecialistReport | null; facts: OwnerFacts; facts_hash: string; tokens_used: number; error: string | null; created_at: string };
const BASIS: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = { source_fact: { label: "Forrástény", variant: "default" }, ai_inference: { label: "AI-következtetés", variant: "secondary" }, unverified: { label: "Nem ellenőrzött", variant: "outline" } };
const ROLE: Record<string, string> = { owner: "Tulajdonos", sales: "Sales", marketing: "Marketing", project_manager: "Projektvezető" };
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "");

function FactLink({ item }: { item: FactItem }) {
  const link = parseInternalLink(item.link ?? null);
  return link ? <Link to={link.to as "/notifications"} search={(link.search ?? {}) as never} className="underline-offset-2 hover:underline">{item.label}</Link> : <span>{item.label}</span>;
}

function OwnerReportPage() {
  const [kind, setKind] = useState<ReportKind>("daily");
  const qc = useQueryClient();
  const overview = useServerFn(ownerReportOverview);
  const generate = useServerFn(ownerReportGenerate);
  const q = useQuery({ queryKey: ["owner-report", kind], queryFn: () => overview({ data: { kind } }) });
  const gen = useMutation({
    mutationFn: (force: boolean) => generate({ data: { kind, force } }),
    onSuccess: (r) => {
      const msg = r.status === "unchanged" ? "A tények nem változtak — a legutóbbi jelentés érvényes, AI-hívás nem indult."
        : r.status === "paused" ? "AI-kredit vagy rate-limit hiba: az AI-jelentés szüneteltetve (Beállítások → AI-felülvizsgálat)."
        : r.status === "budget" ? "A napi AI-tokenkeret elfogyott — a jelentés nem indult."
        : `George jelentése elkészült (${r.tokens.toLocaleString("hu-HU")} token).`;
      (r.status === "ok" || r.status === "unchanged" ? toast.success : toast.error)(msg);
      void qc.invalidateQueries({ queryKey: ["owner-report", kind] });
    },
    onError: (e) => { toast.error(e instanceof Error ? e.message : "A jelentés nem készült el."); void qc.invalidateQueries({ queryKey: ["owner-report", kind] }); },
  });

  const facts: OwnerFacts | undefined = q.data?.facts;
  const reports = (q.data?.reports ?? []) as unknown as ReportRow[];
  const latest = reports.find((r) => r.status === "ok" && r.report);
  const current = latest && latest.facts_hash === q.data?.hash;
  const labelOf = new Map<string, string>();
  for (const s of [...(facts?.sections ?? []), ...(latest?.facts.sections ?? [])]) for (const i of s.items) labelOf.set(i.id.toLowerCase(), i.label);
  const immediate = facts?.sections.find((s) => s.key === "immediate");

  return (
    <div className="flex flex-col">
      <PageHeader title="George tulajdonosi jelentése" description="Ellenőrzött, forrásrekordhoz kötött tények; George ezekből priorizál. Nem módosít adatot, nem küld." />
      <div className="space-y-5 px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {(["daily", "weekly"] as ReportKind[]).map((k) => <Button key={k} size="sm" variant={k === kind ? "default" : "outline"} onClick={() => setKind(k)}>{KIND_LABEL[k]}</Button>)}
          {facts && <span className="text-sm text-muted-foreground">Időszak: {facts.period.label}</span>}
          <Button asChild size="sm" variant="ghost" className="ml-auto"><Link to="/settings/ai-review">AI-keret és felülvizsgálat</Link></Button>
          <Button asChild size="sm" variant="outline"><Link to="/today">Vissza: Mai vezetői munka</Link></Button>
        </div>

        {q.isLoading && <p className="text-sm text-muted-foreground">Tények betöltése…</p>}
        {q.isError && <p className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : "A jelentés nem tölthető be."}</p>}

        {facts && (
          <>
            <Card className={immediate?.total ? "border-destructive/60" : undefined}>
              <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4" /> Azonnali figyelem ({immediate?.total ?? 0})</CardTitle><CardDescription>Kritikus vagy döntést igénylő, lezáratlan értesítések — AI nélkül, valós időben.</CardDescription></CardHeader>
              <CardContent>{immediate?.items.length ? <ul className="space-y-1 text-sm">{immediate.items.map((i) => <li key={i.id} className="flex flex-wrap justify-between gap-2"><FactLink item={i} /><span className="text-xs text-muted-foreground">{fmt(i.at)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">Nincs azonnali teendő.</p>}</CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4" /> George {KIND_LABEL[kind].toLowerCase()}</CardTitle>
                <CardDescription>{latest ? <>Készült: {fmt(latest.created_at)} · {latest.period_label} · {latest.tokens_used.toLocaleString("hu-HU")} token{current ? " · a tények azóta nem változtak" : " · a tények azóta változtak"}</> : "Még nem készült George-jelentés ehhez a nézethez."}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={gen.isPending}>{gen.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}{latest ? "Új jelentés a friss tényekből" : `${KIND_LABEL[kind]} készítése`}</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{KIND_LABEL[kind]} — George</AlertDialogTitle>
                      <AlertDialogDescription>Egy fizetős AI-hívás indul (OpenAI) a közös napi keretből. Ha a tények nem változtak, nem indul hívás, a meglévő jelentés marad. Üzleti adat nem változik; az elhasznált token nem visszavonható.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Mégse</AlertDialogCancel><AlertDialogAction onClick={() => gen.mutate(false)}>Jelentés készítése</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                {gen.isPending && <p className="text-xs text-muted-foreground">George összesít… ez akár néhány percig tarthat, ne zárd be az oldalt.</p>}
                {latest?.report && <ReportView report={latest.report} labelOf={labelOf} weekly={kind === "weekly"} />}
                {reports[0] && reports[0].status !== "ok" && <p className="text-xs text-destructive">Legutóbbi kísérlet: {reports[0].status === "paused" ? "AI-kredit/rate-limit miatt leállt" : reports[0].status === "running" ? "folyamatban" : "nem sikerült"} ({fmt(reports[0].created_at)}).</p>}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground"><FileText className="h-4 w-4" /> Tények (forrásrekordok, AI nélkül)</h2>
              {facts.sections.filter((s) => s.key !== "immediate").map((s) => <FactSectionView key={s.key} s={s} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ReportView({ report, labelOf, weekly }: { report: SpecialistReport; labelOf: Map<string, string>; weekly: boolean }) {
  return (
    <div className="space-y-4 text-sm">
      {report.summary && <p className="whitespace-pre-wrap">{report.summary}</p>}
      <div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline">Ellenőrzött forrás: {report.verified_source_count}</Badge><Badge variant="outline">Nem ellenőrzött állítás: {report.unverified_claim_count}</Badge><Badge variant="outline">Bizonyosság: {report.confidence === "high" ? "magas" : report.confidence === "medium" ? "közepes" : "alacsony"}</Badge></div>
      {report.findings.length > 0 && <div className="space-y-2"><h3 className="font-medium">{weekly ? "Ismétlődő problémák és javaslatok" : "Legfontosabb tételek"}</h3>
        <ul className="space-y-2">{report.findings.map((f, i) => <li key={i} className="rounded-md border p-2"><div className="flex flex-wrap items-start gap-2"><Badge variant={BASIS[f.basis]?.variant ?? "outline"}>{BASIS[f.basis]?.label ?? f.basis}</Badge><span className="min-w-0 flex-1">{f.statement}</span></div>
          {f.sources.length > 0 && <p className="pt-1 text-xs text-muted-foreground">Forrás: {f.sources.map((s) => labelOf.get(s.id.toLowerCase()) ?? s.label ?? s.id).join(" · ")}</p>}</li>)}</ul></div>}
      {report.recommended_actions.length > 0 && <div className="space-y-1"><h3 className="font-medium">{weekly ? "Priorizált fejlesztési lista" : "Mai teendők"} (mind emberi döntés)</h3>
        <ol className="list-decimal space-y-1 pl-5">{report.recommended_actions.map((a, i) => <li key={i}>{a.action} <span className="text-xs text-muted-foreground">— {ROLE[a.owner_role] ?? a.owner_role}</span></li>)}</ol></div>}
      {report.open_questions.length > 0 && <div className="space-y-1"><h3 className="font-medium">Tulajdonosi döntést igényel</h3><ul className="list-disc space-y-1 pl-5">{report.open_questions.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
    </div>
  );
}

function FactSectionView({ s }: { s: FactSection }) {
  return (
    <details className="rounded-md border p-3" open={s.total > 0 && ["new_issues", "overdue", "recurring", "staff_suggestions"].includes(s.key)}>
      <summary className="cursor-pointer text-sm font-medium">{s.title} <span className="text-muted-foreground">({s.total})</span></summary>
      {s.note && <p className="pt-2 text-xs text-muted-foreground">{s.note}</p>}
      {s.items.length ? <ul className="divide-y pt-2 text-sm">{s.items.map((i) => <li key={`${i.type}:${i.id}`} className="flex flex-wrap justify-between gap-2 py-1.5"><FactLink item={i} /><span className="text-xs text-muted-foreground">{fmt(i.at)}</span></li>)}</ul> : <p className="pt-2 text-sm text-muted-foreground">Nincs tétel.</p>}
      {s.total > s.items.length && <p className="pt-1 text-xs text-muted-foreground">Az első {s.items.length} látható a(z) {s.total} tételből.</p>}
    </details>
  );
}
