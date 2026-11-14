import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calculator, Download, FileInput, ListChecks, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { humanizeSupabaseError, useListWhere, useUpsert } from "@/lib/db-hooks";
import { formatHuf } from "@/lib/format";
import {
  BAND_LABEL, DEFAULT_COMMERCIAL, HOUSE_CONTENT, MODE_LABEL, PRIORITY_SECTION, PROFILE_LABEL, QTY_LABEL, SCENARIO_LABEL, SOURCE_LABEL, STATUS_LABEL,
  calculateVibaOffer, emptyProfile, type Band, type CalcInput, type CalcResult, type Commercial, type CustomInput, type HourlyInput, type HouseInput,
  type LineInput, type LineStatus, type OfferMode, type OfferProfile, type ProfileInput, type QtyStatus, type Rate,
} from "@/lib/viba-offer/calc-model";
import { decodeImport } from "@/lib/viba-offer/calc-schema";
import { planQuoteItems, scopeTexts, type ExistingItem } from "@/lib/viba-offer/item-plan";
import { extractVbfDefects } from "@/lib/viba-offer/vbf-extract";
import { calcCsv } from "@/lib/viba-offer/calc-view";

type Drafts = { active: OfferProfile; mode: OfferMode; commercial: Commercial; split: boolean; profiles: Record<OfferProfile, ProfileInput> };
const PROFILES: OfferProfile[] = ["house_sqm", "hourly", "custom"];
const parseNum = (s: string) => { const t = s.trim().replace(/\s/g, "").replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };
const newId = (p: string, list: { id: string }[]) => { let i = list.length + 1; while (list.some((x) => x.id === `${p}${i}`)) i++; return `${p}${i}`; };
const STATUS_TONE: Record<LineStatus, string> = {
  priced: "border-[color:var(--status-success)]/50 text-[color:var(--status-success)]", estimated: "border-[color:var(--status-warning)]/50 text-[color:var(--status-warning)]",
  review: "border-[color:var(--status-warning)]/50 text-[color:var(--status-warning)]", missing_price: "border-destructive/50 text-destructive", unknown_qty: "border-destructive/50 text-destructive",
  blocked: "border-destructive/50 text-destructive", zero_qty: "text-muted-foreground", excluded_mode: "text-muted-foreground",
};

function initialDrafts(scopeType: string | null): Drafts {
  return { active: "house_sqm", mode: scopeType === "labor_only" ? "labor_only" : "material_labor", commercial: DEFAULT_COMMERCIAL, split: true,
    profiles: { house_sqm: emptyProfile("house_sqm"), hourly: emptyProfile("hourly"), custom: emptyProfile("custom") } };
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function NumField({ id, label, value, onChange, placeholder, suffix }: { id: string; label: string; value: number | null; onChange: (v: number | null) => void; placeholder?: string; suffix?: string }) {
  const [s, setS] = useState(value == null ? "" : String(value));
  const n = parseNum(s);
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">{label}{suffix ? ` (${suffix})` : ""}</Label>
      <Input id={id} inputMode="decimal" value={s} placeholder={placeholder ?? "—"} aria-invalid={Number.isNaN(n)}
        onChange={(e) => { setS(e.target.value); const v = parseNum(e.target.value); if (!Number.isNaN(v)) onChange(v); }} />
    </div>
  );
}
function Pick<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger id={id} aria-label={label} className="min-w-0 [&>span]:truncate"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}
function TextField({ id, label, value, onChange, placeholder, area }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; area?: boolean }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {area ? <Textarea id={id} rows={2} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} maxLength={1000} />
        : <Input id={id} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} maxLength={200} />}
    </div>
  );
}
function Check({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label htmlFor={id} className="flex items-center gap-2 text-sm"><Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} />{label}</label>;
}

