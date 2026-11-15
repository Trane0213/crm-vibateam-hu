
import { CrmLink } from "@/components/workspace-v2/crm-link";
import { ContractPrepCompact } from "@/components/contract/contract-prep-panel";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { FileText, Building2, Radar, Printer, Save, ArrowRight, Lock } from "lucide-react";
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
import { BudgetPricingPanel } from "@/components/pricing/budget-pricing-panel";
import { PlanReviewPanel } from "@/components/plans/plan-review-panel";
import { DocumentPackagesPanel } from "@/components/packages/document-packages-panel";
import { QuoteVersionsBar } from "@/components/quotes/quote-versions-bar";
import { QuoteSendPanel, type SendDraft } from "@/components/quotes/quote-send-panel";
import { QuotePackagePanel } from "@/components/quote-package/quote-package-panel";
import { VibaOfferCalcPanel } from "@/components/viba-offer/viba-offer-calc-panel";
import { mergeText } from "@/lib/viba-offer/item-plan";
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
import { QuotePricingSettingsCard } from "@/components/quotes/quote-pricing-settings-card";
import { QuoteTimothyHelp } from "@/components/quotes/quote-timothy-help";
import { parseQuotePricingSettings } from "@/lib/quotes/pricing-settings";
import { quoteNextStep, QUOTE_STEPS, type QuoteStepKey } from "@/lib/quotes/quote-steps";
import { QuoteDiscardActions } from "@/components/quotes/quote-discard-actions";

const NONE = "__none";
const KIND_LABEL: Record<string, string> = { received_budget: "Kapott költségvetés", viba_offer: "Saját VIBA-ajánlat" };
const SCOPE_LABEL: Record<string, string> = { material_labor: "Anyag és munkadíj", labor_only: "Csak munkadíj", other: "Egyéb (leírással)" };
const FIELDS = ["title","valid_until","notes","discount_percent","tax_percent","quote_kind","scope_type","scope_note","contact_id","responsible_user_id","request_due_date","offer_due_date","manual_net_amount","technical_scope","exclusions"] as const;
type FormState = Record<(typeof FIELDS)[number], string>;
const NUMERIC = new Set(["discount_percent","tax_percent","manual_net_amount"]);

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

