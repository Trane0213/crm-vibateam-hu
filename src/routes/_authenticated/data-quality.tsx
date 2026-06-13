import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Copy, AlertTriangle, Link2, Mail, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/page-header";
import {
  scanIncompleteCompanies,
  scanCompanyDuplicatePairs,
  scanContactConflicts,
  scanUnlinkedLeads,
  scanUnlinkedThreads,
  linkLeadToCompany,
  linkThreadToCompany,
} from "@/lib/dedupe/global-scans";
import { enrichCompanyFromExistingData, enrichLeadLinks } from "@/lib/enrichment/enrich";
import { SCORE_BAND_LABEL } from "@/lib/dedupe/scoring";
import { fmtDateTime } from "@/components/resource/resource-page";
import { useQualityOverview } from "@/lib/dedupe/use-quality-overview";

export const Route = createFileRoute("/_authenticated/data-quality")({
  component: DataQualityCenter,
});

function DataQualityCenter() {
  const incomplete = useQuery({ queryKey: ["dq", "incomplete"], queryFn: () => scanIncompleteCompanies(200) });
  const dups       = useQuery({ queryKey: ["dq", "company-dups"], queryFn: scanCompanyDuplicatePairs });
  const conflicts  = useQuery({ queryKey: ["dq", "contact-conflicts"], queryFn: scanContactConflicts });
  const leads      = useQuery({ queryKey: ["dq", "unlinked-leads"], queryFn: scanUnlinkedLeads });
  const threads    = useQuery({ queryKey: ["dq", "unlinked-threads"], queryFn: scanUnlinkedThreads });
  const overview   = useQualityOverview();

  const tabBadge = (n: number | undefined) =>
    n && n > 0 ? <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{n}</Badge> : null;

  return (
    <div className="p-6 space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Adatminőség</div>
        <h1 className="mt-1 text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" /> Data Quality Center
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A meglévő CRM-adatokon végzett automatikus ellenőrzés. Új tábla és új mező nélkül.
        </p>
      </div>

      {/* Összesített KPI fejléc — D7 */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <KpiTile icon={ShieldCheck}   label="Hiányos cégek"            value={overview.counts.incompleteCompanies} tone="warning" />
        <KpiTile icon={Copy}          label="Duplikációk"              value={overview.counts.companyDuplicates}   tone="danger"  />
        <KpiTile icon={AlertTriangle} label="Kapcsolattartó probléma"  value={overview.counts.contactConflicts}    tone="danger"  />
        <KpiTile icon={Link2}         label="Kapcsolatlan leadek"      value={overview.counts.unlinkedLeads}       tone="info"    />
        <KpiTile icon={Mail}          label="Kapcsolatlan emailek"     value={overview.counts.unlinkedThreads}     tone="info"    />
      </div>

      <Tabs defaultValue="incomplete">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="incomplete">Hiányos cégek {tabBadge(incomplete.data?.length)}</TabsTrigger>
          <TabsTrigger value="dups">Duplikált cégek {tabBadge(dups.data?.length)}</TabsTrigger>
          <TabsTrigger value="conflicts">Kapcsolattartó problémák {tabBadge(conflicts.data?.length)}</TabsTrigger>
          <TabsTrigger value="leads">Kapcsolatlan leadek {tabBadge(leads.data?.length)}</TabsTrigger>
          <TabsTrigger value="threads">Kapcsolatlan emailek {tabBadge(threads.data?.length)}</TabsTrigger>
        </TabsList>

        <TabsContent value="incomplete" className="mt-4">
          <IncompleteCompaniesTable q={incomplete} />
        </TabsContent>
        <TabsContent value="dups" className="mt-4">
          <DuplicatesTable q={dups} />
        </TabsContent>
        <TabsContent value="conflicts" className="mt-4">
          <ConflictsTable q={conflicts} />
        </TabsContent>
        <TabsContent value="leads" className="mt-4">
          <UnlinkedLeadsTable q={leads} />
        </TabsContent>
        <TabsContent value="threads" className="mt-4">
          <UnlinkedThreadsTable q={threads} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiTile({
  icon: Icon, label, value, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: "info" | "warning" | "danger";
}) {
  const cls =
    tone === "danger"  ? "text-destructive border-destructive/30" :
    tone === "warning" ? "text-amber-700 border-amber-200" :
                         "text-primary border-primary/20";
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider opacity-80">
          <Icon className="h-3.5 w-3.5" />
          <span className="truncate">{label}</span>
        </div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function bandTone(band: "green" | "yellow" | "red") {
  return band === "green" ? "default" : band === "yellow" ? "secondary" : "destructive";
}

function IncompleteCompaniesTable({ q }: { q: ReturnType<typeof useQuery<any>> }) {
  const qc = useQueryClient();
  const fix = useMutation({
    mutationFn: (companyId: string) => enrichCompanyFromExistingData(companyId),
    onSuccess: () => {
      toast.success("Automatikus kitöltés lefutott");
      qc.invalidateQueries({ queryKey: ["dq", "incomplete"] });
      qc.invalidateQueries({ queryKey: ["companies", "surface-map"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sikertelen javítás"),
  });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <EmptyState icon={ShieldCheck} title="Minden cég 100%-os" description="Nincs hiányos rekord." />;
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Cégnév</th>
              <th className="px-3 py-2 text-left">Sáv</th>
              <th className="px-3 py-2 text-left w-[180px]">Adatminőség</th>
              <th className="px-3 py-2 text-left">Hiányzó mezők</th>
              <th className="px-3 py-2 text-right">Művelet</th>
            </tr>
          </thead>
          <tbody>
            {q.data.map((r: any) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 font-medium">
                  <Link to="/customers/$id" params={{ id: r.id }} className="text-primary hover:underline">{r.name}</Link>
                </td>
                <td className="px-3 py-2"><Badge variant={bandTone(r.score.band)}>{SCORE_BAND_LABEL[r.score.band as "green" | "yellow" | "red"]}</Badge></td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Progress value={r.score.pct} className="h-1.5 flex-1" />
                    <span className="tabular-nums text-xs text-muted-foreground w-9 text-right">{r.score.pct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{r.score.missing.join(", ") || "—"}</td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="secondary" disabled={fix.isPending} onClick={() => fix.mutate(r.id)}>Javítás</Button>
                    <Link to="/customers/$id" params={{ id: r.id }} className="text-xs text-primary hover:underline">Megnyitás →</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function DuplicatesTable({ q }: { q: ReturnType<typeof useQuery<any>> }) {
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <EmptyState icon={Copy} title="Nincs duplikátum-gyanú" />;
  const labelOf = (r: string) =>
    r === "tax_number" ? "Azonos adószám" : r === "domain" ? "Azonos domain" : r === "name_exact" ? "Azonos cégnév" : "Hasonló cégnév";
  return (
    <div className="space-y-2">
      {q.data.map((p: any, i: number) => (
        <Card key={i}>
          <CardContent className="p-3 flex items-center gap-3 text-sm">
            <Link to="/customers/$id" params={{ id: p.a.id }} className="font-medium text-primary hover:underline flex-1 truncate">{p.a.name}</Link>
            <span className="text-muted-foreground">↔</span>
            <Link to="/customers/$id" params={{ id: p.b.id }} className="font-medium text-primary hover:underline flex-1 truncate">{p.b.name}</Link>
            <Badge variant="outline" className="ml-2">{labelOf(p.reason)}</Badge>
            <Badge variant="secondary" className="tabular-nums">{(p.confidence * 100).toFixed(0)}%</Badge>
          </CardContent>
        </Card>
      ))}
      <p className="text-xs text-muted-foreground">Csak riport — összevonás kézi áttekintést igényel.</p>
    </div>
  );
}

function ConflictsTable({ q }: { q: ReturnType<typeof useQuery<any>> }) {
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <EmptyState icon={AlertTriangle} title="Nincs adatkonfliktus" />;
  return (
    <div className="space-y-2">
      {q.data.map((c: any, i: number) => (
        <Card key={i}>
          <CardContent className="p-3 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{c.key === "email" ? "Azonos email" : "Azonos telefon"}</Badge>
              <span className="font-mono text-xs">{c.value}</span>
              <span className="ml-auto text-xs text-muted-foreground">{c.contacts.length} kapcsolattartó</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.contacts.map((k: any) => (
                <Link
                  key={k.id}
                  to="/contacts/$id"
                  params={{ id: k.id }}
                  className="text-xs rounded border bg-muted/40 px-2 py-0.5 hover:bg-muted"
                >
                  {k.name || k.id.slice(0, 8)}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UnlinkedLeadsTable({ q }: { q: ReturnType<typeof useQuery<any>> }) {
  const qc = useQueryClient();
  const autofill = useMutation({
    mutationFn: (leadId: string) => enrichLeadLinks(leadId),
    onSuccess: () => {
      toast.success("Automatikus kitöltés lefutott");
      qc.invalidateQueries({ queryKey: ["dq", "unlinked-leads"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sikertelen"),
  });
  const link = useMutation({
    mutationFn: ({ leadId, companyId }: { leadId: string; companyId: string }) => linkLeadToCompany(leadId, companyId),
    onSuccess: () => {
      toast.success("Lead összekapcsolva");
      qc.invalidateQueries({ queryKey: ["dq", "unlinked-leads"] });
      qc.invalidateQueries({ queryKey: ["leads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sikertelen"),
  });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <EmptyState icon={Link2} title="Minden lead össze van kapcsolva" />;
  return (
    <div className="space-y-2">
      {q.data.map((r: any) => (
        <Card key={r.id}>
          <CardContent className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <Link to="/leads/$id" params={{ id: r.id }} className="font-medium text-primary hover:underline truncate block">
                {r.summary ?? `#${r.id.slice(0,8)}`}
              </Link>
              <div className="text-xs text-muted-foreground truncate">
                <span className="font-mono">{r.email}</span> · javaslat:{" "}
                <Link to="/customers/$id" params={{ id: r.suggestedCompany.id }} className="text-primary hover:underline">
                  {r.suggestedCompany.name}
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={autofill.isPending} onClick={() => autofill.mutate(r.id)}>Automatikus kitöltés</Button>
              <Button
                size="sm"
                disabled={link.isPending}
                onClick={() => link.mutate({ leadId: r.id, companyId: r.suggestedCompany.id })}
              >
                Összekapcsolás
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function UnlinkedThreadsTable({ q }: { q: ReturnType<typeof useQuery<any>> }) {
  const qc = useQueryClient();
  const link = useMutation({
    mutationFn: ({ threadId, companyId }: { threadId: string; companyId: string }) => linkThreadToCompany(threadId, companyId),
    onSuccess: () => {
      toast.success("Email thread összekapcsolva");
      qc.invalidateQueries({ queryKey: ["dq", "unlinked-threads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Sikertelen"),
  });
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <EmptyState icon={Mail} title="Minden email thread össze van kapcsolva" />;
  return (
    <div className="space-y-2">
      {q.data.map((r: any) => (
        <Card key={r.id}>
          <CardContent className="p-3 flex items-center gap-3 text-sm">
            <div className="flex-1 min-w-0">
              <Link to="/emails/$threadId" params={{ threadId: r.id }} className="font-medium text-primary hover:underline truncate block">
                {r.subject ?? "(nincs tárgy)"}
              </Link>
              <div className="text-xs text-muted-foreground truncate">
                {fmtDateTime(r.last_message_at)} · javaslat:{" "}
                <Link to="/customers/$id" params={{ id: r.suggestedCompany.id }} className="text-primary hover:underline">
                  {r.suggestedCompany.name}
                </Link>
              </div>
            </div>
            <Button
              size="sm"
              disabled={link.isPending}
              onClick={() => link.mutate({ threadId: r.id, companyId: r.suggestedCompany.id })}
            >
              Kapcsolj össze
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Loading() {
  return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Adatok betöltése…</div>;
}