/** Díj megadása: összeg + eladási/önköltség + forrás + kötelező forrásmegjegyzés. Üres összeg = nincs díj (hiányzó ár). */
function RateField({ id, label, value, onChange }: { id: string; label: string; value: Rate | null | undefined; onChange: (v: Rate | null) => void }) {
  const [huf, setHuf] = useState(value?.huf ?? null);
  const [basis, setBasis] = useState<Rate["basis"]>(value?.basis ?? "sell");
  const [source, setSource] = useState<Rate["source"]>(value?.source ?? "manual");
  const [note, setNote] = useState(value?.note ?? "");
  const emit = (p: Partial<{ huf: number | null; basis: Rate["basis"]; source: Rate["source"]; note: string }>) => {
    const n = { huf, basis, source, note, ...p };
    onChange(n.huf == null || n.huf <= 0 ? null : { huf: n.huf, basis: n.basis, source: n.source, note: n.note });
  };
  return (
    <fieldset className="@container rounded-md border p-2">
      <legend className="px-1 text-xs font-medium">{label}</legend>
      <div className="grid gap-2 @sm:grid-cols-2 @2xl:grid-cols-4">
      <NumField id={`${id}-huf`} label="Díj" suffix="Ft, nettó" value={huf} onChange={(v) => { setHuf(v); emit({ huf: v }); }} placeholder="nincs megadva" />
      <Pick id={`${id}-basis`} label="Alap" value={basis} options={[["sell", "Eladási ár"], ["cost", "Önköltség"]]} onChange={(v) => { setBasis(v); emit({ basis: v }); }} />
      <Pick id={`${id}-src`} label="Forrás" value={source} options={Object.entries(SOURCE_LABEL) as [Rate["source"], string][]} onChange={(v) => { setSource(v); emit({ source: v }); }} />
      <TextField id={`${id}-note`} label="Forrás megjegyzés (kötelező)" value={note} placeholder="pl. Ramon 2026-11, ajánlat #…" onChange={(v) => { setNote(v); emit({ note: v }); }} />
      </div>
    </fieldset>
  );
}

function LinesEditor<T extends LineInput>({ idPrefix, title, lines, onChange, make, extra }: { idPrefix: string; title: string; lines: T[]; onChange: (l: T[]) => void; make: (id: string) => T; extra?: (l: T, set: (p: Partial<T>) => void) => ReactNode }) {
  const set = (i: number, p: Partial<T>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...p } : l)));
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><h4 className="text-sm font-medium">{title}</h4>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...lines, make(newId(idPrefix, lines))])}><Plus className="mr-1 h-4 w-4" />Tétel</Button></div>
      {lines.length === 0 && <p className="text-xs text-muted-foreground">Nincs tétel.</p>}
      {lines.map((l, i) => (
        <div key={l.id} className="@container space-y-2 rounded-md border p-2">
          <div className="grid gap-2 @lg:grid-cols-6">
            <div className="@lg:col-span-2"><TextField id={`${idPrefix}-${l.id}-name`} label="Megnevezés (ügyfél látja)" value={l.name} onChange={(v) => set(i, { name: v } as Partial<T>)} /></div>
            <TextField id={`${idPrefix}-${l.id}-unit`} label="Egység" value={l.unit} onChange={(v) => set(i, { unit: v } as Partial<T>)} />
            <NumField id={`${idPrefix}-${l.id}-qty`} label="Mennyiség" value={l.qty} onChange={(v) => set(i, { qty: v } as Partial<T>)} />
            <Pick id={`${idPrefix}-${l.id}-qs`} label="Mennyiség forrása" value={l.qtyStatus} options={Object.entries(QTY_LABEL) as [QtyStatus, string][]} onChange={(v) => set(i, { qtyStatus: v } as Partial<T>)} />
            <div className="flex items-end justify-end"><Button type="button" size="icon" variant="ghost" aria-label={`${l.name || "Tétel"} törlése`} onClick={() => onChange(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
          </div>
          {extra?.(l, (p) => set(i, p))}
          <div className="grid gap-2 @3xl:grid-cols-2">
            <RateField id={`${idPrefix}-${l.id}-mat`} label="Anyag egységár" value={l.material} onChange={(v) => set(i, { material: v } as Partial<T>)} />
            <RateField id={`${idPrefix}-${l.id}-lab`} label="Munkadíj egységár" value={l.labor} onChange={(v) => set(i, { labor: v } as Partial<T>)} />
          </div>
        </div>
      ))}
    </div>
  );
}
const blankLine = (id: string): LineInput => ({ id, name: "", unit: "db", qty: null, qtyStatus: "unknown", material: null, labor: null });

