import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ClipboardList, Download, FileSearch, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatHuf } from "@/lib/format";
import { reviewPlans } from "@/lib/plans/plan-review.functions";
import type { PlanReviewDto } from "@/lib/plans/plan-review-dto";
import { CABINET_STATUS_LABEL, COST_STATUS_LABEL, planReviewCsv, SEVERITY_LABEL } from "@/lib/plans/plan-review-view";
import { DOC_TYPE_LABEL } from "@/lib/plans/sheet-identify";
import { FINDING_LABEL } from "@/lib/plans/scope-check";
import { COST_CATEGORY_LABEL } from "@/lib/plans/cabinet-pricing";
import { DEVICE_LABEL } from "@/lib/plans/cabinet-bom";

type Mode = "subcontractor_labor" | "full_construction";
type Tab = "drawings" | "cabinets" | "findings" | "questions";
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const NORMS: { key: string; label: string }[] = [
  { key: "mcb", label: "Kismegszakító (óra/db)" }, { key: "rcd", label: "RCD / RCBO (óra/db)" }, { key: "other", label: "Egyéb készülék (óra/db)" },
  { key: "enclosureAssemblyHours", label: "Szekrénytest, sínek (óra)" }, { key: "testDocHoursPerCabinet", label: "Teszt + dokumentáció (óra)" },
  { key: "siteMountHoursPerCabinet", label: "Helyszíni felszerelés (óra)" }, { key: "siteFeederHoursPerCabinet", label: "Betáp bekötése (óra)" },
  { key: "siteOutgoingHoursPerCircuit", label: "Elmenő bekötése (óra/áramkör)" }, { key: "siteMeasurementHoursPerCabinet", label: "Mérés, beüzemelés (óra)" },
];
const OTHER_CLASSES = ["main_switch", "spd", "contactor", "switch", "terminal", "busbar", "fuse", "relay", "meter", "other"];

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * P4 — Tervellenőrzés és szekrénykalkuláció: tervjel/lap/revízió, feldolgozottság, elosztó-BOM, költségnemenkénti
 * kalkuláció, eltéréslista és kérdések. Csak olvas és számol; nem ment, nem küld.
 */
