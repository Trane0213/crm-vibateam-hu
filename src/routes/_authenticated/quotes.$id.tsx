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
import { useUpsert } from "@/lib/db-hooks";

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

  const [form, setForm] = useState<{
    title: string;
    valid_until: string;
    notes: string;
    discount_percent: string;
    tax_percent: string;
  }>({ title: "", valid_until: "", notes: "", discount_percent: "", tax_percent: "" });

  useEffect(() => {
    if (!q.data) return;
    setForm({
      title: q.data.title ?? "",
      valid_until: q.data.valid_until ?? "",
      notes: q.data.notes ?? "",
      discount_percent: q.data.discount_percent == null ? "" : String(q.data.discount_percent),
      tax_percent: q.data.tax_percent == null ? "" : String(q.data.tax_percent),
    });
  }, [q.data?.id]);

  const lead = useQuery({
    queryKey: ["quotes", "detail", id, "lead", q.data?.lead_id],
    enabled: !!q.data?.lead_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, summary")
        .eq("id", q.data!.lead_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

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
  const companyId = lead.data?.company_id ?? null;

  const onSave = () => {
    upsert.mutate({
      id: quote.id,
      title: form.title.trim() || null,
      valid_until: form.valid_until || null,
      notes: form.notes.trim() || null,
      discount_percent: form.discount_percent === "" ? null : Number(form.discount_percent),
      tax_percent: form.tax_percent === "" ? null : Number(form.tax_percent),
    });
  };

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
          {quote.lead_id && (
            <span>
              Lead:{" "}
              <Link to="/leads" className="text-primary hover:underline">
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
              <Input
                id="q-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="pl. Klíma szerelés — Kovács villa"
                maxLength={200}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-valid">Érvényesség</Label>
              <Input
                id="q-valid"
                type="date"
                value={form.valid_until}
                onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="q-disc">Kedvezmény (%)</Label>
                <Input
                  id="q-disc"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.discount_percent}
                  onChange={(e) => setForm((f) => ({ ...f, discount_percent: e.target.value }))}
                  placeholder="0"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="q-tax">ÁFA (%)</Label>
                <Input
                  id="q-tax"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={form.tax_percent}
                  onChange={(e) => setForm((f) => ({ ...f, tax_percent: e.target.value }))}
                  placeholder="27"
                />
              </div>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="q-notes">Megjegyzés</Label>
              <Textarea
                id="q-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Ügyfélnek szánt megjegyzés — a nyomtatható nézeten megjelenik."
                rows={4}
                maxLength={2000}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}