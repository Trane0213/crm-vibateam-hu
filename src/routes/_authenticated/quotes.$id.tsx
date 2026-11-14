import { createFileRoute, Link } from "@tanstack/react-router";
import { ContractPrepCompact } from "@/components/contract/contract-prep-panel";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileText, Building2, Radar, Printer, Save } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { useUpsert, useListWhere } from "@/lib/db-hooks";
import { QuoteItemsPanel } from "@/components/quotes/quote-items-panel";
import { QuoteDocumentManager } from "@/components/quotes/quote-document-manager";
import { QuoteVersionsBar } from "@/components/quotes/quote-versions-bar";
import { QuoteSendPanel } from "@/components/quotes/quote-send-panel";
import { QuoteTemplatePanel } from "@/components/quotes/quote-template-panel";
import { QuoteStatusPanel } from "@/components/quotes/quote-status-panel";
import { quoteStatusLabel } from "@/lib/quotes/quote-status";
import { usePermissions } from "@/hooks/use-permissions";
import { quoteAmounts } from "@/lib/quotes/amounts";
import { formatHuf } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QuoteWorkflowChoice } from "@/components/quotes/quote-workflow-choice";
import { quoteWorkflowFeatures, type QuoteWorkflow } from "@/lib/quotes/workflow";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { QuoteReadinessCard } from "@/components/quotes/quote-readiness-card";
import { quoteFormDirty } from "@/lib/quotes/form-dirty";