export function QuoteWorkflowDetail({ id }: { id: string; simple?: boolean }) {
  const companyLabel = useLookup("companies", "name");
  const upsert = useUpsert("quotes");
  const { role } = usePermissions();
  const isOwner = role === "owner";
  // Belső ár-, forrás- és fedezetadat: csak Tulajdonos és Sales (a szerver is ellenőrzi).
  const canPriceBudget = role === "owner" || role === "sales";

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
  const [workspace, setWorkspace] = useState<QuoteStepKey>("customer");
  const [formFor, setFormFor] = useState<string | null>(null);
  const [sendDraft, setSendDraft] = useState<SendDraft | null>(null);
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
  // Ugyanaz a cache-kulcs, mint a dokumentumkezelőben és a kiküldésnél.
  const docs = useQuery({
    queryKey: ["quote_documents", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
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
  const features = quoteWorkflowFeatures(form.quote_kind);
  const own = features.ownEditor;
  const locked = !!(quote as any).locked_at;
  const chooseWorkflow = async (kind: QuoteWorkflow) => {
    if (locked) { set("quote_kind", kind); setWorkspace("customer"); return; }
    try {
      // Only the existing kind field changes; documents/items/terms are retained.
      await upsert.mutateAsync({ id: quote.id, quote_kind: kind });
      set("quote_kind", kind);
      setWorkspace("customer");
    } catch { /* Existing mutation reports the error; choice remains available. */ }
  };
  const huf = (n: number | null) => (n == null || n === 0 ? "Nincs árazva" : formatHuf(n));
  const pricingSettings = parseQuotePricingSettings((quote as any).pricing_settings);
  const docList = docs.data ?? [];
  const next = quoteNextStep({
    kind: form.quote_kind, status: quote.status, locked, dirty, contactId: (quote as any).contact_id,
    net: savedAmounts.net, itemCount: itemRows.length, docCount: docList.length,
    pricedDocCount: docList.filter((d) => d.document_type === "priced_budget").length,
    sentOfferDocCount: docList.filter((d) => d.document_type === "sent_offer").length,
  });

  const sel = (k: keyof FormState, label: string, opts: [string, string][], ph = "Nincs megadva") => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Select value={form[k] || NONE} onValueChange={(v) => set(k, v === NONE ? "" : v)} disabled={locked}>
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
  const date = (k: keyof FormState, label: string, hint?: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`q-${k}`}>{label}</Label>
      <Input id={`q-${k}`} type="date" value={form[k]} onChange={(e) => set(k, e.target.value)} />
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
  const saveBtn = <Button size="sm" onClick={onSave} disabled={upsert.isPending || locked}><Save className="mr-1.5 h-4 w-4" /> Mentés</Button>;
  const scopeSave = async () => {
    await upsert.mutateAsync({ id: quote.id, technical_scope: form.technical_scope.trim() || null, exclusions: form.exclusions.trim() || null, notes: form.notes.trim() || null });
  };

  const basics = (
    <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="q-title">Ajánlat megnevezése</Label>
        <Input id="q-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="pl. Klíma szerelés — Kovács villa" maxLength={200} />
      </div>
      {sel("contact_id", "Kapcsolattartó (neki megy az ajánlat)", (contacts.data ?? []).map((c: any) => [c.id, c.email ? `${c.name} · ${c.email}` : c.name]), companyId ? "Nincs kiválasztva" : "Az ügyhöz nincs ügyfél rendelve")}
      <div className="grid gap-1.5">
        <Label>Felelős értékesítő</Label>
        <Select disabled={!isOwner || locked} value={responsible || NONE} onValueChange={(v) => set("responsible_user_id", v === NONE ? "" : v)}>
          <SelectTrigger aria-label="Felelős értékesítő"><SelectValue placeholder="Nincs megadva" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Nincs megadva</SelectItem>
            {(sellers.data ?? []).map((u: any) => <SelectItem key={u.auth_user_id} value={u.auth_user_id}>{u.full_name ?? "—"}</SelectItem>)}
          </SelectContent>
        </Select>
        {!isOwner && <span className="text-xs text-muted-foreground">A felelős a létrehozó; átadni csak tulajdonos tud.</span>}
      </div>
      {sel("scope_type", "Mit tartalmaz az ajánlat?", Object.entries(SCOPE_LABEL))}
      {form.scope_type === "other" && area("scope_note", "Tartalom leírása", "Mit tartalmaz az ajánlat?")}
      {date("offer_due_date", "Beadási határidő", "Eddig kell az ügyfélnek elküldeni.")}
      {date("valid_until", "Érvényesség", "Eddig érvényes az ajánlat az ügyfél számára.")}
      {(quote as any).request_due_date && <p className="text-xs text-muted-foreground sm:col-span-2">Korábban rögzített „ajánlatkérési határidő”: {String((quote as any).request_due_date)} (régi mező, csak tájékoztató).</p>}
    </fieldset>
  );

  const amountBox = (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="q-amount-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="q-amount-title" className="text-sm font-semibold">Ajánlat összege</h3>
        {saveBtn}
      </div>
      <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="q-disc">Kedvezmény (%)</Label>
          <Input id="q-disc" type="number" min={0} max={100} step="0.01" value={form.discount_percent} onChange={(e) => set("discount_percent", e.target.value)} placeholder="0" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="q-tax">ÁFA (%)</Label>
          <Input id="q-tax" type="number" min={0} max={100} step="0.01" value={form.tax_percent} onChange={(e) => set("tax_percent", e.target.value)} placeholder="27" />
        </div>
        {(!own || form.manual_net_amount !== "") && <div className="grid gap-1.5">
          <Label htmlFor="q-manual">{own ? "Kézzel megadott nettó (régi érték)" : "Nettó összeg (Ft)"}</Label>
          <Input id="q-manual" type="number" min={0} step="1" value={form.manual_net_amount} onChange={(e) => set("manual_net_amount", e.target.value)} placeholder={own ? "" : "A teljes árazás után kerül ide"} />
        </div>}
      </fieldset>
      <div className="rounded-md bg-muted/30 p-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>Nettó: <strong>{huf(amounts.net)}</strong></span>
          <span>ÁFA ({amounts.vatPercent}%): {amounts.net ? huf(amounts.vat) : "—"}</span>
          <span>Bruttó: <strong>{amounts.net ? huf(amounts.gross) : "—"}</strong></span>
          <span className="text-muted-foreground">Forrás: {amounts.source === "items" ? "tételek" : amounts.source === "manual" ? "megadott összeg" : "nincs összeg"}</span>
        </div>
        {amounts.mismatch && <div className="mt-2 text-destructive">Eltérés: tételes nettó {huf(amounts.itemsNet)}, megadott nettó {huf(amounts.manualNet)}. Ellenőrizd!</div>}
      </div>
    </section>
  );

  const scopeFields = (
    <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
      {area("technical_scope", "Műszaki lehatárolás", "Mire terjed ki az ajánlat?")}
      {area("exclusions", "Kizárások", "Mit nem tartalmaz?")}
      {area("notes", "Megjegyzés az ügyfélnek", "Az ajánlaton megjelenik.")}
    </fieldset>
  );

  const acceptedBlock = quote.status === "accepted" && <div className="mt-6 max-w-2xl rounded-lg border border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 p-3 text-sm">
    <p className="font-semibold">Elfogadott ajánlat — következik a szerződés</p>
    <p className="mt-1 text-xs text-muted-foreground">A szerződés-előkészítés és a „Megnyertük → projektátadás” a Pipeline ügy-adatlapján történik. Elektronikus aláírás a CRM-ben nincs; a szerződési feltételek fájlja „Szerződési / fizetési feltételek” típusként tölthető fel.</p>
    {(quote.lead_id || quote.project_id) && <div className="mt-2"><ContractPrepCompact leadId={quote.lead_id} projectId={quote.lead_id ? null : quote.project_id}
      fullLink={quote.project_id ? { to: "/projects/$id", params: { id: quote.project_id }, search: { tab: "handover" }, label: "Projekt Átadás fül" } : quote.lead_id ? { to: "/sales/leads", search: { lead: quote.lead_id }, label: "Teljes lista a Pipeline adatlapon" } : null} /></div>}
  </div>;
  const altLabel = (quote as any).alternative_label ?? ((quote as any).alternative_key && (quote as any).alternative_key !== "A" ? `${(quote as any).alternative_key} alternatíva` : null);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-20 border-b bg-background px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{features.kind ? KIND_LABEL[form.quote_kind] ?? "Ajánlat" : "Ajánlat"}</div>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-semibold">
              <span className="break-words [overflow-wrap:anywhere]">{quote.title?.trim() || (companyId ? `Ajánlat – ${companyLabel(companyId)}` : "Névtelen ajánlat")}</span>
              <Badge variant="secondary">{quoteStatusLabel(quote.status)}</Badge>
              <Badge variant="outline">{quote.version ?? 1}. változat{altLabel ? ` · ${altLabel}` : ""}</Badge>
              {quote.is_current === false && <Badge variant="outline">korábbi változat</Badge>}
              {locked && <Badge><Lock className="mr-1 h-3 w-3" />kiküldve · csak olvasható</Badge>}
              {dirty && <Badge variant="outline" className="border-[color:var(--status-warning)]/50 text-[color:var(--status-warning)]">Nem mentett módosítás</Badge>}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <QuoteDiscardActions quote={quote as any} />
            {own && <CrmLink to="/quotes/$id/print" params={{ id: quote.id }} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline"><Printer className="mr-1.5 h-4 w-4" /> Nyomtatás / PDF</Button>
            </CrmLink>}
          </div>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {companyId ? (
            <span>Ügyfél:{" "}
              <CrmLink to="/customers/$id" params={{ id: companyId }} className="text-primary hover:underline">
                <Building2 className="mr-1 inline h-3.5 w-3.5" />{companyLabel(companyId)}
              </CrmLink>
            </span>
          ) : <span className="text-destructive">Ügyfél: nincs ügyhöz kötve</span>}
          {quote.lead_id && <span>Ügy:{" "}
            <CrmLink to="/leads" search={{ lead: quote.lead_id }} className="text-primary hover:underline">
              <Radar className="mr-1 inline h-3.5 w-3.5" />{lead.data?.summary?.slice(0, 60) ?? "megnyitás"}
            </CrmLink>
          </span>}
          {project.data && <span>Projekt:{" "}<CrmLink to="/projects/$id" params={{ id: project.data.id }} className="text-primary hover:underline">{project.data.title}</CrmLink></span>}
          <span>Felelős: {savedResponsible ?? "Nincs megadva"}</span>
          <span>Nettó: <strong className="text-foreground">{huf(savedAmounts.net)}</strong></span>
          <span>Létrejött: {fmtDateTime(quote.created_at)}</span>
        </div>
      </div>

      {!features.kind && <div className="p-4 sm:p-6"><QuoteWorkflowChoice disabled={upsert.isPending} onChoose={chooseWorkflow} /></div>}
      {features.kind && <Tabs value={workspace} onValueChange={(v) => setWorkspace(v as QuoteStepKey)} className="min-w-0 p-4 sm:p-6">
        <div role="status" className="mb-4 flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Következő teendő</p>
            <p className="font-medium">{next.title}</p>
            <p className="text-xs text-muted-foreground">{next.hint}</p>
          </div>
          {next.step !== workspace && <Button size="sm" variant="outline" onClick={() => setWorkspace(next.step)}>
            {QUOTE_STEPS.findIndex((s) => s.key === next.step) + 1}. lépés megnyitása <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>}
        </div>
        {locked && <p className="mb-4 flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm"><Lock className="h-4 w-4 shrink-0" /> Ez a változat már kiment: tartalma csak olvasható. Módosításhoz az 1. lépésben készíts új verziót.</p>}
        <div className="overflow-x-auto border-b pb-3">
          <TabsList aria-label="Ajánlat lépései" className="h-auto w-max justify-start">
            {QUOTE_STEPS.map((s, i) => <TabsTrigger key={s.key} value={s.key}>{i + 1}. {s.label}</TabsTrigger>)}
          </TabsList>
        </div>

        <TabsContent value="customer" forceMount hidden={workspace !== "customer"} className="space-y-6 pt-5">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Ügyfél és határidők</h2>{saveBtn}</div>
            {basics}
          </section>
          <section className="space-y-3 border-t pt-5">
            <h2 className="text-sm font-semibold">Dokumentumok</h2>
            <p className="text-xs text-muted-foreground">Ide tartozik minden fájl: a kapott (árazatlan) Excel, a tervek, és később a kiküldendő ajánlat. A típus jelzi, mire való.</p>
            <QuoteDocumentManager quoteId={quote.id} locked={locked} />
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Nagy tervcsomag (ZIP vagy sok fájl, 20 MB felett)</summary>
              <div className="pt-3"><DocumentPackagesPanel parent={{ kind: "quote", id: quote.id }} title="Tervcsomagok" /></div>
            </details>
          </section>
          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">Verziók és alternatívák</summary>
            <p className="mt-1 text-xs text-muted-foreground">Új verzió = ugyanennek az ajánlatnak módosított változata (a régi megmarad). Alternatíva = párhuzamos műszaki megoldás saját árral.</p>
            <div className="py-3"><QuoteVersionsBar quote={quote as any} /></div>
            {!locked && <div className="max-w-sm">{sel("quote_kind", "Ajánlat típusa", Object.entries(KIND_LABEL))}</div>}
          </details>
        </TabsContent>

        <TabsContent value="pricing" forceMount hidden={workspace !== "pricing"} className="space-y-6 pt-5">
          {!canPriceBudget && <p className="text-sm text-muted-foreground">Árazás csak Tulajdonos és Sales számára érhető el.</p>}
          {canPriceBudget && <QuoteTimothyHelp kind={form.quote_kind} step="pricing" />}
          {own ? <>
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Tételek és árak</h2>
              <p className="text-xs text-muted-foreground">Az ajánlat összege kizárólag ezekből a tételekből számolódik.</p>
              <QuoteItemsPanel quoteId={quote.id} locked={locked} />
            </section>
            {canPriceBudget && <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Segédszámítás: m², óradíj, VBF (opcionális, belső)</summary>
              <p className="mt-1 text-xs text-muted-foreground">Javaslatot ad tételekre; az ajánlatba csak a „Tételek hozzáadása” gombbal kerül.</p>
              <div className="pt-3"><VibaOfferCalcPanel quoteId={quote.id} locked={locked} scopeType={form.scope_type || null}
                onApplyScope={(sc) => setForm((f) => ({ ...f, technical_scope: mergeText(f.technical_scope, sc.technicalScope), exclusions: mergeText(f.exclusions, sc.exclusions) }))} /></div>
            </details>}
          </> : canPriceBudget && <>
            <QuotePricingSettingsCard quote={quote as any} />
            <BudgetPricingPanel quoteId={quote.id} scopeType={form.scope_type || null} locked={locked} settings={pricingSettings} onUseNet={(n) => set("manual_net_amount", String(n))} />
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">Segédeszköz: tervellenőrzés és szekrénykalkuláció (opcionális, belső)</summary>
              <div className="pt-3"><PlanReviewPanel quoteId={quote.id} scopeType={form.scope_type || null} settings={pricingSettings} /></div>
            </details>
          </>}
          {amountBox}
        </TabsContent>

        <TabsContent value="offer" forceMount hidden={workspace !== "offer"} className="space-y-6 pt-5">
          {canPriceBudget && <QuoteTimothyHelp kind={form.quote_kind} step="offer" />}
          {own ? <QuoteTemplatePanel quote={quote as any} extraSave={scopeSave} headerDraft={{
            title: form.title, valid_until: form.valid_until || null, notes: form.notes,
            technical_scope: form.technical_scope, exclusions: form.exclusions,
            discount_percent: form.discount_percent || null, tax_percent: form.tax_percent || null,
            manual_net_amount: form.manual_net_amount || null,
          }}>{scopeFields}</QuoteTemplatePanel> : <>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2"><h2 className="text-sm font-semibold">Lehatárolás és megjegyzések</h2>{saveBtn}</div>
              {scopeFields}
            </section>
            {canPriceBudget && <QuotePackagePanel quote={quote as any} settings={pricingSettings}
              onSaveNet={async (n) => { await upsert.mutateAsync({ id: quote.id, manual_net_amount: n }); set("manual_net_amount", String(n)); }}
              onHandoff={(d) => { setSendDraft(d); setWorkspace("send"); }} onHandoffRevoked={() => setSendDraft(null)} />}
          </>}
          <div className="max-w-2xl"><QuoteReadinessCard quote={quote as any} companyId={companyId} net={savedAmounts.net} mismatch={savedAmounts.mismatch} itemCount={itemRows.length} dirty={dirty} /></div>
        </TabsContent>

        <TabsContent value="send" forceMount hidden={workspace !== "send"} className="space-y-6 pt-5">
          {own && <CrmLink to="/quotes/$id/print" params={{ id: quote.id }} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm"><Printer className="mr-1.5 h-4 w-4" /> Mentett ajánlat / PDF</Button></CrmLink>}
          <QuoteSendPanel quote={quote as any} companyId={companyId} draft={sendDraft} />
          <div className="border-t pt-5"><QuoteStatusPanel quote={quote as any} /></div>
          {acceptedBlock}
        </TabsContent>
      </Tabs>}
    </div>
  );
}
