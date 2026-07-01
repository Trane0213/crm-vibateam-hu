import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Briefcase, BellRing, Building2, Package, Radar } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/page-header";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere, useUpsert, humanizeSupabaseError } from "@/lib/db-hooks";
import { fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { formatHuf } from "@/lib/format";
import { QuoteItemsPanel } from "@/components/quotes/quote-items-panel";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/quotes/$id")({
  component: QuoteDetail,
});

/**
 * Ajánlat-szerkesztő (Sprint 1).
 * Csak azok a mezők szerkeszthetők/menthetők, amelyek jelenleg léteznek az adatbázisban:
 *   quotes:      id, lead_id, project_id, version, is_current, status, total_amount, created_at
 *   quote_items: id, quote_id, name, quantity, unit, unit_price, created_at
 * Minden további (title, valid_until, discount, advance, notes, VAT stb.) mező
 * későbbi additív migráció után kerül be — a hiányok listája:
 *   .lovable/quote-editor-gaps.md
 */

// Szabad-szöveges státusz, de a napi használathoz fix opciók.
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "draft",       label: "Piszkozat" },
  { value: "sent",        label: "Kiküldve" },
  { value: "accepted",    label: "Elfogadva" },
  { value: "rejected",    label: "Elutasítva" },
];

function statusLabel(s?: string | null) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? (s ?? "—");
}

type QuoteRow = {
  id: string;
  lead_id: string | null;
  project_id: string | null;
  version: number | null;
  is_current: boolean | null;
  status: string | null;
  total_amount: number | null;
  created_at: string | null;
};

type QuoteItem = {
  id: string;
  quote_id: string;
  quantity: number | null;
  unit_price: number | null;
};