export function PlanReviewPanel({ quoteId, scopeType }: { quoteId: string; scopeType: string | null }) {
  const run = useServerFn(reviewPlans);
  const docs = useQuery({
    queryKey: ["quote_documents", quoteId],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", quoteId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const budgets = (docs.data ?? []).filter((d) => ["unpriced_budget", "priced_budget"].includes(d.document_type) && /\.(xlsx|xlsm|xls)$/i.test(String(d.name ?? "")));
  const plans = (docs.data ?? []).filter((d) => !["unpriced_budget", "priced_budget", "sent_offer"].includes(d.document_type));
  const [budgetId, setBudgetId] = useState<string>("auto");
  const selectedBudget = budgetId === "auto" ? budgets.find((d) => d.document_type === "unpriced_budget")?.id ?? budgets[0]?.id ?? null : budgetId === "none" ? null : budgetId;
  const [mode, setMode] = useState<Mode>(scopeType === "material_labor" ? "full_construction" : "subcontractor_labor");
  const [rate, setRate] = useState("6500"), [contingency, setContingency] = useState("0"), [margin, setMargin] = useState("");
  const [norms, setNorms] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>("cabinets"), [cat, setCat] = useState<string>("all");

  const calc = useMutation({
    mutationFn: async () => {
      const dev: Record<string, number> = {};
      const nv = (k: string) => num(norms[k] ?? "");
      if (nv("mcb") != null) dev.mcb = nv("mcb")!;
      if (nv("rcd") != null) { dev.rcd = nv("rcd")!; dev.rcbo = nv("rcd")!; }
      if (nv("other") != null) for (const c of OTHER_CLASSES) dev[c] = nv("other")!;
      const rules = { assemblyHoursPerDevice: dev, enclosureAssemblyHours: nv("enclosureAssemblyHours"), testDocHoursPerCabinet: nv("testDocHoursPerCabinet"), siteMountHoursPerCabinet: nv("siteMountHoursPerCabinet"),
        siteFeederHoursPerCabinet: nv("siteFeederHoursPerCabinet"), siteOutgoingHoursPerCircuit: nv("siteOutgoingHoursPerCircuit"), siteMeasurementHoursPerCabinet: nv("siteMeasurementHoursPerCabinet") };
      const res = await run({ data: { quoteId, budgetDocumentId: selectedBudget, mode, overrides: { laborRateHuf: num(rate), contingencyPct: num(contingency) ?? 0, marginPct: num(margin) }, rules, adjustments: [], clarifications: [], template: null } });
      if (!res.ok) throw new Error(res.error);
      return res.review;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "A tervellenőrzés nem futtatható."),
  });
  const r: PlanReviewDto | undefined = calc.data;

  return (
    <section className="space-y-4 border-b py-5" aria-labelledby="plan-review-title">
      <div className="flex flex-col gap-1">
        <h2 id="plan-review-title" className="flex items-center gap-2 text-sm font-semibold"><FileSearch className="h-4 w-4" /> Tervellenőrzés és szekrénykalkuláció</h2>
        <p className="text-xs text-muted-foreground">A feltöltött tervekből tervjelet, lapot, revíziót és elosztó-anyaglistát olvas, összeveti a költségvetéssel, és kérdéslistát készít. Szekrényár anyag / gyártás / helyszíni bekötés bontásban, csak bizonyított adatokból. Nem ment, nem küld.</p>
      </div>
      {docs.isLoading ? <p className="text-sm text-muted-foreground">Dokumentumok betöltése…</p> : (<>
        {!plans.length && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nincs tervdokumentum ennél az ajánlatnál. Az 1. lépésben „Műszaki terv” vagy „Műszaki leírás” típussal töltsd fel (PDF), vagy csatolj tervcsomagot.</p>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Költségvetés az összevetéshez</Label>
            <Select value={budgetId} onValueChange={setBudgetId}>
              <SelectTrigger aria-label="Költségvetés az összevetéshez"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Automatikus ({budgets.find((d) => d.id === selectedBudget)?.name ?? "nincs"})</SelectItem>
                <SelectItem value="none">Költségvetés nélkül</SelectItem>
                {budgets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label>Árazási mód</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <SelectTrigger aria-label="Tervellenőrzés árazási mód"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="subcontractor_labor">Alvállalkozói munkadíj (anyag nélkül)</SelectItem><SelectItem value="full_construction">Teljes kivitelezés (anyag + munkadíj)</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5"><Label htmlFor="pr-rate">Óradíj (Ft/óra)</Label><Input id="pr-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pr-cont">Tartalék %</Label><Input id="pr-cont" inputMode="decimal" value={contingency} onChange={(e) => setContingency(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pr-margin">Célfedezet % (anyagra)</Label><Input id="pr-margin" inputMode="decimal" placeholder="—" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
        </div>
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Gyártási és szerelési normaórák (feltételezés)</summary>
          <p className="mt-1 text-xs text-muted-foreground">Jóváhagyott VIBA-norma még nincs a rendszerben. Üresen hagyva a munkasorok „norma hiányzik” állapotúak; megadott érték felhasználói feltételezésként, becslésnek jelölve számol.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">{NORMS.map((n) => <div key={n.key} className="grid gap-1"><Label htmlFor={`pr-n-${n.key}`} className="text-xs">{n.label}</Label><Input id={`pr-n-${n.key}`} inputMode="decimal" placeholder="—" value={norms[n.key] ?? ""} onChange={(e) => setNorms({ ...norms, [n.key]: e.target.value })} /></div>)}</div>
        </details>
        <div className="flex justify-end"><Button type="button" size="sm" disabled={calc.isPending} onClick={() => calc.mutate()}>{calc.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileSearch className="mr-1.5 h-4 w-4" />} Tervellenőrzés futtatása</Button></div>
      </>)}

      {r && (
        <div className="space-y-3" aria-live="polite">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[["Fájl", r.matrix.length], ["Tervjel", r.drawings.length], ["Elosztó", r.cabinets.length], ["Észrevétel", r.findingsTotal]].map(([k, v]) => <div key={k as string} className="rounded-md border p-2"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-semibold tabular-nums">{v}</p></div>)}
          </div>
          {!r.completeness.allTextRead && <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Nem minden terv olvasható teljesen (lásd Tervlapok) — a vizsgálat részleges.</div>}
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Tervellenőrzés nézetei">
            {([["cabinets", `Elosztók (${r.cabinets.length})`], ["findings", `Eltérések (${r.findingsTotal})`], ["questions", `Kérdések (${r.questions.length})`], ["drawings", `Tervlapok (${r.matrix.length})`]] as [Tab, string][]).map(([k, l]) =>
              <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "secondary" : "ghost"} onClick={() => setTab(k)}>{l}</Button>)}
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => download(planReviewCsv(r), `tervellenorzes_${r.asOf}_VIBA_BELSO.csv`)}><Download className="mr-1.5 h-4 w-4" /> Belső lista (CSV)</Button>
          </div>

          {tab === "drawings" && (
            <div className="space-y-3">
              <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Fájl</th><th className="p-2 text-left">Állapot</th><th className="p-2 text-right">Olvasható oldal</th><th className="p-2 text-left">Megjegyzés</th></tr></thead>
                <tbody>{r.matrix.map((m) => <tr key={m.fileId} className="border-t"><td className="p-2">{m.fileName}</td><td className="p-2"><Badge variant={m.status === "full" ? "default" : "secondary"}>{m.label}</Badge></td><td className="p-2 text-right tabular-nums">{m.readablePages}/{m.pages}</td><td className="p-2 text-xs text-muted-foreground">{m.reasons.join(" ")}</td></tr>)}</tbody>
              </table></div>
              <div className="overflow-x-auto rounded-md border"><table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Fájl / oldal</th><th className="p-2 text-left">Tervjel</th><th className="p-2 text-left">Lap</th><th className="p-2 text-left">Revízió / dátum</th><th className="p-2 text-left">Típus</th><th className="p-2 text-left">Cím</th></tr></thead>
                <tbody>{r.pages.map((p) => <tr key={`${p.fileId}:${p.page}`} className="border-t"><td className="p-2 text-xs">{p.fileName} · {p.page}. o.</td><td className="p-2">{p.drawingNo ? <span title={p.drawingNo.evidence.snippet}>{p.drawingNo.value} <span className="text-xs text-muted-foreground">({p.drawingNo.confidence === "high" ? "biztos" : p.drawingNo.confidence === "medium" ? "valószínű" : "gyenge"})</span></span> : "—"}</td><td className="p-2 tabular-nums">{p.sheetNo ?? "—"}{p.sheetTotal ? `/${p.sheetTotal}` : ""}</td><td className="p-2 text-xs">{p.revision?.value ?? "—"} {p.date?.value ?? ""}</td><td className="p-2 text-xs">{DOC_TYPE_LABEL[p.docType as keyof typeof DOC_TYPE_LABEL]}</td><td className="max-w-[260px] p-2 text-xs"><span className="line-clamp-2">{p.title ?? "—"}</span></td></tr>)}</tbody>
              </table></div>
            </div>)}

          {tab === "cabinets" && (r.cabinets.length ? r.cabinets.map((c) => { const e = r.estimates.find((x) => x.cabinetId === c.id)!; return (
            <div key={c.id} className="space-y-2 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{c.id} elosztó</p><Badge variant={c.status === "bom_complete" ? "default" : "secondary"}>{CABINET_STATUS_LABEL[c.status]}</Badge><span className="text-xs text-muted-foreground">{c.drawingNos.join(", ")} {c.title ? `· ${c.title}` : ""}</span></div>
              {c.enclosure && <p className="text-xs"><span className="text-muted-foreground">Szekrénytest:</span> {c.enclosure.description}</p>}
              <div className="grid gap-2 sm:grid-cols-4">
                {(["materialHuf", "assemblyHuf", "siteHuf"] as const).map((k, i) => <div key={k} className="rounded-md border p-2"><p className="text-xs text-muted-foreground">{[COST_CATEGORY_LABEL.material, COST_CATEGORY_LABEL.assembly, COST_CATEGORY_LABEL.site][i]}</p><p className="font-semibold tabular-nums">{formatHuf(e.totals[k])}</p></div>)}
                <div className={`rounded-md border p-2 ${e.totals.complete ? "border-primary/40 bg-primary/5" : "border-destructive/40 bg-destructive/5"}`}><p className="text-xs text-muted-foreground">{e.totals.complete ? "Teljes szekrényár (nettó)" : "Részösszeg — NEM teljes szekrényár"}</p><p className="font-semibold tabular-nums">{e.totals.complete ? formatHuf(e.totals.fullPriceHuf ?? 0) : formatHuf(e.totals.pricedHuf)}</p></div>
              </div>
              {!e.totals.complete && <ul className="list-disc pl-4 text-xs text-muted-foreground">{e.totals.blockReasons.map((x) => <li key={x}>{x}</li>)}</ul>}
              {c.reconciliation.length > 0 && <ul className="space-y-0.5 text-xs">{c.reconciliation.map((x) => <li key={x.cls} className={x.ok === false ? "text-destructive" : "text-muted-foreground"}>{DEVICE_LABEL[x.cls]}: {x.note}</li>)}</ul>}
              <details><summary className="cursor-pointer text-sm">Anyagjegyzék és kalkuláció ({e.lines.length} sor)</summary>
                <div className="mt-2 overflow-x-auto rounded-md border"><table className="w-full min-w-[720px] text-sm">
                  <thead className="bg-muted/50 text-xs text-muted-foreground"><tr><th className="p-2 text-left">Költségnem</th><th className="p-2 text-left">Megnevezés</th><th className="p-2 text-right">Menny.</th><th className="p-2 text-right">Egységár</th><th className="p-2 text-right">Összeg</th><th className="p-2 text-left">Állapot / ok</th></tr></thead>
                  <tbody>{e.lines.map((l) => <tr key={l.id} className="border-t align-top"><td className="p-2 text-xs">{COST_CATEGORY_LABEL[l.category]}</td><td className="max-w-[300px] p-2"><span className="line-clamp-2">{l.description}</span>{l.evidence[0] && <span className="block text-xs text-muted-foreground">{l.evidence[0].fileName} · {l.evidence[0].page}. o.</span>}</td><td className="p-2 text-right tabular-nums">{l.qty ?? "—"} {l.unit}</td><td className="p-2 text-right tabular-nums">{l.unitHuf == null ? "—" : formatHuf(l.unitHuf)}</td><td className="p-2 text-right tabular-nums">{l.totalHuf == null ? "—" : formatHuf(l.totalHuf)}</td><td className="p-2 text-xs"><Badge variant={l.status === "priced" ? "default" : "secondary"}>{COST_STATUS_LABEL[l.status]}</Badge> <span className="text-muted-foreground">{l.reasons.slice(0, 2).join(" ")}</span></td></tr>)}</tbody>
                </table></div></details>
            </div>); }) : <p className="text-sm text-muted-foreground">Nem találtam elosztótervet („… jelű elosztó” címmel) a feldolgozott tervekben.</p>)}

          {tab === "findings" && (<div className="space-y-2">
            <div className="flex flex-wrap gap-1">{["all", ...Object.keys(FINDING_LABEL)].map((k) => <Button key={k} size="sm" variant={cat === k ? "secondary" : "ghost"} onClick={() => setCat(k)}>{k === "all" ? "Mind" : FINDING_LABEL[k as keyof typeof FINDING_LABEL]} ({k === "all" ? r.findings.length : r.findings.filter((f) => f.category === k).length})</Button>)}</div>
            {r.findings.filter((f) => cat === "all" || f.category === cat).map((f) => <div key={f.id} className="rounded-md border p-2 text-sm">
              <div className="flex flex-wrap items-center gap-2"><Badge variant={f.severity === "high" ? "destructive" : "secondary"}>{SEVERITY_LABEL[f.severity]}</Badge><Badge variant="outline">{FINDING_LABEL[f.category]}</Badge><span className="font-medium">{f.title}</span></div>
              {f.rows.length > 0 && <p className="mt-1 text-xs text-muted-foreground">Tételsor: {f.rows.map((x) => `${x.key} ${x.name}`).join("; ")}</p>}
              {f.evidence.length > 0 && <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">{f.evidence.slice(0, 3).map((x, i) => <li key={i}>{x.kind === "budget" ? "Költségvetés" : x.kind === "email" ? "E-mail" : "Terv"}: {x.fileName ?? x.ref}{x.page ? ` · ${x.page}. o.` : ""} — „{x.snippet}”</li>)}</ul>}
              <p className="mt-1 text-xs">{f.impact}</p>
            </div>)}
          </div>)}

          {tab === "questions" && (<div className="space-y-2">
            <ol className="list-decimal space-y-1 pl-5 text-sm">{r.questions.map((q) => <li key={q}>{q}</li>)}</ol>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(r.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")); toast.success("Kérdéslista vágólapra másolva — küldés csak a meglévő levelező felületről."); }}><ClipboardList className="mr-1.5 h-4 w-4" /> Kérdések másolása</Button>
          </div>)}
          <ul className="list-disc pl-4 text-xs text-muted-foreground">{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>)}
    </section>
  );
}