const NONE = "__none";
const KIND_LABEL: Record<string, string> = { received_budget: "Kapott költségvetés", viba_offer: "Saját VIBA-ajánlat" };
const SCOPE_LABEL: Record<string, string> = { material_labor: "Anyag és munkadíj", labor_only: "Csak munkadíj", other: "Egyéb (leírással)" };
const FIELDS = ["title","valid_until","notes","discount_percent","tax_percent","quote_kind","scope_type","scope_note","contact_id","responsible_user_id","request_due_date","offer_due_date","manual_net_amount","technical_scope","exclusions"] as const;
type FormState = Record<(typeof FIELDS)[number], string>;
const NUMERIC = new Set(["discount_percent","tax_percent","manual_net_amount"]);

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  head: () => ({ meta: [
    { title: "Ajánlat munkaterület | VIBA-TEAM CRM" },
    { name: "description", content: "VIBA-ajánlat alapadatok, dokumentumok, árazás, sablon, Gmail-kiküldés és utánkövetés." },
    { property: "og:title", content: "Ajánlat munkaterület | VIBA-TEAM CRM" },
    { property: "og:description", content: "Ajánlat előkészítése és követése a VIBA-TEAM CRM meglévő munkaterületein." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: QuoteDetail,
});

/**
 * Ajánlat adatlap — Phase 3 / v1.
 *
 * Fej-mezők szerkeszthetők (title, valid_until, notes, discount_percent,
 * tax_percent). A tényleges mezők a `2026-07-04_quote_editor_v1.sql`
 * migráció után elérhetők; addig a mentés error-ral tér vissza. A print
 * nézet külön route: /quotes/$id/print (új ablakban nyílik).
 */
type QuoteRow = {
  id: string;
  lead_id: string | null;
  project_id: string | null;
  version: number | null;
  is_current: boolean | null;
  status: string | null;
  created_at: string | null;
  title?: string | null;
  valid_until?: string | null;
  notes?: string | null;
  discount_percent?: number | null;
  tax_percent?: number | null;
};

function QuoteDetail() {
  const { id } = Route.useParams();
  return <QuoteWorkflowDetail id={id} />;
}

export function QuoteWorkflowDetail({ id }: { id: string }) {
  const companyLabel = useLookup("companies", "name");
  const upsert = useUpsert("quotes");
  const { role } = usePermissions();
  const isOwner = role === "owner";

  const q = useQuery({
    queryKey: ["quotes", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as QuoteRow | null;
    },
  });

  const [form, setForm] = useState<FormState>(() => Object.fromEntries(FIELDS.map((f) => [f, ""])) as FormState);
  const [workspace, setWorkspace] = useState("overview");
  const [formFor, setFormFor] = useState<string | null>(null);
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!q.data) return;
    const d = q.data as any;
    setForm(Object.fromEntries(FIELDS.map((f) => [f, d[f] == null ? "" : String(d[f])])) as FormState);
    setFormFor(d.id);
  }, [q.data?.id]);

  const lead = useQuery({
    queryKey: ["quotes", "detail", id, "lead", q.data?.lead_id],
    enabled: !!q.data?.lead_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, summary, assigned_to")
        .eq("id", q.data?.lead_id ?? "")
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const project = useQuery({
    queryKey: ["quotes", "detail", id, "project", q.data?.project_id],
    enabled: !!q.data?.project_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, title, company_id").eq("id", q.data?.project_id ?? "").maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const companyIdForLists = lead.data?.company_id ?? project.data?.company_id ?? null;
  const contacts = useQuery({
    queryKey: ["contacts", "quote-company", companyIdForLists],
    enabled: !!companyIdForLists,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, email").eq("company_id", companyIdForLists ?? "").order("name").limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
  const sellers = useQuery({
    queryKey: ["users_profile", "quote-sellers"],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("users_profile").select("auth_user_id, full_name, active, roles(name)").eq("active", true);
      if (error) throw error;
      return ((data ?? []) as any[]).filter((u) => u.auth_user_id && ["sales", "owner", "tulajdonos", "admin"].includes(String(u.roles?.name ?? "").toLowerCase()));
    },
  });
  const items = useListWhere<any>("quote_items", "quote_id", id);
  const dirty = !!q.data && formFor === q.data.id && quoteFormDirty(FIELDS, form, q.data as any);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (q.isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Ajánlat betöltése…</div>;
  }
  if (q.error || !q.data) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileText}
          title="Az ajánlat nem található"
          description={(q.error as any)?.message}
        />
      </div>
    );
  }
  const quote = q.data;
  const companyId = companyIdForLists;
  const itemRows = items.data ?? [];
  const disc = Number(form.discount_percent) || 0;
  const itemsSum = itemRows.reduce((a, r) => a + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
  const amounts = quoteAmounts({
    itemCount: itemRows.length,
    totalAmount: Math.round(itemsSum * (1 - disc / 100) * 100) / 100,
    manualNetAmount: form.manual_net_amount === "" ? null : Number(form.manual_net_amount),
    taxPercent: form.tax_percent === "" ? null : Number(form.tax_percent),
  });
  const responsible = form.responsible_user_id;
  const savedResponsible = (sellers.data ?? []).find((u: any) => u.auth_user_id === (quote as any).responsible_user_id)?.full_name;
  const savedAmounts = quoteAmounts({
    itemCount: itemRows.length,
    totalAmount: (quote as any).total_amount,
    manualNetAmount: (quote as any).manual_net_amount,
    taxPercent: (quote as any).tax_percent,
  });

  const onSave = () => {
    const payload: Record<string, any> = { id: quote.id };
    for (const f of FIELDS) {
      const v = form[f].trim();
      payload[f] = v === "" ? null : NUMERIC.has(f) ? Number(v) : v;
    }
    if (!isOwner) delete payload.responsible_user_id; // felelőst csak tulajdonos ad át
    if (payload.scope_type !== "other") payload.scope_note = payload.scope_note ?? null;
    upsert.mutate(payload);
  };
  const sel = (k: keyof FormState, label: string, opts: [string, string][], ph = "Nincs megadva") => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={form[k] || NONE} onValueChange={(v) => set(k, v === NONE ? "" : v)}>
        <SelectTrigger aria-label={label}><SelectValue placeholder={ph} /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{ph}</SelectItem>
          {opts.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
  const area = (k: keyof FormState, label: string, placeholder: string) => (
    <div className="grid gap-1.5 sm:col-span-2">
      <Label htmlFor={`q-${k}`}>{label}</Label>
      <Textarea id={`q-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder} rows={3} maxLength={4000} />
    </div>
  );
  const date = (k: keyof FormState, label: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`q-${k}`}>{label}</Label>
      <Input id={`q-${k}`} type="date" value={form[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );
  const features = quoteWorkflowFeatures(form.quote_kind);
  const own = features.ownEditor;
  const chooseWorkflow = async (kind: QuoteWorkflow) => {
    if ((quote as any).locked_at) { set("quote_kind", kind); setWorkspace("overview"); return; }
    try {
      // Only the existing kind field changes; documents/items/terms are retained.
      await upsert.mutateAsync({ id: quote.id, quote_kind: kind });
      set("quote_kind", kind);
      setWorkspace("overview");
    } catch { /* Existing mutation reports the error; choice remains available. */ }
  };
  const huf = (n: number | null) => (n == null ? "Nincs megadva" : formatHuf(n));

  const pricingEditor = (<div className="space-y-4">
          <div className="flex items-center justify-between gap-3 py-5">
            <h2 className="text-sm font-semibold">Árazási alapadatok</h2>
            <Button size="sm" onClick={onSave} disabled={upsert.isPending || !!(quote as any).locked_at}>
              <Save className="mr-1.5 h-4 w-4" /> Mentés
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="q-disc">Kedvezmény (%)</Label>
                <Input id="q-disc" type="number" min={0} max={100} step="0.01" value={form.discount_percent} onChange={(e) => set("discount_percent", e.target.value)} placeholder="0" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-tax">ÁFA (%)</Label>
                <Input id="q-tax" type="number" min={0} max={100} step="0.01" value={form.tax_percent} onChange={(e) => set("tax_percent", e.target.value)} placeholder="27" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-manual">Megadott nettó összeg (fájlalapú ajánlat, Ft)</Label>
              <Input id="q-manual" type="number" min={0} step="1" value={form.manual_net_amount} onChange={(e) => set("manual_net_amount", e.target.value)} placeholder="Ha ismert és ellenőrzött" />
            </div>
            <div className="rounded-md border bg-muted/30 p-3 text-sm sm:col-span-2">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>Nettó: <strong>{huf(amounts.net)}</strong></span>
                <span>ÁFA ({amounts.vatPercent}%): {huf(amounts.vat)}</span>
                <span>Bruttó: <strong>{huf(amounts.gross)}</strong></span>
                <span className="text-muted-foreground">Forrás: {amounts.source === "items" ? "tételes számítás" : amounts.source === "manual" ? "megadott összeg" : "nincs összeg"}</span>
              </div>
              {amounts.mismatch && (
                <div className="mt-2 text-destructive">Eltérés: tételes nettó {huf(amounts.itemsNet)}, megadott nettó {huf(amounts.manualNet)}. Ellenőrizd!</div>
              )}
            </div>
          </div>
            {area("technical_scope", "Műszaki lehatárolás", "Mire terjed ki az ajánlat?")}
            {area("exclusions", "Kizárások", "Mit nem tartalmaz?")}
            {area("notes", "Megjegyzés", "Ügyfélnek szánt megjegyzés — a nyomtatható nézeten megjelenik.")}
  </div>);
  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-20 border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ajánlat</div>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
              <span className="break-words [overflow-wrap:anywhere]">
                {quote.title?.trim() ||
                  (quote.version != null ? `v${quote.version}` : `#${String(quote.id).slice(0, 8)}`)}
              </span>
              <Badge variant="secondary">{quoteStatusLabel(quote.status)}</Badge>
              {quote.is_current && <Badge variant="outline">aktuális</Badge>}
              <Badge variant="outline">{(quote as any).alternative_key ?? "A"} alt.</Badge>
              {(quote as any).locked_at && <Badge>kiküldve</Badge>}
              {dirty && <Badge variant="outline" className="border-[color:var(--status-warning)]/50 text-[color:var(--status-warning)]">Nem mentett módosítás</Badge>}
              {quote.version != null && (
                <span className="text-xs font-normal text-muted-foreground">v{quote.version}</span>
              )}
            </h1>
          </div>
          {own && <Link
            to="/quotes/$id/print"
            params={{ id: quote.id }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              <Printer className="mr-1.5 h-4 w-4" /> Nyomtatás / PDF
            </Button>
          </Link>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {companyId ? (
            <span>
              Ügyfél:{" "}
              <Link to="/customers/$id" params={{ id: companyId }} className="text-primary hover:underline">
                <Building2 className="mr-1 inline h-3.5 w-3.5" />
                {companyLabel(companyId)}
              </Link>
            </span>
          ) : <span>Ügyfél: nincs megadva</span>}
          <span>Felelős: {savedResponsible ?? "Nincs megadva"}</span>
          <span>Nettó: <strong className="text-foreground">{huf(savedAmounts.net)}</strong></span>
          {project.data && (
            <span>
              Projekt:{" "}
              <Link to="/projects/$id" params={{ id: project.data.id }} className="text-primary hover:underline">{project.data.title}</Link>
            </span>
          )}
          <span>Azonosító: #{String(quote.id).slice(0, 8)}</span>
          {quote.lead_id && (
            <span>
              Ügy:{" "}
              <Link to="/leads" search={{ lead: quote.lead_id }} className="text-primary hover:underline">
                <Radar className="mr-1 inline h-3.5 w-3.5" />
                {lead.data?.summary?.slice(0, 60) ?? `#${quote.lead_id.slice(0, 8)}`}
              </Link>
            </span>
          )}
          <span>Létrejött: {fmtDateTime(quote.created_at)}</span>
        </div>
      </div>

      {!features.kind && <div className="p-4 sm:p-6"><QuoteWorkflowChoice disabled={upsert.isPending} onChoose={chooseWorkflow} /></div>}
      {features.kind && <Tabs value={workspace} onValueChange={setWorkspace} className="min-w-0 p-4 sm:p-6">
        <div className="overflow-x-auto border-b pb-3">
          <TabsList aria-label="Ajánlat munkaterületei" className="h-auto w-max justify-start">
            <TabsTrigger value="overview">1. {own ? "Alapadatok" : "Excel és tervek"}</TabsTrigger>
            <TabsTrigger value="pricing">2. {own ? "Ajánlat összeállítása" : "Összeg és megjegyzések"}</TabsTrigger>
            <TabsTrigger value="send">3. Ellenőrzés és kiküldés</TabsTrigger>
            <TabsTrigger value="status">4. Utánkövetés</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview" forceMount hidden={workspace !== "overview"}>
        <details className="border-b py-3"><summary className="cursor-pointer text-sm font-medium">Verziók és további műveletek</summary><div className="py-3"><QuoteVersionsBar quote={quote as any} /></div>
          {!(quote as any).locked_at && <div className="max-w-sm py-3">{sel("quote_kind", "Ajánlat típusa", Object.entries(KIND_LABEL))}</div>}
        </details>
        {!own && <div className="py-5"><QuoteDocumentManager quoteId={quote.id} /></div>}
        <div className="py-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ügyfél és alapadatok</h2>
            <Button size="sm" onClick={onSave} disabled={upsert.isPending || !!(quote as any).locked_at}>
              <Save className="mr-1.5 h-4 w-4" /> Mentés
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="q-title">Ajánlat címe</Label>
              <Input id="q-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="pl. Klíma szerelés — Kovács villa" maxLength={200} />
            </div>
            {sel("scope_type", "Ajánlati tartalom", Object.entries(SCOPE_LABEL))}
            {form.scope_type === "other" && area("scope_note", "Tartalom leírása", "Mit tartalmaz az ajánlat?")}
            {sel("contact_id", "Kapcsolattartó", (contacts.data ?? []).map((c: any) => [c.id, c.email ? `${c.name} · ${c.email}` : c.name]), companyId ? "Nincs megadva" : "Előbb cég (ügy/projekt) szükséges")}
            <div className="grid gap-1.5">
              <Label>Felelős értékesítő</Label>
              <Select disabled={!isOwner} value={responsible || NONE} onValueChange={(v) => set("responsible_user_id", v === NONE ? "" : v)}>
                <SelectTrigger aria-label="Felelős értékesítő"><SelectValue placeholder="Nincs megadva" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nincs megadva</SelectItem>
                  {(sellers.data ?? []).map((u: any) => <SelectItem key={u.auth_user_id} value={u.auth_user_id}>{u.full_name ?? "—"}</SelectItem>)}
                </SelectContent>
              </Select>
              {!isOwner && <span className="text-xs text-muted-foreground">A felelős a létrehozó; átadni csak tulajdonos tud.</span>}
            </div>
            {date("request_due_date", "Ajánlatkérési határidő")}
            {date("offer_due_date", "Ajánlattételi határidő")}
            {date("valid_until", "Érvényesség")}
          </div>
        </div>
        </TabsContent>
        <TabsContent value="pricing" forceMount hidden={workspace !== "pricing"}>
          {own ? <QuoteTemplatePanel quote={quote as any} headerDraft={{
            title: form.title, valid_until: form.valid_until || null, notes: form.notes,
            technical_scope: form.technical_scope, exclusions: form.exclusions,
            discount_percent: form.discount_percent || null, tax_percent: form.tax_percent || null,
            manual_net_amount: form.manual_net_amount || null,
          }}>{pricingEditor}
          <div className="mt-6 border-t py-5"><QuoteItemsPanel quoteId={quote.id} locked={!!(quote as any).locked_at} /></div>
          </QuoteTemplatePanel> : pricingEditor}
        </TabsContent>
        <TabsContent value="send" forceMount hidden={workspace !== "send"} className="py-5">
          <div className="mb-6 max-w-2xl"><QuoteReadinessCard quote={quote as any} companyId={companyId} net={savedAmounts.net} mismatch={savedAmounts.mismatch} itemCount={itemRows.length} dirty={dirty} /></div>
          {own && <div className="mb-6 space-y-4">
            <Link to="/quotes/$id/print" params={{ id: quote.id }} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><Printer className="mr-1.5 h-4 w-4" /> Mentett ajánlat / PDF</Button></Link>
            <QuoteDocumentManager quoteId={quote.id} />
          </div>}
          <QuoteSendPanel quote={quote as any} companyId={companyId} />
        </TabsContent>
        <TabsContent value="status" forceMount hidden={workspace !== "status"} className="py-5">
          <QuoteStatusPanel quote={quote as any} />
          {quote.status === "accepted" && <div className="mt-6 max-w-2xl rounded-lg border border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 p-3 text-sm">
            <p className="font-semibold">Elfogadott ajánlat — következik a szerződés</p>
            <p className="mt-1 text-xs text-muted-foreground">A szerződés-előkészítés és a „Megnyertük → projektátadás” a Pipeline ügy-adatlapján történik. Elektronikus aláírás és szerződés-jóváhagyás a CRM-ben nincs; a szerződési feltételek fájlja „Szerződési / fizetési feltételek” típusként tölthető fel.</p>
            {(quote.lead_id || quote.project_id) && <div className="mt-2"><ContractPrepCompact leadId={quote.lead_id} projectId={quote.lead_id ? null : quote.project_id}
              fullLink={quote.project_id ? { to: "/projects/$id", params: { id: quote.project_id }, search: { tab: "handover" }, label: "Projekt Átadás fül" } : quote.lead_id ? { to: "/sales/leads", search: { lead: quote.lead_id }, label: "Teljes lista a Pipeline adatlapon" } : null} /></div>}
          </div>}
        </TabsContent>
      </Tabs>}
    </div>
  );
}