function HouseForm({ p, set }: { p: HouseInput; set: (x: Partial<HouseInput>) => void }) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 @lg:grid-cols-4">
        <NumField id="h-area" label="Alapterület" suffix="m²" value={p.areaM2} onChange={(v) => set({ areaM2: v })} />
        <Pick id="h-area-st" label="Alapterület forrása" value={p.areaStatus} options={Object.entries(QTY_LABEL) as [QtyStatus, string][]} onChange={(v) => set({ areaStatus: v })} />
        <TextField id="h-pkg" label="VIBA csomag neve" value={p.packageLabel} placeholder="pl. Alap" onChange={(v) => set({ packageLabel: v })} />
        <TextField id="h-ver" label="Csomag változata" value={p.packageVersion} placeholder="pl. 2026/1" onChange={(v) => set({ packageVersion: v })} />
      </div>
      <div className="grid gap-2 @lg:grid-cols-3">
        {HOUSE_CONTENT.map((c) => <Pick key={c.key} id={`h-c-${c.key}`} label={c.label} value={p.content[c.key] ?? "unknown"} options={[["included", "Benne van"], ["excluded", "Nincs benne"], ["unknown", "Nincs eldöntve"]]} onChange={(v) => set({ content: { ...p.content, [c.key]: v } })} />)}
      </div>
      <div className="grid gap-3 @lg:grid-cols-2">
        <TextField id="h-cond" area label="A m²-ár feltételei (kötelező)" value={p.conditionsNote} placeholder="pl. új építés, nyers falazat, max. X kiállás/m², 1 szint" onChange={(v) => set({ conditionsNote: v })} />
        <TextField id="h-excl" area label="További kizárások" value={p.exclusionsNote} onChange={(v) => set({ exclusionsNote: v })} />
      </div>
      <Check id="h-plan" label="Részletes villamos terv rendelkezésre áll" checked={p.detailedPlan} onChange={(v) => set({ detailedPlan: v })} />
      <div className="grid gap-2 @3xl:grid-cols-2">
        <RateField id="h-mat" label="Anyag díja (Ft/m²)" value={p.materialPerM2} onChange={(v) => set({ materialPerM2: v })} />
        <RateField id="h-lab" label="Munkadíj (Ft/m²)" value={p.laborPerM2} onChange={(v) => set({ laborPerM2: v })} />
      </div>
      <LinesEditor idPrefix="hx" title="Többlettételek" lines={p.extras} onChange={(extras) => set({ extras })} make={blankLine} />
    </div>
  );
}

