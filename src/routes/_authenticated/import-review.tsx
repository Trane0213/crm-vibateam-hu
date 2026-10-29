// Tulajdonosi „Adatellenőrzés”: az Excel-import (viba-excel-2026-10-29) nyitott tételei.
// Csak olvas — összevonás, törlés vagy projektlétrehozás itt NEM történik.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Building2, Mail, Briefcase, AlertTriangle, Sparkles, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";

const BATCH = "viba-excel-2026-10-29";

export const Route = createFileRoute("/_authenticated/import-review")({
  head: () => ({
    meta: [
      { title: "Adatellenőrzés – VIBA CRM" },
      { name: "description", content: "Az adatimport ellenőrzésre váró tételei tulajdonosi döntéshez." },
      { property: "og:title", content: "Adatellenőrzés – VIBA CRM" },
      { property: "og:description", content: "Az adatimport ellenőrzésre váró tételei." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ImportReviewPage,
});

type Review = { id: string; kind: string; title: string; details: Record<string, unknown> | null; company_id: string | null; status: string };

function useData() {
  return useQuery({
    queryKey: ["import-review", BATCH],
    queryFn: async () => {
      const [rev, pc, log] = await Promise.all([
        supabase.from("import_review_items").select("id,kind,title,details,company_id,status").eq("batch", BATCH).eq("status", "open").order("title"),
        supabase.from("project_candidates").select("id,title,source_note,review_status,company_id,project_id,companies(name)").order("title"),
        supabase.from("import_log").select("entity_id").eq("batch", BATCH).eq("entity", "lead"),
      ]);
      if (rev.error) throw rev.error;
      if (pc.error) throw pc.error;
      if (log.error) throw log.error;
      const leadIds = (log.data ?? []).map((r) => r.entity_id).filter(Boolean) as string[];
      const leads = leadIds.length
        ? await supabase.from("leads").select("id,status,summary,source,assigned_to,company_id,companies(name)").in("id", leadIds)
        : { data: [], error: null };
      if (leads.error) throw leads.error;
      return { reviews: (rev.data ?? []) as Review[], candidates: pc.data ?? [], leads: leads.data ?? [] };
    },
  });
}

const str = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));

function Details({ d, skip = [] }: { d: Record<string, unknown> | null; skip?: string[] }) {
  if (!d) return null;
  const LABEL: Record<string, string> = {
    ok: "Miért vár ellenőrzésre", reszlet: "Részlet", crm_jeloltek: "Lehetséges CRM-cég", emailek: "E-mail-címek",
    kategoria: "Kategória", projekt: "Projekt", kezbesites: "Kézbesítés", javitott: "Javított cím", datum: "Dátum",
    szal: "Szál", ceg: "Cég", teendo: "Teendő", jelenlegi_ceg: "Jelenlegi cég", utolso_level: "Utolsó levél",
  };
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-[160px_1fr]">
      {Object.entries(d).filter(([k, v]) => !skip.includes(k) && str(v)).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{LABEL[k] ?? k}</dt>
          <dd className={k === "ok" ? "font-medium text-foreground" : ""}>{str(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewList({ items, icon: Icon }: { items: Review[]; icon: React.ComponentType<{ className?: string }> }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nincs nyitott tétel.</p>;
  return (
    <div className="space-y-2">
      {items.map((r) => {
        const threadId = typeof r.details?.szal_id === "string" ? r.details.szal_id : typeof r.details?.szal === "string" && /^[0-9a-f-]{36}$/.test(r.details.szal as string) ? (r.details.szal as string) : null;
        return (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <span className="font-medium">{r.title}</span>
                <Badge variant="secondary">Döntésre vár</Badge>
                <div className="ml-auto flex gap-3 text-xs">
                  {r.company_id && <Link to="/companies/$id" params={{ id: r.company_id }} className="inline-flex items-center gap-1 text-primary hover:underline">Cég megnyitása <ExternalLink className="h-3 w-3" /></Link>}
                  {threadId && <Link to="/emails/$threadId" params={{ threadId }} className="inline-flex items-center gap-1 text-primary hover:underline">Levél megnyitása <ExternalLink className="h-3 w-3" /></Link>}
                  {!r.company_id && <Link to="/companies" search={{ q: str(r.details?.crm_jeloltek ?? r.title).split(",")[0] } as never} className="inline-flex items-center gap-1 text-primary hover:underline">Keresés a cégek között</Link>}
                </div>
              </div>
              <Details d={r.details} skip={["szal_id"]} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ImportReviewPage() {
  const { data, isLoading, error } = useData();
  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Betöltés…</div>;
  if (error || !data) return <div className="p-6 text-sm text-destructive">Hiba: {error instanceof Error ? error.message : "ismeretlen"}</div>;
  const by = (k: string) => data.reviews.filter((r) => r.kind === k);
  const companies = by("company"), threads = by("email_thread"), invalid = by("invalid_email");
  const tabs = [
    { v: "companies", label: "Bizonytalan cégek", n: companies.length },
    { v: "threads", label: "Levelezési szálak", n: threads.length },
    { v: "projects", label: "Projektjelöltek", n: data.candidates.length },
    { v: "invalid", label: "Hibás e-mail-címek", n: invalid.length },
    { v: "leads", label: "Új Sales-leadek", n: data.leads.length },
  ];
  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tulajdonos</div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold"><ShieldCheck className="h-5 w-5 text-primary" /> Adatellenőrzés</h1>
        <p className="mt-1 text-sm text-muted-foreground">Az október 29-i adatimport tételei, amelyekről tulajdonosi döntés kell. Ezen az oldalon semmi nem módosul automatikusan.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        {tabs.map((t) => (
          <Card key={t.v}><CardHeader className="p-3 pb-0"><CardTitle className="text-xs font-normal text-muted-foreground">{t.label}</CardTitle></CardHeader><CardContent className="p-3 pt-1 text-2xl font-semibold">{t.n}</CardContent></Card>
        ))}
      </div>
      <Tabs defaultValue="companies">
        <TabsList className="flex h-auto flex-wrap">
          {tabs.map((t) => <TabsTrigger key={t.v} value={t.v}>{t.label} ({t.n})</TabsTrigger>)}
        </TabsList>
        <TabsContent value="companies"><ReviewList items={companies} icon={Building2} /></TabsContent>
        <TabsContent value="threads"><ReviewList items={threads} icon={Mail} /></TabsContent>
        <TabsContent value="invalid"><ReviewList items={invalid} icon={AlertTriangle} /></TabsContent>
        <TabsContent value="projects">
          <div className="space-y-2">
            {data.candidates.map((c) => (
              <Card key={c.id}><CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Briefcase className="h-4 w-4 text-primary" />
                  <span className="font-medium">{c.title}</span>
                  <Badge variant="secondary">{c.project_id ? "Projekt létezik" : "Projekt még nincs létrehozva"}</Badge>
                  {c.company_id && <Link to="/companies/$id" params={{ id: c.company_id }} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">{(c.companies as { name?: string } | null)?.name ?? "Cég"} – előzmények <ExternalLink className="h-3 w-3" /></Link>}
                </div>
                <p className="mt-2 text-xs"><span className="text-muted-foreground">Miért vár ellenőrzésre: </span>az Excel szerint folyamatban lévő munka, projekt létrehozásáról tulajdonosi döntés kell.</p>
                {c.source_note && <p className="mt-1 text-xs text-muted-foreground">{c.source_note}</p>}
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>
        <TabsContent value="leads">
          <div className="space-y-2">
            {data.leads.map((l) => (
              <Card key={l.id}><CardContent className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="font-medium">{(l.companies as { name?: string } | null)?.name ?? "Lead"}</span>
                  <Badge variant="secondary">Új – szétosztásra vár</Badge>
                  <Link to="/leads/$id" params={{ id: l.id }} className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">Lead megnyitása <ExternalLink className="h-3 w-3" /></Link>
                </div>
                {l.summary && <p className="mt-2 text-xs text-muted-foreground">{l.summary}</p>}
              </CardContent></Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
