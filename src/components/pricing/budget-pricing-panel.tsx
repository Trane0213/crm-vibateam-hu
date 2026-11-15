import { openLines, pricingComplete } from "@/lib/pricing/completeness";
import { pricingSettingsSummary, type QuotePricingSettings } from "@/lib/quotes/pricing-settings";
import { Fragment, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Calculator, CheckCircle2, Download, FileSpreadsheet, Loader2, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHuf } from "@/lib/format";
import { priceReceivedBudget } from "@/lib/pricing/pricing.functions";
import { uploadQuoteDocument } from "@/lib/quotes/quote-document-upload";
import type { LineDto } from "@/lib/pricing/pricing-dto";
import { LINE_STATUS_LABEL, pricingCsv, STATUS_FILTERS, type StatusFilter } from "@/lib/pricing/pricing-view";

type Mode = "subcontractor_labor" | "full_construction";
const MODE_LABEL: Record<Mode, string> = { subcontractor_labor: "Alvállalkozói munkadíj (anyag nélkül)", full_construction: "Teljes kivitelezés (anyag + munkadíj)" };
const PAGE = 100;

function download(bytes: Uint8Array | string, name: string, type: string) {
  const blob = new Blob([typeof bytes === "string" ? bytes : new Uint8Array(bytes)], { type });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const fromB64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const huf2 = (n: number) => `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(n)} Ft`;

/**
 * P3 — Kapott költségvetés árazása: determinisztikus számítás az eredeti Excel szerkezetében,
 * tételes forrás- és számítási nyomvonallal, ellenőrzött TERVEZET-letöltéssel. Nem ment és nem küld.
 */
export function BudgetPricingPanel({ quoteId, scopeType, locked, onUseNet, settings }: { quoteId: string; scopeType: string | null; locked: boolean; onUseNet: (net: number) => void; settings: QuotePricingSettings }) {
  const run = useServerFn(priceReceivedBudget);
  const qc = useQueryClient();
  const docs = useQuery({
    queryKey: ["quote_documents", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", quoteId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const budgets = (docs.data ?? []).filter((d) => ["unpriced_budget", "priced_budget"].includes(d.document_type) && /\.(xlsx|xlsm|xls)$/i.test(String(d.name ?? "")));
  const [docId, setDocId] = useState<string>("");
  const selectedDoc = docId || budgets.find((d) => d.document_type === "unpriced_budget")?.id || budgets[0]?.id || "";
  const [mode, setMode] = useState<Mode>(settings.mode ?? (scopeType === "material_labor" ? "full_construction" : "subcontractor_labor"));
  const [policy, setPolicy] = useState<"as_quoted" | "rate_scaled">("as_quoted");
  const [template, setTemplate] = useState<{ name: string; base64: string } | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all"), [page, setPage] = useState(0), [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const calc = useMutation({
    mutationFn: async () => {
      const res = await run({ data: { quoteId, documentId: selectedDoc, mode, includeReference: true, template, adjustments: [], buildWorkbook: true,
        // Óradíj, tartalék, haszon és kerekítés: az ajánlat mentett árazási beállításából (a szerver olvassa be).
        overrides: { historicalLaborPolicy: policy } } });
      if (!res.ok) throw new Error(res.error);
      return res;
    },
    onSuccess: () => { setPage(0); setOpen(null); },
    onError: (e: Error) => toast.error("Az árazás nem futott le", { description: e.message }),
  });
  const r = calc.data;
  const lines = useMemo(() => (r?.lines ?? []).filter((l) => STATUS_FILTERS[filter].includes(l.status)), [r, filter]);

  const pickTemplate = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) { toast.error("Az ársablon legfeljebb 2 MB lehet."); return; }
    const buf = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    setTemplate({ name: f.name, base64: btoa(s) });
  };
  // Az árazott TERVEZET mentése az ajánlat dokumentumai közé (egyetlen feltöltési útvonal), csapat-átnézéshez.
  const savePriced = useMutation({
    mutationFn: async () => {
      const x = calc.data; const e = x?.summary.exportResult;
      if (!x?.workbookBase64 || e?.status !== "verified") throw new Error("Nincs mentható, visszaellenőrzött árazott Excel.");
      if ((docs.data ?? []).some((d) => d.document_type === "priced_budget" && d.name === e.fileName)) throw new Error("Ez a fájlnév már szerepel az ajánlat dokumentumai között — előbb töröld vagy nevezd át a régit.");
      await uploadQuoteDocument(quoteId, new File([fromB64(x.workbookBase64)], e.fileName, { type: XLSX_MIME }), "priced_budget");
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["quote_documents", quoteId] }); void qc.invalidateQueries({ queryKey: ["documents"] }); toast.success("Árazott Excel elmentve az ajánlat dokumentumai közé (Árazott költségvetés)."); },
    onError: (e: Error) => toast.error("Mentés sikertelen", { description: e.message }),
  });
  const emptyTemplate = async () => { const { buildPriceTemplateWorkbook } = await import("@/lib/pricing/template-import"); download(buildPriceTemplateWorkbook(), "VIBA_arsablon_ures.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); };

  const t = r?.summary.totals, ex = r?.summary.exportResult;
  return (
    <section className="space-y-4 border-b py-5" aria-labelledby="budget-pricing-title">
      <div className="flex flex-col gap-1">
        <h2 id="budget-pricing-title" className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4" /> Költségvetés árazása</h2>
        <p className="text-xs text-muted-foreground">A megrendelő Excelét az eredeti szerkezetében árazzuk. Árat a rendszer nem talál ki: ahol nincs ellenőrizhető ár, azt neked kell megadnod.</p>
        <ol className="mt-1 grid gap-1.5 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-3" aria-label="Az árazás menete">
          <li><span className="font-semibold">1. Számítás</span> — beárazza, amire van ellenőrizhető ár, és megmutatja, mi hiányzik.</li>
          <li><span className="font-semibold">2. Hiányzó árak</span> — töltsd le a „Kitöltendő ártáblát”, írd be az egységárakat Excelben, majd töltsd vissza és számolj újra.</li>
          <li><span className="font-semibold">3. Árazott Excel</span> — letöltheted átnézésre, vagy elmentheted az ajánlathoz, hogy a csapat is lássa.</li>
        </ol>
        <p className="text-xs text-muted-foreground">Timothy a számítás eredményét átnézi, felsorolja a hiányzó és bizonytalan tételeket, és tételes módosítást számol (pl. „+10% az elosztókra”). Az Excel-fájlt nem ő írja: azt a fenti Számítás készíti el.</p>
      </div>

      {docs.isLoading ? <p className="text-sm text-muted-foreground">Dokumentumok betöltése…</p>
        : !budgets.length ? <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nincs Excel költségvetés ennél az ajánlatnál. Az 1. lépésben „Árazatlan költségvetés” típussal töltsd fel.</p>
        : (<>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>Költségvetés</Label>
              <Select value={selectedDoc} onValueChange={setDocId}>
                <SelectTrigger aria-label="Árazandó költségvetés"><SelectValue /></SelectTrigger>
                <SelectContent>{budgets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}{d.document_type === "priced_budget" ? " (árazott)" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Árazási mód</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <SelectTrigger aria-label="Árazási mód"><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(MODE_LABEL) as Mode[]).map((m) => <SelectItem key={m} value={m}>{MODE_LABEL[m]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Korábbi VIBA-díj kezelése</Label>
              <Select value={policy} onValueChange={(v) => setPolicy(v as typeof policy)}>
                <SelectTrigger aria-label="Korábbi díj kezelése"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="as_quoted">Változatlanul (ellenőrizhető)</SelectItem><SelectItem value="rate_scaled">Óradíjra skálázva (5 800 Ft-os feltételezett alapról — becslés)</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Árazási beállítás: {pricingSettingsSummary(settings)}. Módosítás a lépés tetején, az „Árazási beállítás” kártyán.</p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickTemplate(f); if (fileRef.current) fileRef.current.value = ""; }} />
            <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Kitöltött ártábla / ársablon feltöltése</Button>
            {template && <Badge variant="secondary" className="gap-1">{template.name}<button type="button" aria-label="Ársablon eltávolítása" onClick={() => setTemplate(null)}><X className="h-3 w-3" /></button></Badge>}
            <Button type="button" variant="ghost" size="sm" onClick={() => void emptyTemplate()}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Üres ársablon letöltése</Button>
            <Button type="button" size="sm" className="ml-auto" disabled={!selectedDoc || calc.isPending} onClick={() => calc.mutate()}>
              {calc.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Calculator className="mr-1.5 h-4 w-4" />} Számítás
            </Button>
          </div>
        </>)}

      {r && t && ex && (
        <div className="space-y-4" aria-live="polite">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Tételsor", t.lines], ["Árazva", t.byStatus.priced], ["Ellenőrizendő", t.byStatus.review + t.byStatus.blocked + t.byStatus.excluded_review], ["Nincs forrás", t.byStatus.missing]].map(([k, v]) => (
              <div key={k as string} className="rounded-md border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-semibold tabular-nums">{v}</p></div>))}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Anyag (nettó)</p><p className="font-semibold tabular-nums">{formatHuf(t.materialHuf)}</p></div>
            <div className="rounded-md border p-2"><p className="text-xs text-muted-foreground">Munkadíj (nettó)</p><p className="font-semibold tabular-nums">{formatHuf(t.laborHuf)}</p></div>
            <div className="rounded-md border border-primary/40 bg-primary/5 p-2"><p className="text-xs text-muted-foreground">{pricingComplete(t, ex.status) ? "Teljes nettó összeg" : "Részösszeg (csak az árazott tételek)"}</p><p className="font-semibold tabular-nums">{formatHuf(t.netHuf)}</p></div>
          </div>
          <p className="text-xs text-muted-foreground">Értéknap {r.summary.asOf} · HUF · nettó · {MODE_LABEL[r.summary.profile.mode as Mode]} · {t.byStatus.zero_qty} db 0 mennyiségű, {t.byStatus.existing_price} db már árazott sor nem változott. Fájl: {r.summary.file.name} (SHA-256 {r.summary.file.sha256.slice(0, 12)}…)</p>

          {ex.status === "verified"
            ? <div className="flex items-start gap-2 rounded-md border border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10 p-3 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div>
                <p className="font-medium">{pricingComplete(t, ex.status) ? "Az árazott Excel elkészült és visszaellenőrizve" : "Részben árazott Excel elkészült"}</p>
                <p className="text-xs text-muted-foreground">{ex.writtenCells} árcella írva, az összegképletek újraszámolva, váratlan változás nincs. Az eredeti fájl változatlan.{pricingComplete(t, ex.status) ? " Kiküldés előtt nézd át." : ` ${openLines(t)} tétel még ár nélküli vagy ellenőrizendő — ezek az Excelben üresen maradtak; átnézésre letölthető, ügyfélnek így nem küldhető.`}</p></div></div>
            : <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><div>
                <p className="font-medium">{t.byStatus.priced === 0 ? "Még egyetlen tételnek sincs ára — árazott Excel ezért még nem készült" : "Árazott Excel nem adható ki"}</p>
                {t.byStatus.priced === 0 && r.fillTemplate && <p className="text-xs">Töltsd le a „Kitöltendő ártáblát” ({r.fillTemplate.rows} tétel), írd be az árakat, töltsd vissza, és nyomd meg újra a Számítást.</p>}
                <ul className="mt-1 list-disc pl-4 text-xs">{("reasons" in ex ? ex.reasons : []).slice(0, 8).map((x) => <li key={x}>{x}</li>)}</ul></div></div>}
          {r.summary.structure.layouts.some((l) => l.inferred.length || l.ambiguous.length) && (
            <ul className="list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">{r.summary.structure.layouts.flatMap((l) => [...l.inferred, ...l.ambiguous].map((x) => <li key={l.sheet + x}>{l.sheet}: {x}</li>))}</ul>)}
          {r.template && r.template.issues.length > 0 && <details className="text-xs"><summary className="cursor-pointer">Ársablon: {r.template.items} ár beolvasva, {r.template.issues.length} megjegyzés</summary><ul className="list-disc pl-4">{r.template.issues.slice(0, 30).map((i) => <li key={`${i.row}${i.message}`}>{i.row ? `${i.row}. sor: ` : ""}{i.message}</li>)}</ul></details>}

          <div className="flex flex-wrap gap-2">
            {r.fillTemplate && <Button size="sm" variant={ex.status === "verified" ? "outline" : "default"} onClick={() => download(fromB64(r.fillTemplate!.base64), r.fillTemplate!.fileName, XLSX_MIME)}><FileSpreadsheet className="mr-1.5 h-4 w-4" /> Kitöltendő ártábla ({r.fillTemplate.rows} tétel)</Button>}
            {ex.status === "verified" && r.workbookBase64 && <Button size="sm" onClick={() => download(fromB64(r.workbookBase64!), ex.fileName, XLSX_MIME)}><Download className="mr-1.5 h-4 w-4" /> {pricingComplete(t, ex.status) ? "Árazott Excel letöltése" : "Árazott Excel letöltése (hiányos)"}</Button>}
            {ex.status === "verified" && r.workbookBase64 && <Button size="sm" variant="outline" disabled={locked || savePriced.isPending} onClick={() => savePriced.mutate()}>{savePriced.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Mentés az ajánlathoz</Button>}
            <Button size="sm" variant="outline" onClick={() => download(pricingCsv(r.lines), `${r.summary.file.name.replace(/\.[^.]+$/, "")}_VIBA_BELSO_ellenorzes.csv`, "text/csv;charset=utf-8")}><Download className="mr-1.5 h-4 w-4" /> Belső ellenőrzési lista (CSV)</Button>
            {pricingComplete(t, ex.status) ? <Button size="sm" variant="ghost" disabled={locked} onClick={() => { onUseNet(Math.round(t.netHuf)); toast.success("Nettó összeg átvéve — a Mentés gombbal rögzítheted."); }}>Nettó átvétele az ajánlat összegébe</Button>
              : <p className="self-center text-xs text-muted-foreground">Részösszeg — nem vehető át ajánlati összegként, amíg {openLines(t)} tétel ár nélküli vagy ellenőrizendő.</p>}
          </div>

          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Tételsorok szűrése">
            {(Object.keys(STATUS_FILTERS) as StatusFilter[]).map((f) => {
              const n = (r.lines ?? []).filter((l) => STATUS_FILTERS[f].includes(l.status)).length;
              return <Button key={f} role="tab" aria-selected={filter === f} size="sm" variant={filter === f ? "secondary" : "ghost"} onClick={() => { setFilter(f); setPage(0); }}>{LINE_STATUS_LABEL[f]} ({n})</Button>;
            })}
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Sor</th><th className="p-2 text-left">Megnevezés</th><th className="p-2 text-right">Menny.</th><th className="p-2 text-left">ME</th><th className="p-2 text-right">Egységár</th><th className="p-2 text-right">Összeg</th><th className="p-2 text-left">Állapot</th></tr></thead>
              <tbody>
                {lines.slice(page * PAGE, (page + 1) * PAGE).map((l) => (
                  <Fragment key={l.key}>
                    <tr className="cursor-pointer border-t hover:bg-muted/30" onClick={() => setOpen(open === l.key ? null : l.key)} aria-expanded={open === l.key}>
                      <td className="p-2 text-xs tabular-nums text-muted-foreground">{l.sheet}!{l.row}</td>
                      <td className="max-w-[340px] p-2"><span className="line-clamp-2">{l.name}</span></td>
                      <td className="p-2 text-right tabular-nums">{l.qty ?? "—"}</td><td className="p-2">{l.unit ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums">{l.unitSellHuf == null ? "—" : formatHuf(l.unitSellHuf)}</td>
                      <td className="p-2 text-right tabular-nums">{l.lineTotalHuf == null ? "—" : formatHuf(l.lineTotalHuf)}</td>
                      <td className="p-2"><Badge variant={l.status === "priced" ? "default" : l.status === "missing" ? "outline" : "secondary"}>{LINE_STATUS_LABEL[l.status]}</Badge></td>
                    </tr>
                    {open === l.key && <tr className="border-t bg-muted/20"><td colSpan={7} className="p-3"><LineTrace line={l} /></td></tr>}
                  </Fragment>))}
                {!lines.length && <tr><td colSpan={7} className="p-4 text-center text-sm text-muted-foreground">Nincs ilyen állapotú tételsor.</td></tr>}
              </tbody>
            </table>
          </div>
          {lines.length > PAGE && <div className="flex items-center justify-end gap-2 text-xs"><Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Előző</Button><span>{page + 1} / {Math.ceil(lines.length / PAGE)}</span><Button size="sm" variant="ghost" disabled={(page + 1) * PAGE >= lines.length} onClick={() => setPage(page + 1)}>Következő</Button></div>}
        </div>
      )}
    </section>
  );
}