function HourlyForm({ p, set }: { p: HourlyInput; set: (x: Partial<HourlyInput>) => void }) {
  const hasBand = (b: Band) => p.bands.some((x) => x.band === b);
  const setBand = (b: Band, patch: Partial<HourlyInput["bands"][number]>) => set({ bands: p.bands.map((x) => (x.band === b ? { ...x, ...patch } : x)) });
  return (
    <div className="space-y-3">
      <TextField id="o-period" label="Elszámolási időszak / szerződés" value={p.period} placeholder="pl. 2026. december, keretszerződés szerint" onChange={(v) => set({ period: v })} />
      <div className="space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Szerepkörök és óradíjak</h4>
          <Button type="button" size="sm" variant="outline" onClick={() => set({ roles: [...p.roles, { id: newId("r", p.roles), label: "", headcount: 1, rate: null }] })}><Plus className="mr-1 h-4 w-4" />Szerepkör</Button></div>
        {p.roles.map((r, i) => (
          <div key={r.id} className="grid gap-2 rounded-md border p-2 @md:grid-cols-[1fr_6rem_auto]">
            <TextField id={`o-${r.id}-label`} label="Szerepkör" value={r.label} onChange={(v) => set({ roles: p.roles.map((x, j) => (j === i ? { ...x, label: v } : x)) })} />
            <NumField id={`o-${r.id}-hc`} label="Létszám" value={r.headcount} onChange={(v) => set({ roles: p.roles.map((x, j) => (j === i ? { ...x, headcount: v ?? 0 } : x)) })} />
            <div className="flex items-end"><Button type="button" size="icon" variant="ghost" aria-label="Szerepkör törlése" onClick={() => set({ roles: p.roles.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></div>
            <div className="@md:col-span-3"><RateField id={`o-${r.id}-rate`} label="Óradíj (Ft/óra/fő)" value={r.rate} onChange={(v) => set({ roles: p.roles.map((x, j) => (j === i ? { ...x, rate: v } : x)) })} /></div>
          </div>
        ))}
      </div>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Munkaidő (óra/fő)</h4>
        {(["workday", "night", "weekend"] as Band[]).map((b) => {
          const x = p.bands.find((y) => y.band === b);
          return (
            <div key={b} className="grid gap-2 rounded-md border p-2 @lg:grid-cols-4">
              <div className="flex items-end"><Check id={`o-band-${b}`} label={BAND_LABEL[b]} checked={hasBand(b)} onChange={(v) => set({ bands: v ? [...p.bands, { band: b, hours: null, qtyStatus: "unknown", surchargePct: null }] : p.bands.filter((y) => y.band !== b) })} /></div>
              {x && <>
                <NumField id={`o-${b}-h`} label="Óra/fő" value={x.hours} onChange={(v) => setBand(b, { hours: v })} />
                <Pick id={`o-${b}-st`} label="Óraszám" value={x.qtyStatus} options={Object.entries(QTY_LABEL) as [QtyStatus, string][]} onChange={(v) => setBand(b, { qtyStatus: v })} />
                {b !== "workday" ? <NumField id={`o-${b}-s`} label="Felár" suffix="%" value={x.surchargePct} onChange={(v) => setBand(b, { surchargePct: v })} placeholder="szerződés szerint" /> : <div />}
              </>}
            </div>
          );
        })}
      </div>
      <div className="grid gap-3 @lg:grid-cols-3">
        <NumField id="o-visits" label="Kiszállások száma" value={p.visits} onChange={(v) => set({ visits: v ?? 0 })} />
        <NumField id="o-min" label="Minimális időkeret" suffix="óra/kiszállás" value={p.minHoursPerVisit} onChange={(v) => set({ minHoursPerVisit: v })} placeholder="nincs" />
        <div className="space-y-2 pt-5">
          <Check id="o-urg" label="Sürgősségi felár" checked={p.urgency.include} onChange={(v) => set({ urgency: { ...p.urgency, include: v } })} />
          {p.urgency.include && <NumField id="o-urg-pct" label="Sürgősségi felár" suffix="%" value={p.urgency.pct} onChange={(v) => set({ urgency: { ...p.urgency, pct: v } })} />}
        </div>
      </div>
      <div className="space-y-2 rounded-md border p-2">
        <Check id="o-travel" label="Kiszállási / útdíj" checked={p.travel.include} onChange={(v) => set({ travel: { ...p.travel, include: v } })} />
        {p.travel.include && <div className="grid gap-2 @lg:grid-cols-2">
          <Pick id="o-travel-u" label="Egység" value={p.travel.unit} options={[["alkalom", "alkalom"], ["km", "km"]]} onChange={(v) => set({ travel: { ...p.travel, unit: v } })} />
          <NumField id="o-travel-q" label="Mennyiség" value={p.travel.qty} onChange={(v) => set({ travel: { ...p.travel, qty: v } })} />
          <div className="@lg:col-span-2"><RateField id="o-travel-r" label="Kiszállási díj" value={p.travel.rate} onChange={(v) => set({ travel: { ...p.travel, rate: v } })} /></div>
        </div>}
      </div>
      <Check id="o-mat" label="A szerződés megengedi az anyag külön elszámolását" checked={p.materialsAllowed} onChange={(v) => set({ materialsAllowed: v })} />
      <LinesEditor idPrefix="ox" title="Anyag és egyéb tételek" lines={p.extras} onChange={(extras) => set({ extras })} make={blankLine} />
    </div>
  );
}

function CustomForm({ p, set }: { p: CustomInput; set: (x: Partial<CustomInput>) => void }) {
  const [text, setText] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const extract = () => {
    const r = extractVbfDefects(text);
    setNotes(r.notes);
    if (!r.defects.length) { toast.message("Nem találtam hibapontot"); return; }
    const linked = new Set(p.tasks.map((t) => t.defectId).filter(Boolean));
    const keep = p.defects.filter((d) => linked.has(d.id));
    const fresh = r.defects.filter((d) => !keep.some((k) => k.text === d.text)).map((d, i) => ({ id: newId("d", [...keep, ...r.defects.slice(0, i).map((x, j) => ({ id: `d${keep.length + j + 1}` }))]), ref: d.ref, text: d.text, priority: d.priority, evidence: `${d.evidence}${d.priorityReason ? `; sürgősség: ${d.priorityReason}` : ""}` }));
    set({ defects: [...keep, ...fresh] });
    toast.success(`${r.defects.length} hibapont kinyerve — ellenőrizd a besorolást`);
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 @lg:grid-cols-3">
        <Pick id="c-scn" label="Forgatókönyv" value={p.scenario} options={Object.entries(SCENARIO_LABEL) as [CustomInput["scenario"], string][]} onChange={(v) => set({ scenario: v })} />
        <div className="flex items-end"><Check id="c-survey" label="Helyszíni bejárás megtörtént" checked={p.surveyDone} onChange={(v) => set({ surveyDone: v })} /></div>
        <TextField id="c-survey-note" label="Bejárás (dátum, résztvevő)" value={p.surveyNote} onChange={(v) => set({ surveyNote: v })} />
      </div>
      <div className="space-y-2 rounded-md border p-2">
        <Label htmlFor="c-vbf" className="text-xs">VBF-jegyzőkönyv / feladatlista szövege (beillesztés)</Label>
        <Textarea id="c-vbf" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="1. A pinceelosztóban hiányzik a védővezető…" maxLength={200000} />
        <Button type="button" size="sm" variant="outline" disabled={!text.trim()} onClick={extract}><Wand2 className="mr-1 h-4 w-4" />Hibapontok kinyerése</Button>
        {notes.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Hibapontok ({p.defects.length})</h4>
          <Button type="button" size="sm" variant="outline" onClick={() => set({ defects: [...p.defects, { id: newId("d", p.defects), ref: String(p.defects.length + 1), text: "", priority: "unknown" }] })}><Plus className="mr-1 h-4 w-4" />Hibapont</Button></div>
        {p.defects.map((d, i) => (
          <div key={d.id} className="grid gap-2 rounded-md border p-2 @xl:grid-cols-[5rem_1fr_12rem_auto]">
            <TextField id={`c-${d.id}-ref`} label="Pont" value={d.ref} onChange={(v) => set({ defects: p.defects.map((x, j) => (j === i ? { ...x, ref: v } : x)) })} />
            <TextField id={`c-${d.id}-text`} label="Hiba" value={d.text} onChange={(v) => set({ defects: p.defects.map((x, j) => (j === i ? { ...x, text: v } : x)) })} />
            <Pick id={`c-${d.id}-pr`} label="Sürgősség" value={d.priority} options={Object.entries(PRIORITY_SECTION) as [CustomInput["defects"][number]["priority"], string][]} onChange={(v) => set({ defects: p.defects.map((x, j) => (j === i ? { ...x, priority: v } : x)) })} />
            <div className="flex items-end"><Button type="button" size="icon" variant="ghost" aria-label="Hibapont törlése" onClick={() => set({ defects: p.defects.filter((_, j) => j !== i), tasks: p.tasks.map((t) => (t.defectId === d.id ? { ...t, defectId: null } : t)) })}><Trash2 className="h-4 w-4" /></Button></div>
            {d.evidence && <p className="text-xs text-muted-foreground @xl:col-span-4">Bizonyíték: {d.evidence}</p>}
          </div>
        ))}
      </div>
      <LinesEditor idPrefix="ct" title="Javítási tételek" lines={p.tasks} onChange={(tasks) => set({ tasks })} make={(id) => ({ ...blankLine(id), defectId: null })}
        extra={(l, s) => <Pick id={`ct-${l.id}-def`} label="Hibapont" value={l.defectId ?? "__none"} options={[["__none", "Nincs (egyéb munka)"], ...p.defects.map((d) => [d.id, `${d.ref}. ${d.text.slice(0, 50)}`] as [string, string])]} onChange={(v) => s({ defectId: v === "__none" ? null : v } as never)} />} />
      <div className="grid gap-2 @3xl:grid-cols-2">
        <div className="space-y-2 rounded-md border p-2">
          <Check id="c-fee" label="Helyszíni felmérés és kiszállás díja" checked={p.surveyFee.include} onChange={(v) => set({ surveyFee: { ...p.surveyFee, include: v } })} />
          {p.surveyFee.include && <><NumField id="c-fee-q" label="Alkalom" value={p.surveyFee.qty} onChange={(v) => set({ surveyFee: { ...p.surveyFee, qty: v } })} />
            <RateField id="c-fee-r" label="Felmérési díj" value={p.surveyFee.rate} onChange={(v) => set({ surveyFee: { ...p.surveyFee, rate: v } })} /></>}
        </div>
        <div className="space-y-2 rounded-md border p-2">
          <Check id="c-meas" label="Javítás utáni mérés és dokumentálás" checked={p.measurement.include} onChange={(v) => set({ measurement: { ...p.measurement, include: v } })} />
          {p.measurement.include && <><NumField id="c-meas-q" label="Alkalom" value={p.measurement.qty} onChange={(v) => set({ measurement: { ...p.measurement, qty: v } })} />
            <TextField id="c-meas-n" label="Mérések tartalma" value={p.measurement.note} onChange={(v) => set({ measurement: { ...p.measurement, note: v } })} />
            <RateField id="c-meas-r" label="Mérés díja" value={p.measurement.rate} onChange={(v) => set({ measurement: { ...p.measurement, rate: v } })} /></>}
        </div>
      </div>
      <div className="grid gap-3 @lg:grid-cols-2">
        <div className="flex items-end"><Check id="c-expert" label="Jogosult felülvizsgáló (VBF) szükséges" checked={p.expertRequired} onChange={(v) => set({ expertRequired: v })} /></div>
        <TextField id="c-outage" label="Áramszünet (várható időtartam)" value={p.outageNote} onChange={(v) => set({ outageNote: v })} />
      </div>
    </div>
  );
}

function ResultView({ r, acks, setAcks }: { r: CalcResult; acks: string[]; setAcks: (a: string[]) => void }) {
  const c = r.commercial;
  return (
    <div className="space-y-3">
      {r.issues.length > 0 && <ul className="space-y-1 text-sm">{r.issues.map((i) => <li key={i.text} className={i.level === "blocking" ? "text-destructive" : i.level === "warning" ? "text-[color:var(--status-warning)]" : "text-muted-foreground"}>{i.level === "blocking" ? "Blokkoló: " : i.level === "warning" ? "Figyelem: " : ""}{i.text}</li>)}</ul>}
      <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border bg-muted/30 p-3 text-sm">
        <span>Nettó: <strong className="tabular-nums">{formatHuf(r.totals.netHuf)}</strong>{r.totals.openLines ? " (nem teljes)" : ""}</span>
        <span>Anyag: <span className="tabular-nums">{formatHuf(r.totals.materialHuf)}</span></span>
        <span>Munkadíj: <span className="tabular-nums">{formatHuf(r.totals.laborHuf)}</span></span>
        {r.totals.reviewHuf > 0 && <span className="text-[color:var(--status-warning)]">Ebből nem igazolt referencia: <span className="tabular-nums">{formatHuf(r.totals.reviewHuf)}</span></span>}
        <span className="text-muted-foreground">Azonosító: {r.calcId}</span>
      </div>
      {c.costBasisSellHuf > 0 && <div className="rounded-md border p-3 text-xs">
        <p className="font-medium">Belső: önköltség-alapú sorok (ügyfélnek nem kerül ki)</p>
        <p className="mt-1 tabular-nums">Önköltség {formatHuf(c.costHuf)} + tartalék {formatHuf(c.contingencyHuf)} → eladási {formatHuf(c.costBasisSellHuf)}; haszon {formatHuf(c.profitHuf)} · fedezet {c.marginBp == null ? "—" : `${(c.marginBp / 100).toFixed(2)}%`} (haszon/eladási ár) · árrés {c.markupBp == null ? "—" : `${(c.markupBp / 100).toFixed(2)}%`} (haszon/önköltség)</p>
        {c.sellBasisHuf > 0 && <p className="text-muted-foreground">Eladási áron megadott sorok ({formatHuf(c.sellBasisHuf)}) fedezete nem számolható — önköltség nincs megadva.</p>}
      </div>}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground"><tr><th className="p-2">Munkarész / tétel</th><th className="p-2 text-right">Menny.</th><th className="p-2 text-right">Egységár</th><th className="p-2 text-right">Összeg</th><th className="p-2">Állapot</th></tr></thead>
          <tbody>{r.lines.map((l) => (
            <tr key={l.id} className="border-t align-top">
              <td className="p-2"><div className="text-xs text-muted-foreground">{l.section}</div><div className="font-medium">{l.name}</div>
                <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Számítás</summary><ul className="mt-1 list-disc pl-4">{[...l.trace, ...l.issues].map((t) => <li key={t}>{t}</li>)}</ul></details></td>
              <td className="p-2 text-right tabular-nums">{l.qty ?? "?"} {l.unit}<div className="text-xs text-muted-foreground">{QTY_LABEL[l.qtyStatus]}</div></td>
              <td className="p-2 text-right tabular-nums">{l.unitHuf ? formatHuf(l.unitHuf) : "—"}</td>
              <td className="p-2 text-right tabular-nums font-medium">{l.totalHuf ? formatHuf(l.totalHuf) : "—"}</td>
              <td className="p-2"><Badge variant="outline" className={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                {l.status === "review" && <div className="mt-1"><Check id={`ack-${l.id}`} label="Referenciadíjat tudomásul veszem" checked={acks.includes(l.id)} onChange={(v) => setAcks(v ? [...acks, l.id] : acks.filter((a) => a !== l.id))} /></div>}</td>
            </tr>))}</tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * P6 — saját VIBA-ajánlat kalkulációs profiljai (családi ház m², rezsióradíj, egyedi/VBF). A meglévő `quote_items`
 * tételekbe ír a felhasználó gombnyomására (meglévő mentési út, RLS); PDF, verzió és Gmail-kiküldés változatlan.
 * A munkapéldány csak ezen az eszközön, a felhasználó saját kulcsán marad (tartós kalkulációs verzió tulajdonosi döntésre vár).
 */
export function VibaOfferCalcPanel({ quoteId, locked, scopeType, onApplyScope }: { quoteId: string; locked: boolean; scopeType: string | null; onApplyScope: (s: { technicalScope: string; exclusions: string }) => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const storageKey = user?.id ? `viba-offer-calc:v1:${user.id}:${quoteId}` : null;
  const [d, setD] = useState<Drafts>(() => initialDrafts(scopeType));
  const [formKey, setFormKey] = useState(0);
  const [acks, setAcks] = useState<string[]>([]);
  const [acceptPartial, setAcceptPartial] = useState(false);
  const [importText, setImportText] = useState("");
  const [writing, setWriting] = useState(false);
  const items = useListWhere<ExistingItem & { id: string }>("quote_items", "quote_id", quoteId, { order: "created_at", ascending: true });
  const upsert = useUpsert("quote_items");

  useEffect(() => {
    if (!storageKey) return;
    try { const raw = localStorage.getItem(storageKey); if (raw) { const v = JSON.parse(raw) as Drafts; if (v?.profiles?.house_sqm && v.profiles.hourly && v.profiles.custom) { setD(v); setFormKey((k) => k + 1); } } } catch { /* sérült munkapéldány: üres indulás */ }
  }, [storageKey]);
  useEffect(() => { if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(d)); } catch { /* tárhely tele */ } }, [storageKey, d]);

  const input: CalcInput = { mode: d.mode, commercial: d.commercial, profile: d.profiles[d.active] };
  const calc = useMemo(() => { try { return { r: calculateVibaOffer(input), error: null as string | null }; } catch (e) { return { r: null, error: e instanceof Error ? e.message : "Hibás beállítás" }; } }, [JSON.stringify(input)]);
  const plan = useMemo(() => (calc.r ? planQuoteItems(calc.r, items.data ?? [], { split: d.split, acknowledgedReview: acks, acceptPartial, locked }) : null), [calc.r, items.data, d.split, acks, acceptPartial, locked]);
  const setProfile = (patch: Partial<ProfileInput>) => setD((x) => ({ ...x, profiles: { ...x.profiles, [x.active]: { ...x.profiles[x.active], ...patch } as ProfileInput } }));
  const setCommercial = (patch: Partial<Commercial>) => setD((x) => ({ ...x, commercial: { ...x.commercial, ...patch } }));

  const write = async () => {
    if (!plan?.canWrite) return;
    setWriting(true);
    let done = 0;
    try {
      for (const row of plan.rows) {
        await upsert.mutateAsync({ quote_id: quoteId, section: row.section, name: row.name, quantity: row.quantity, unit: row.unit, unit_price: row.unit_price });
        done++;
      }
      toast.success(`${done} tétel az ajánlatba került`);
    } catch (e) {
      toast.error(`${done}/${plan.rows.length} tétel került be: ${humanizeSupabaseError(e)} — az újrafuttatás a már beírt tételeket kihagyja.`);
    } finally {
      setWriting(false);
      qc.invalidateQueries({ queryKey: ["quote_items"] });
      qc.invalidateQueries({ queryKey: ["quotes"] });
    }
  };
  const loadImport = () => {
    try {
      const i = decodeImport(importText);
      setD((x) => ({ ...x, active: i.profile.profile, mode: i.mode, commercial: i.commercial, profiles: { ...x.profiles, [i.profile.profile]: i.profile } }));
      setFormKey((k) => k + 1); setAcks([]); setImportText("");
      toast.success("Javaslat betöltve — ellenőrizd a díjakat és forrásokat");
    } catch (e) { toast.error(e instanceof Error ? e.message : "A javaslat nem tölthető be"); }
  };
  const scope = calc.r ? scopeTexts(calc.r) : null;
  const u = d.commercial.uplift;

  return (
    <section className="@container min-w-0 space-y-4 rounded-lg border p-4" aria-labelledby="viba-calc-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="viba-calc-title" className="flex items-center gap-2 text-sm font-semibold"><Calculator className="h-4 w-4" />Kalkuláció</h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">Díjat, felárat és csomagtartalmat a rendszer nem talál ki: csak a megadott, forrással jelölt díjakkal számol. Jóváhagyott VIBA-ártörzs még nincs. A munkapéldány csak ezen az eszközön marad meg.</p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => { if (confirm("Az aktuális profil minden adata törlődik ebben a munkapéldányban. Folytatod?")) { setD((x) => ({ ...x, profiles: { ...x.profiles, [x.active]: emptyProfile(x.active) } })); setFormKey((k) => k + 1); setAcks([]); } }}>Profil ürítése</Button>
      </div>
      <div className="grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
        <Pick id="calc-profile" label="Kalkulációs profil" value={d.active} options={PROFILES.map((p) => [p, PROFILE_LABEL[p]])} onChange={(v) => { setD((x) => ({ ...x, active: v })); setAcks([]); }} />
        <Pick id="calc-mode" label="Árazási mód" value={d.mode} options={Object.entries(MODE_LABEL) as [OfferMode, string][]} onChange={(v) => setD((x) => ({ ...x, mode: v }))} />
        <Pick id="calc-uplift" label="Önköltségre" value={u.kind} options={[["none", "Nincs (csak eladási árak)"], ["markup", "Árrés (haszon / önköltség)"], ["margin", "Fedezet (haszon / eladási ár)"]]}
          onChange={(k) => setCommercial({ uplift: k === "none" ? { kind: "none" } : { kind: k, pct: u.kind === "none" ? 0 : u.pct } })} />
        {u.kind !== "none" ? <NumField key={`up-${formKey}-${u.kind}`} id="calc-uplift-pct" label={u.kind === "markup" ? "Árrés" : "Fedezet"} suffix="%" value={u.pct} onChange={(v) => setCommercial({ uplift: { kind: u.kind, pct: v ?? 0 } })} /> : <div />}
        <NumField key={`ct-${formKey}`} id="calc-cont" label="Tartalék önköltségre" suffix="%" value={d.commercial.contingencyPct} onChange={(v) => setCommercial({ contingencyPct: v ?? 0 })} />
        <NumField key={`rs-${formKey}`} id="calc-round" label="Egységár kerekítése" suffix="Ft" value={d.commercial.roundingStepHuf} onChange={(v) => setCommercial({ roundingStepHuf: v ?? 1 })} />
        <Pick id="calc-round-mode" label="Kerekítés iránya" value={d.commercial.roundingMode} options={[["half_up", "Matematikai"], ["up", "Felfelé"], ["down", "Lefelé"]]} onChange={(v) => setCommercial({ roundingMode: v })} />
      </div>

      <div key={`${d.active}-${formKey}`}>
        {d.active === "house_sqm" && <HouseForm p={d.profiles.house_sqm as HouseInput} set={setProfile} />}
        {d.active === "hourly" && <HourlyForm p={d.profiles.hourly as HourlyInput} set={setProfile} />}
        {d.active === "custom" && <CustomForm p={d.profiles.custom as CustomInput} set={setProfile} />}
      </div>

      <div className="border-t pt-4">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4" />Eredmény</h3>
        {calc.error && <p className="text-sm text-destructive">{calc.error}</p>}
        {calc.r && <ResultView r={calc.r} acks={acks} setAcks={setAcks} />}
      </div>

      {calc.r && plan && <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center gap-4">
          <Check id="calc-split" label="Anyag és munkadíj külön tételsorban" checked={d.split} onChange={(v) => setD((x) => ({ ...x, split: v }))} />
          {calc.r.totals.openLines > 0 && <Check id="calc-partial" label="Tudomásul veszem: a nem árazható sorok kimaradnak" checked={acceptPartial} onChange={setAcceptPartial} />}
        </div>
        <ul className="text-xs text-muted-foreground">
          <li>Új tétel az ajánlatba: <strong className="text-foreground">{plan.rows.length}</strong> ({formatHuf(plan.netHuf)})</li>
          {plan.duplicates.length > 0 && <li>Már az ajánlaton (kimarad): {plan.duplicates.length}</li>}
          {plan.conflicts.length > 0 && <li className="text-[color:var(--status-warning)]">Azonos névvel, eltérő tartalommal már szerepel — nem írjuk felül: {plan.conflicts.map((c) => c.name).join("; ")}</li>}
          {plan.skipped.map((s) => <li key={s.lineId}>Kimarad: {s.name} — {s.reason}</li>)}
          {plan.blockers.map((b) => <li key={b} className="text-destructive">{b}</li>)}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={!plan.canWrite || writing || locked} onClick={write}><Plus className="mr-1 h-4 w-4" />Tételek hozzáadása az ajánlathoz ({plan.rows.length})</Button>
          <Button type="button" size="sm" variant="outline" disabled={!scope || scope.leaks.length > 0 || locked} onClick={() => { if (scope) { onApplyScope(scope); toast.success("Lehatárolás átvéve — mentsd az Árazási alapadatoknál"); } }}>Lehatárolás átvétele</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => download(calcCsv(calc.r!), `VIBA_belso_kalkulacio_${calc.r!.calcId}.csv`)}><Download className="mr-1 h-4 w-4" />Belső számítás (CSV)</Button>
        </div>
        {scope && scope.leaks.length > 0 && <p className="text-xs text-destructive">A lehatárolásban belső kifejezés van ({scope.leaks.join(", ")}) — javítsd a szöveget.</p>}
        <p className="text-xs text-muted-foreground">A tételek a meglévő „Tételek” listába kerülnek; onnan a meglévő PDF, verzió és Gmail-kiküldés működik. Meglévő tételt nem módosít és nem töröl.</p>
      </div>}

      <details className="border-t pt-3">
        <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><FileInput className="h-4 w-4" />Timothy-javaslat betöltése</summary>
        <div className="mt-2 space-y-2">
          <Textarea aria-label="Timothy-javaslat kódja" rows={3} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder="VIBA-KALK-1:{…}" />
          <Button type="button" size="sm" variant="outline" disabled={!importText.trim()} onClick={loadImport}>Betöltés</Button>
          <p className="text-xs text-muted-foreground">Timothy a kalkulációt ugyanezzel a motorral számolja; a kód betöltése csak kitölti az űrlapot, semmit nem ír az ajánlatba.</p>
        </div>
      </details>
    </section>
  );
}
