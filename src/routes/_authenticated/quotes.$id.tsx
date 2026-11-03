import { createFileRoute, Link } from "@tanstack/react-router";
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
import { quoteAmounts } from "@/lib/quotes/amounts";
import { formatHuf } from "@/lib/format";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";
const KIND_LABEL: Record<string, string> = { received_budget: "Kapott költségvetés", viba_offer: "Saját VIBA-ajánlat" };
const SCOPE_LABEL: Record<string, string> = { material_labor: "Anyag és munkadíj", labor_only: "Csak munkadíj", other: "Egyéb (leírással)" };
const FIELDS = ["title","valid_until","notes","discount_percent","tax_percent","quote_kind","scope_type","scope_note","contact_id","responsible_user_id","request_due_date","offer_due_date","manual_net_amount","technical_scope","exclusions"] as const;
type FormState = Record<(typeof FIELDS)[number], string>;
const NUMERIC = new Set(["discount_percent","tax_percent","manual_net_amount"]);

export const Route = createFileRoute("/_authenticated/quotes/$id")({
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
  const companyLabel = useLookup("companies", "name");
  const upsert = useUpsert("quotes");

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
  const set = (k: keyof FormState, v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!q.data) return;
    const d = q.data as any;
    setForm(Object.fromEntries(FIELDS.map((f) => [f, d[f] == null ? "" : String(d[f])])) as FormState);
  }, [q.data?.id]);

  const lead = useQuery({
    queryKey: ["quotes", "detail", id, "lead", q.data?.lead_id],
    enabled: !!q.data?.lead_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, summary, assigned_to")
        .eq("id", q.data!.lead_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const project = useQuery({
    queryKey: ["quotes", "detail", id, "project", q.data?.project_id],
    enabled: !!q.data?.project_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, title, company_id").eq("id", q.data!.project_id!).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const companyIdForLists = lead.data?.company_id ?? project.data?.company_id ?? null;
  const contacts = useQuery({
    queryKey: ["contacts", "quote-company", companyIdForLists],
    enabled: !!companyIdForLists,
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name, email").eq("company_id", companyIdForLists!).order("name").limit(500);
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
  const responsible = form.responsible_user_id || lead.data?.assigned_to || "";

  const onSave = () => {
    const payload: Record<string, any> = { id: quote.id };
    for (const f of FIELDS) {
      const v = form[f].trim();
      payload[f] = v === "" ? null : NUMERIC.has(f) ? Number(v) : v;
    }
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
  const huf = (n: number | null) => (n == null ? "Nincs megadva" : formatHuf(n));

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ajánlat</div>
            <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
              <span className="truncate">
                {quote.title?.trim() ||
                  (quote.version != null ? `v${quote.version}` : `#${String(quote.id).slice(0, 8)}`)}
              </span>
              <Badge variant="secondary">{quote.status ?? "draft"}</Badge>
              {quote.is_current && <Badge variant="outline">aktuális</Badge>}
              {quote.version != null && quote.title && (
                <span className="text-xs font-normal text-muted-foreground">v{quote.version}</span>
              )}
            </h1>
          </div>
          <Link
            to="/quotes/$id/print"
            params={{ id: quote.id }}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button size="sm" variant="outline">
              <Printer className="mr-1.5 h-4 w-4" /> Nyomtatás / PDF
            </Button>
          </Link>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {companyId && (
            <span>
              Ügyfél:{" "}
              <Link to="/customers/$id" params={{ id: companyId }} className="text-primary hover:underline">
                <Building2 className="mr-1 inline h-3.5 w-3.5" />
                {companyLabel(companyId)}
              </Link>
            </span>
          )}
          {project.data && (
            <span>
              Projekt:{" "}
              <Link to="/projects/$id" params={{ id: project.data.id }} className="text-primary hover:underline">{project.data.title}</Link>
            </span>
          )}
          <span>Azonosító: #{String(quote.id).slice(0, 8)}</span>
          {quote.lead_id && (
            <span>
              Lead:{" "}
              <Link to="/leads" search={{ lead: quote.lead_id }} className="text-primary hover:underline">
                <Radar className="mr-1 inline h-3.5 w-3.5" />
                {lead.data?.summary?.slice(0, 60) ?? `#${quote.lead_id.slice(0, 8)}`}
              </Link>
            </span>
          )}
          <span>Létrejött: {fmtDateTime(quote.created_at)}</span>
        </div>
      </div>

      <div className="p-6">
        <div className="rounded-md border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Fej-adatok</h2>
            <Button size="sm" onClick={onSave} disabled={upsert.isPending}>
              <Save className="mr-1.5 h-4 w-4" /> Mentés
            </Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="q-title">Ajánlat címe</Label>
              <Input id="q-title" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="pl. Klíma szerelés — Kovács villa" maxLength={200} />
            </div>
            {sel("quote_kind", "Ajánlat típusa", Object.entries(KIND_LABEL))}
            {sel("scope_type", "Ajánlati tartalom", Object.entries(SCOPE_LABEL))}
            {form.scope_type === "other" && area("scope_note", "Tartalom leírása", "Mit tartalmaz az ajánlat?")}
            {sel("contact_id", "Kapcsolattartó", (contacts.data ?? []).map((c: any) => [c.id, c.email ? `${c.name} · ${c.email}` : c.name]), companyId ? "Nincs megadva" : "Előbb cég (ügy/projekt) szükséges")}
            <div className="grid gap-1.5">
              <Label>Felelős értékesítő</Label>
              <Select value={responsible || NONE} onValueChange={(v) => set("responsible_user_id", v === NONE ? "" : v)}>
                <SelectTrigger aria-label="Felelős értékesítő"><SelectValue placeholder="Nincs megadva" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{lead.data?.assigned_to ? "Ügy felelőse szerint" : "Nincs megadva"}</SelectItem>
                  {(sellers.data ?? []).map((u: any) => <SelectItem key={u.auth_user_id} value={u.auth_user_id}>{u.full_name ?? "—"}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {date("request_due_date", "Ajánlatkérési határidő")}
            {date("offer_due_date", "Ajánlattételi határidő")}
            {date("valid_until", "Érvényesség")}
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
            {area("technical_scope", "Műszaki lehatárolás", "Mire terjed ki az ajánlat?")}
            {area("exclusions", "Kizárások", "Mit nem tartalmaz?")}
            {area("notes", "Megjegyzés", "Ügyfélnek szánt megjegyzés — a nyomtatható nézeten megjelenik.")}
          </div>
        </div>
        <div className="mt-6 rounded-md border bg-card p-5">
          <QuoteDocumentManager quoteId={quote.id} />
        </div>
        {/* Meglévő tétel-panel: a nyomtatási nézet ezekből a tételekből számol. */}
        <div className="mt-6 rounded-md border bg-card p-5">
          <QuoteItemsPanel quoteId={quote.id} />
        </div>
      </div>
    </div>
  );
}