function LineTrace({ line }: { line: LineDto }) {
  return (
    <div className="grid gap-3 text-xs sm:grid-cols-2">
      {line.reasons.length > 0 && <ul className="list-disc pl-4 sm:col-span-2">{line.reasons.map((x) => <li key={x}>{x}</li>)}</ul>}
      {(["material", "labor"] as const).map((k) => { const c = line[k]; if (!c) return null; return (
        <div key={k} className="space-y-1">
          <p className="font-medium">{k === "material" ? "Anyag" : "Munkadíj"}{c.unitHuf != null ? ` — ${formatHuf(c.unitHuf)}/ME` : ""}</p>
          {c.source && <p className="text-muted-foreground">Forrás: {c.source.label} · {c.source.name.slice(0, 120)}{c.source.file ? ` · ${c.source.file}${c.source.row ? ` #${c.source.row}` : ""}` : ""}{c.source.date ? ` · ${c.source.date}` : ""}{c.category ? ` · egyezés: ${c.category} (${c.score})` : ""}</p>}
          {c.steps.length > 0 && <ol className="list-decimal pl-4">{c.steps.map((s, i) => <li key={i}>{s.label}{s.huf != null ? `: ${huf2(s.huf)}` : ""}</li>)}</ol>}
          {c.status !== "priced" && c.candidates.length > 0 && <p className="text-muted-foreground">Jelöltek: {c.candidates.map((x) => `${x.name.slice(0, 60)} (${x.unitPriceHuf ?? "—"} Ft, ${x.score})`).join(" · ")}</p>}
        </div>); })}
      {line.writes.length > 0 && <p className="text-muted-foreground sm:col-span-2">Írt cellák: {line.writes.map((w) => `${w.address}=${w.valueHuf}`).join(", ")}</p>}
    </div>
  );
}