function QuoteDetail() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const projectLabel = useLookup("projects", "title");
  const companyLabel = useLookup("companies", "name");

  const q = useQuery({
    queryKey: ["quotes", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as QuoteRow | null;
    },
  });

  const items = useListWhere<QuoteItem>("quote_items", "quote_id", id, {
    order: "created_at", ascending: true, select: "id,quote_id,quantity,unit_price",
  });

  const followups = useListWhere<any>("followups", "quote_id", id, {
    order: "due_date", ascending: true,
  });

  const lead = useQuery({
    queryKey: ["quotes", "detail", id, "lead", q.data?.lead_id],
    enabled: !!q.data?.lead_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("id, company_id, contact_id, summary, status")
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
      const { data, error } = await supabase
        .from("projects")
        .select("id,company_id")
        .eq("id", q.data!.project_id!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const upsert = useUpsert("quotes");

  // ─────────── Élő nettó összeg a tételekből ───────────
  const netSum = useMemo(
    () => (items.data ?? []).reduce(
      (acc, r) => acc + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0),
      0,
    ),
    [items.data],
  );

  // Automatikusan visszaírjuk a `total_amount`-ot, ha eltér az élő nettó összegtől.
  // (VAT jelenleg nem tárolható — a `total_amount` így a nettó összeg tükre.)
  const syncedForRef = useRef<{ id: string; total: number } | null>(null);
  useEffect(() => {
    if (!q.data || items.isLoading) return;
    const current = Number(q.data.total_amount ?? 0);
    const rounded = Math.round(netSum);
    if (current === rounded) return;
    // Ne írjunk feleslegesen; ugyanarra a párra egyszer.
    const key = { id: q.data.id, total: rounded };
    if (
      syncedForRef.current &&
      syncedForRef.current.id === key.id &&
      syncedForRef.current.total === key.total
    ) return;
    syncedForRef.current = key;
    supabase.from("quotes").update({ total_amount: rounded }).eq("id", q.data.id).then(({ error }) => {
      if (error) {
        toast.error("Összérték szinkron", { description: humanizeSupabaseError(error) });
        return;
      }
      qc.invalidateQueries({ queryKey: ["quotes", "detail", id] });
    });
  }, [netSum, q.data, items.isLoading, qc, id]);

  if (q.isLoading) return <div className="p-6 text-sm text-muted-foreground">Ajánlat betöltése…</div>;
  if (q.error || !q.data) {
    return (
      <div className="p-6">
        <EmptyState icon={FileText} title="Az ajánlat nem található" description={(q.error as any)?.message} />
      </div>
    );
  }
  const quote = q.data;

  const companyId = lead.data?.company_id ?? project.data?.company_id ?? null;

  const saveStatus = (next: string) => {
    if (next === (quote.status ?? "")) return;
    upsert.mutate({ id: quote.id, status: next });
  };
  const toggleCurrent = async (checked: boolean) => {
    try {
      if (checked && quote.lead_id) {
        // Csak egy aktuális verzió leadenként — a többit lekapcsoljuk.
        const off = await supabase.from("quotes")
          .update({ is_current: false })
          .eq("lead_id", quote.lead_id)
          .neq("id", quote.id);
        if (off.error) throw off.error;
      }
      const on = await supabase.from("quotes").update({ is_current: checked }).eq("id", quote.id);
      if (on.error) throw on.error;
      qc.invalidateQueries({ queryKey: ["quotes"] });
      toast.success(checked ? "Aktuális verzió" : "Verzió inaktiválva");
    } catch (e: any) {
      toast.error("Nem sikerült frissíteni", { description: humanizeSupabaseError(e) });
    }
  };

  return (
    <div className="flex flex-col">
      {/* Fejléc */}
      <div className="border-b bg-background px-6 py-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Ajánlat</div>
        <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold">
          {quote.version != null ? `v${quote.version}` : `#${String(quote.id).slice(0, 8)}`}
          <Badge variant={quote.is_current ? "default" : "secondary"}>
            {statusLabel(quote.status)}
          </Badge>
          {quote.is_current && <Badge variant="outline">aktuális</Badge>}
        </h1>
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
          <span>
            Projekt:{" "}
            {quote.project_id ? (
              <Link to="/projects/$id" params={{ id: quote.project_id }} className="text-primary hover:underline">
                <Briefcase className="mr-1 inline h-3.5 w-3.5" />
                {projectLabel(quote.project_id)}
              </Link>
            ) : "—"}
          </span>
          <span>Létrejött: {fmtDateTime(quote.created_at)}</span>
        </div>
      </div>

      <div className="grid gap-4 p-6 lg:grid-cols-[1fr_320px]">
        {/* Bal: fő szerkesztő */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Alap adatok</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="q-status">Státusz</Label>
                <Select value={quote.status ?? "draft"} onValueChange={saveStatus}>
                  <SelectTrigger id="q-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Automatikusan mentődik. A `sent` státusz idejét jelenleg nem tároljuk el (hiányzó mező).
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label>Verzió</Label>
                <div className="flex h-9 items-center rounded-md border bg-muted/30 px-3 text-sm tabular-nums">
                  v{quote.version ?? 1}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    id="q-current"
                    checked={!!quote.is_current}
                    onCheckedChange={toggleCurrent}
                  />
                  <Label htmlFor="q-current" className="text-sm">Ez az aktuális verzió</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" /> Ajánlat tételek
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuoteItemsPanel quoteId={quote.id} />
            </CardContent>
          </Card>
        </div>

        {/* Jobb: összesítő + kontextus */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Összegzés</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <Row label="Tételek száma" value={String((items.data ?? []).length)} />
              <Row label="Nettó összeg" value={formatHuf(netSum)} />
              <Row
                label="Mentett összérték"
                value={quote.total_amount != null ? formatHuf(Number(quote.total_amount)) : "—"}
              />
              <p className="pt-2 text-[11px] text-muted-foreground">
                Az összérték automatikusan szinkronizál a tételekkel. ÁFA / kedvezmény / előleg
                jelenleg nem tárolható (lásd a Sprint 1 utáni migrációs listát).
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <BellRing className="h-4 w-4" /> Utókövetések
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(followups.data ?? []).length === 0 ? (
                <div className="text-sm text-muted-foreground">Nincs utókövetés.</div>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {(followups.data ?? []).map((f: any) => (
                    <li key={f.id} className="flex justify-between gap-2">
                      <span className="truncate">{f.followup_type ?? "—"} · {f.result ?? ""}</span>
                      <span className="tabular-nums text-muted-foreground">{fmtDateTime(f.due_date)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}