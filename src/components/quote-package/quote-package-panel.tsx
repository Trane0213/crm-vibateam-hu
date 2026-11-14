import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, CircleDashed, Download, FileCheck2, Loader2, PackageCheck, Save, Send, ShieldCheck, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/use-permissions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatHuf } from "@/lib/format";
import { quoteNetOf } from "@/lib/contract/contract-prep";
import { prepareQuotePackageFn } from "@/lib/quote-package/package.functions";
import type { PackageDto } from "@/lib/quote-package/package-dto";
import {
  ACK_LABEL, diffPackages, handoffAllowed, linkageGates, prepareApproval, requiredAcks, SCOPE_SECTION_LABEL, versionDiff,
  type ApprovalAck, type ApprovalPrep, type Gate, type PackageSnapshot, type ScopeSections, type SavedVersion,
} from "@/lib/quote-package/package-model";
import { uploadQuoteDocument } from "@/lib/quotes/quote-document-upload";
import type { SendDraft } from "@/components/quotes/quote-send-panel";

type Mode = "subcontractor_labor" | "full_construction";
type Tab = "scope" | "questions" | "missing" | "letter" | "changes";
type QuoteLike = { id: string; group_id?: string | null; alternative_key?: string | null; version: number | null; title: string | null; locked_at?: string | null; manual_net_amount?: number | null; total_amount?: number | null; tax_percent?: number | null;
  technical_scope?: string | null; exclusions?: string | null; valid_until?: string | null; notes?: string | null; status: string | null; scope_type?: string | null };
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const num = (s: string) => (s.trim() === "" ? undefined : Number(s.replace(",", ".")));
const bytesOf = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function download(data: Uint8Array | string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([typeof data === "string" ? data : new Uint8Array(data)], { type })), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const csv = (rows: (string | number | null)[][]) => "\ufeff" + rows.map((r) => r.map((c) => { const s = c == null ? "" : String(c); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(";")).join("\r\n");
const snapshot = (p: PackageDto, gates: Gate[]): PackageSnapshot => ({ fingerprint: p.fingerprint, offerNetHuf: p.offerNetHuf, lines: p.lines, scope: p.scope, gates: gates.map((g) => ({ key: g.key, label: g.label, ok: g.ok })) });

function GateRow({ g }: { g: Gate }) {
  return <li className="flex items-start gap-2 py-1 text-sm">
    {g.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-success)]" /> : g.blocking ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--status-warning)]" />}
    <div className="min-w-0"><span className={g.ok ? "" : g.blocking ? "font-medium" : ""}>{g.label}</span>{!g.ok && !g.blocking && <span className="ml-1 text-xs text-muted-foreground">(nem kötelező{g.needsAck ? ", nyugtázandó" : ""})</span>}
      {!g.ok && g.hint && <p className="text-xs text-muted-foreground">{g.hint}</p>}</div>
  </li>;
}

/**
 * P5 — Ajánlatcsomag: egy gombbal árazott TERVEZET Excel (P3), tervellenőrzésből lehatárolás, hiányjegyzék és kérdéslista (P4),
 * kísérőlevél-tervezet. Mentés csak kifejezett gombnyomásra a meglévő feltöltési úton; belső jóváhagyás-előkészítés nem mentett;
 * kiküldés kizárólag a meglévő küldési párbeszédben, kézi megerősítéssel.
 */
export function QuotePackagePanel({ quote, onSaveNet, onHandoff }: { quote: QuoteLike; onSaveNet: (net: number) => Promise<void>; onHandoff: (d: SendDraft) => void }) {
  const qc = useQueryClient();
  const { role, profile } = usePermissions();
  const run = useServerFn(prepareQuotePackageFn);
  const locked = !!quote.locked_at;
  const docs = useQuery({
    queryKey: ["quote_documents", quote.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quote_documents" as any).select("*").eq("quote_id", quote.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const prev = useQuery({
    queryKey: ["quotes", "package-prev-version", quote.group_id, quote.alternative_key, quote.version],
    enabled: !!quote.group_id && (quote.version ?? 1) > 1,
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes" as any).select("id,version,manual_net_amount,total_amount,tax_percent,technical_scope,exclusions,valid_until,notes,status")
        .eq("group_id", quote.group_id!).eq("alternative_key", quote.alternative_key ?? "A").lt("version", quote.version ?? 1).order("version", { ascending: false }).limit(1);
      if (error) throw error;
      const p = (data ?? [])[0] as any; if (!p) return null;
      const d = await supabase.from("quote_documents" as any).select("name,document_type").eq("quote_id", p.id);
      if (d.error) throw d.error;
      return { row: p, docs: (d.data ?? []) as any[] };
    },
  });
  const budgets = (docs.data ?? []).filter((d) => d.document_type === "unpriced_budget" && /\.(xlsx|xlsm|xls)$/i.test(String(d.name ?? "")));
  const [budgetId, setBudgetId] = useState(""); const selectedBudget = budgetId || budgets[0]?.id || "";
  const [mode, setMode] = useState<Mode>(quote.scope_type === "material_labor" ? "full_construction" : "subcontractor_labor");
  const [rate, setRate] = useState("6500"), [contingency, setContingency] = useState("0"), [margin, setMargin] = useState("");
  const [template, setTemplate] = useState<{ name: string; base64: string } | null>(null);
  const [tab, setTab] = useState<Tab>("scope");
  const [uploadedKeys, setUploadedKeys] = useState<{ priced: string[]; scope: string[] }>({ priced: [], scope: [] });
  const [approval, setApproval] = useState<ApprovalPrep | null>(null);
  const [ackOpen, setAckOpen] = useState(false), [acks, setAcks] = useState<ApprovalAck[]>([]);
  const prevSnap = useRef<PackageSnapshot | null>(null), [sessionPrev, setSessionPrev] = useState<PackageSnapshot | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const calc = useMutation({
    mutationFn: async () => {
      const res = await run({ data: { quoteId: quote.id, budgetDocumentId: selectedBudget || null, mode, template, includeFiles: true,
        overrides: { laborRateHuf: num(rate) ?? null, contingencyPct: num(contingency) ?? 0, marginPct: num(margin) ?? null } } });
      if (!res.ok) throw new Error(res.error);
      return res.pkg;
    },
    onMutate: () => { setSessionPrev(prevSnap.current); },
    onSuccess: (p) => { setUploadedKeys({ priced: [], scope: [] }); setTab("scope"); prevSnap.current = snapshot(p, p.gates); },
    onError: (e: Error) => toast.error("Az ajánlatcsomag nem állt össze", { description: e.message }),
  });
  const p = calc.data;

  const docList = docs.data ?? [];
  const idsFor = (type: string, name: string | undefined, keys: string[], verified: string[]) => {
    const fromUpload = docList.filter((d) => d.document_type === type && d.name === name && keys.includes(d.file_url)).map((d) => d.id as string);
    return [...new Set([...verified.filter((id) => docList.some((d) => d.id === id)), ...fromUpload])];
  };
  const pricedDocIds = p ? idsFor("priced_budget", p.files.priced?.name, uploadedKeys.priced, p.saved.pricedDocIds) : [];
  const scopeDocIds = p ? idsFor("technical_scope", p.files.scope.name, uploadedKeys.scope, p.saved.scopeDocIds) : [];
  const savedNet = quote.manual_net_amount == null ? null : Number(quote.manual_net_amount);
  const linkage = p ? linkageGates(p, { pricedDocIds, scopeDocIds, savedNetHuf: savedNet }) : [];
  const allGates = p ? [...p.gates, ...linkage] : [];
  const contentReady = !!p && p.gates.every((g) => g.ok || !g.blocking);
  const handoff = p ? handoffAllowed(p.fingerprint, approval, linkage) : { ok: false, reason: null };
  const approvalValid = !!p && !!approval && approval.fingerprint === p.fingerprint;

  const save = useMutation({
    mutationFn: async () => {
      if (!p) return;
      const out = { priced: [] as string[], scope: [] as string[] };
      if (p.files.priced?.base64 && !pricedDocIds.length) out.priced.push((await uploadQuoteDocument(quote.id, new File([bytesOf(p.files.priced.base64)], p.files.priced.name, { type: XLSX_MIME }), "priced_budget")).key);
      if (p.files.scope.base64 && !scopeDocIds.length) out.scope.push((await uploadQuoteDocument(quote.id, new File([bytesOf(p.files.scope.base64)], p.files.scope.name, { type: DOCX_MIME }), "technical_scope")).key);
      setUploadedKeys((u) => ({ priced: [...u.priced, ...out.priced], scope: [...u.scope, ...out.scope] }));
    },
    onSuccess: () => { toast.success("Fájlok mentve az ajánlat dokumentumai közé"); qc.invalidateQueries({ queryKey: ["quote_documents"] }); qc.invalidateQueries({ queryKey: ["documents"] }); },
    onError: (e: Error) => toast.error("Mentési hiba", { description: e.message }),
  });
  const saveNet = useMutation({
    mutationFn: async () => { if (p?.offerNetHuf != null) await onSaveNet(p.offerNetHuf); },
    onSuccess: () => toast.success("Nettó összeg mentve az ajánlatra"),
  });

  const pickTemplate = async (f: File) => {
    if (f.size > 2 * 1024 * 1024) { toast.error("Az ársablon legfeljebb 2 MB lehet."); return; }
    const buf = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    setTemplate({ name: f.name, base64: btoa(s) });
  };
  const doApprove = () => {
    if (!p) return;
    const r = prepareApproval({ role, by: profile?.full_name ?? profile?.email ?? null, fingerprint: p.fingerprint, gates: p.gates, acks });
    if (!r.ok) { toast.error("A jóváhagyás nem készíthető elő", { description: r.reason }); return; }
    setApproval(r.prep); setAckOpen(false); toast.success("Belső jóváhagyás előkészítve (nem mentett)");
  };
  const doHandoff = () => {
    if (!p || !handoff.ok || !approval) return;
    onHandoff({ token: Date.now(), subject: p.coverLetter.subject, body: p.coverLetter.body, documentIds: [...pricedDocIds.slice(0, 1), ...scopeDocIds.slice(0, 1)], fingerprint: p.fingerprint, approvedBy: approval.by });
  };

  const curSaved: SavedVersion = { version: quote.version, netHuf: quoteNetOf({ total_amount: quote.total_amount ?? null, manual_net_amount: quote.manual_net_amount ?? null, tax_percent: quote.tax_percent ?? null } as never).net, technicalScope: quote.technical_scope ?? null, exclusions: quote.exclusions ?? null, validUntil: quote.valid_until ?? null, notes: quote.notes ?? null, status: quote.status, docs: docList.map((d) => ({ name: d.name, documentType: d.document_type })) };
  const vDiff = useMemo(() => prev.data ? { v: prev.data.row.version as number, d: versionDiff({ version: prev.data.row.version, netHuf: quoteNetOf(prev.data.row).net, technicalScope: prev.data.row.technical_scope, exclusions: prev.data.row.exclusions, validUntil: prev.data.row.valid_until, notes: prev.data.row.notes, status: prev.data.row.status, docs: prev.data.docs.map((d) => ({ name: d.name, documentType: d.document_type })) }, curSaved) } : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prev.data, JSON.stringify(curSaved)]);
  const sDiff = p && sessionPrev ? diffPackages(sessionPrev, snapshot(p, p.gates)) : null;

  const steps: { label: string; done: boolean }[] = [
    { label: "Összeállítás", done: contentReady }, { label: "Fájlok mentése", done: linkage.slice(0, 2).every((g) => g.ok) && !!p },
    { label: "Nettó mentése", done: !!linkage[2]?.ok }, { label: "Belső jóváhagyás", done: approvalValid },
    { label: "Kiküldés (meglévő út)", done: locked || quote.status === "sent" }, { label: "Elfogadás → szerződés-előkészítés", done: quote.status === "accepted" },
  ];

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-labelledby="pkg-title">
      <div className="flex flex-col gap-1">
        <h2 id="pkg-title" className="flex items-center gap-2 text-sm font-semibold"><PackageCheck className="h-4 w-4" /> Ajánlatcsomag — ügyfélnek szánt TERVEZET</h2>
        <p className="text-xs text-muted-foreground">Egy gombbal: árazott Excel az eredeti szerkezetben, lehatárolás (vállalt / nem vállalt / feltételes / kérdés), hiányjegyzék, kérdéslista és kísérőlevél. Semmi nem mentődik és nem megy ki magától.</p>
      </div>
      <ol className="flex flex-wrap gap-1.5 text-xs" aria-label="Ajánlat útja">
        {steps.map((s, i) => <li key={s.label} className={`rounded-full border px-2 py-0.5 ${s.done ? "border-[color:var(--status-success)]/50 bg-[color:var(--status-success)]/10" : "text-muted-foreground"}`}>{i + 1}. {s.label}{s.done ? " ✓" : ""}</li>)}
      </ol>
      {locked ? <p className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Ez a verzió már kiment és zárolt. Új csomaghoz új verzió kell (1. lépés → Verziók).</p> : docs.isLoading ? <p className="text-sm text-muted-foreground">Dokumentumok betöltése…</p> : !budgets.length ? (
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">Nincs „Árazatlan költségvetés” típusú Excel ennél az ajánlatnál — az 1. lépésben töltsd fel.</p>
      ) : (<>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {budgets.length > 1 && <div className="grid gap-1.5 sm:col-span-2"><Label>Költségvetés</Label><Select value={selectedBudget} onValueChange={setBudgetId}><SelectTrigger aria-label="Csomag költségvetése"><SelectValue /></SelectTrigger><SelectContent>{budgets.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>}
          <div className="grid gap-1.5 sm:col-span-2"><Label>Árazási mód</Label><Select value={mode} onValueChange={(v) => setMode(v as Mode)}><SelectTrigger aria-label="Csomag árazási módja"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="subcontractor_labor">Alvállalkozói munkadíj (anyag nélkül)</SelectItem><SelectItem value="full_construction">Teljes kivitelezés (anyag + munkadíj)</SelectItem></SelectContent></Select></div>
          <div className="grid gap-1.5"><Label htmlFor="pk-rate">Óradíj (Ft/óra)</Label><Input id="pk-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pk-cont">Tartalék %</Label><Input id="pk-cont" inputMode="decimal" value={contingency} onChange={(e) => setContingency(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pk-margin">Célfedezet %</Label><Input id="pk-margin" inputMode="decimal" placeholder="—" value={margin} onChange={(e) => setMargin(e.target.value)} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickTemplate(f); if (fileRef.current) fileRef.current.value = ""; }} />
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="mr-1.5 h-4 w-4" /> Ársablon (opcionális)</Button>
          {template && <Badge variant="secondary" className="gap-1">{template.name}<button type="button" aria-label="Ársablon eltávolítása" onClick={() => setTemplate(null)}><X className="h-3 w-3" /></button></Badge>}
          <Button type="button" size="sm" className="ml-auto" disabled={!selectedBudget || calc.isPending} onClick={() => calc.mutate()}>
            {calc.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PackageCheck className="mr-1.5 h-4 w-4" />} Ajánlatcsomag összeállítása
          </Button>
        </div>
      </>)}

      {p && !locked && (
        <div className="space-y-4" aria-live="polite">
          <div className={`flex flex-wrap items-start gap-3 rounded-md border p-3 text-sm ${contentReady ? "border-[color:var(--status-success)]/40 bg-[color:var(--status-success)]/10" : "border-destructive/40 bg-destructive/10"}`}>
            {contentReady ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0 flex-1">
              <p className="font-medium">{contentReady ? "A csomag tartalmilag jóváhagyásra kész" : "A csomag hiányos — a pirossal jelölt feltételek nélkül nem hagyható jóvá"}</p>
              <p className="text-xs text-muted-foreground">Ajánlati nettó: <strong className="text-foreground">{p.offerNetHuf == null ? "—" : formatHuf(p.offerNetHuf)}</strong> · {p.asOf} · ujjlenyomat {p.fingerprint.slice(0, 12)}…{p.internal ? ` · belső: anyag ${formatHuf(p.internal.materialHuf)}, munkadíj ${formatHuf(p.internal.laborHuf)}` : ""}</p>
            </div>
          </div>
          <ul className="grid gap-x-6 sm:grid-cols-2" aria-label="Csomag feltételei">{allGates.map((g) => <GateRow key={g.key} g={g} />)}</ul>

          <div className="flex flex-wrap gap-2">
            {p.files.priced?.base64 && <Button size="sm" variant="outline" onClick={() => download(bytesOf(p.files.priced!.base64!), p.files.priced!.name, XLSX_MIME)}><Download className="mr-1.5 h-4 w-4" /> Árazott Excel (TERVEZET)</Button>}
            {p.files.scope.base64 && <Button size="sm" variant="outline" onClick={() => download(bytesOf(p.files.scope.base64!), p.files.scope.name, DOCX_MIME)}><Download className="mr-1.5 h-4 w-4" /> Lehatárolás (Word)</Button>}
            <Button size="sm" variant="ghost" onClick={() => download(csv([["Típus", "Tétel / leírás", "Hivatkozás"], ...p.missing.map((m) => [m.kind, m.text, m.ref])]), `VIBA_BELSO_hianyjegyzek_v${p.quote.version ?? 1}.csv`, "text/csv;charset=utf-8")}><Download className="mr-1.5 h-4 w-4" /> Belső hiányjegyzék (CSV)</Button>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-3">
            <Button size="sm" disabled={!contentReady || save.isPending || (linkage[0]?.ok && linkage[1]?.ok)} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileCheck2 className="mr-1.5 h-4 w-4" />} Fájlok mentése az ajánlathoz</Button>
            <Button size="sm" variant="outline" disabled={!contentReady || saveNet.isPending || !!linkage[2]?.ok} onClick={() => saveNet.mutate()}><Save className="mr-1.5 h-4 w-4" /> Nettó átvétele és mentése</Button>
            <Button size="sm" variant="outline" disabled={!contentReady} onClick={() => { setAcks([]); setAckOpen(true); }}><ShieldCheck className="mr-1.5 h-4 w-4" /> Belső jóváhagyás-előkészítés</Button>
            <Button size="sm" disabled={!handoff.ok} title={handoff.reason ?? undefined} onClick={doHandoff}><Send className="mr-1.5 h-4 w-4" /> Átadás a kiküldéshez</Button>
          </div>
          {approvalValid && <p className="text-xs text-muted-foreground">Belső jóváhagyás előkészítve: {approval!.by ?? "—"} ({approval!.role}), {new Date(approval!.at).toLocaleString("hu-HU")} — NEM mentett jóváhagyási napló; a kiküldés a meglévő párbeszédben kézi megerősítéssel történik.</p>}
          {!handoff.ok && handoff.reason && contentReady && <p className="text-xs text-muted-foreground">Kiküldéshez még: {handoff.reason}</p>}

          <div className="flex flex-wrap gap-1" role="tablist" aria-label="Csomag részei">
            {([["scope", "Lehatárolás"], ["questions", `Kérdések (${p.scope.questions.length})`], ["missing", `Belső hiányjegyzék (${p.missingTotal})`], ["letter", "Kísérőlevél"], ["changes", "Változások"]] as [Tab, string][]).map(([k, l]) =>
              <Button key={k} role="tab" aria-selected={tab === k} size="sm" variant={tab === k ? "secondary" : "ghost"} onClick={() => setTab(k)}>{l}</Button>)}
          </div>
          {tab === "scope" && <div className="grid gap-3 sm:grid-cols-3">{(["included", "excluded", "conditional"] as (keyof ScopeSections)[]).map((k) => <div key={k} className="rounded-md border p-3"><p className="mb-1 text-sm font-semibold">{SCOPE_SECTION_LABEL[k]}</p><ul className="list-disc space-y-1 pl-4 text-xs">{p.scope[k].length ? p.scope[k].map((x) => <li key={x.text}>{x.text}</li>) : <li>Nincs.</li>}</ul></div>)}</div>}
          {tab === "questions" && <ol className="list-decimal space-y-1 pl-5 text-sm">{p.scope.questions.length ? p.scope.questions.map((q) => <li key={q.text}>{q.text}</li>) : <li className="list-none text-muted-foreground">Nincs nyitott kérdés.</li>}</ol>}
          {tab === "missing" && <div className="space-y-1"><p className="text-xs text-muted-foreground">Belső lista — nem kerül ügyfélnek.</p><ul className="max-h-[50vh] space-y-0.5 overflow-y-auto text-xs">{p.missing.length ? p.missing.map((m, i) => <li key={i}><Badge variant="outline" className="mr-1">{m.kind}</Badge>{m.text}</li>) : <li>Nincs hiány.</li>}</ul></div>}
          {tab === "letter" && <div className="space-y-1 text-sm"><p><span className="text-muted-foreground">Tárgy:</span> {p.coverLetter.subject}</p><pre className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/20 p-3 font-sans text-sm">{p.coverLetter.body}</pre><p className="text-xs text-muted-foreground">A kiküldési párbeszédben még szerkeszthető.</p></div>}
          {tab === "changes" && <div className="space-y-3 text-sm">
            <div><p className="font-medium">Előző összeállításhoz képest (ebben a munkamenetben)</p>
              {!sDiff ? <p className="text-xs text-muted-foreground">Ez az első összeállítás — módosított beállítással újra futtatva itt látszik a különbség.</p> : sDiff.same ? <p className="text-xs text-muted-foreground">Nincs változás (azonos ujjlenyomat).</p> : <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {sDiff.netDeltaHuf != null && sDiff.netDeltaHuf !== 0 && <li>Nettó változás: {sDiff.netDeltaHuf > 0 ? "+" : ""}{formatHuf(sDiff.netDeltaHuf)}</li>}
                {sDiff.changedLines.slice(0, 40).map((c) => <li key={c.key}>{c.key} {c.name.slice(0, 60)}: {c.before} → {c.after}</li>)}
                {sDiff.scopeAdded.map((x) => <li key={`a${x.section}${x.text}`}>+ {SCOPE_SECTION_LABEL[x.section]}: {x.text.slice(0, 140)}</li>)}
                {sDiff.scopeRemoved.map((x) => <li key={`r${x.section}${x.text}`}>− {SCOPE_SECTION_LABEL[x.section]}: {x.text.slice(0, 140)}</li>)}
                {sDiff.gateChanges.map((g) => <li key={g.key}>{g.label}: {g.before ? "rendben" : "nyitott"} → {g.after ? "rendben" : "nyitott"}</li>)}
              </ul>}</div>
            <div><p className="font-medium">Előző mentett verzióhoz képest</p>
              {!vDiff ? <p className="text-xs text-muted-foreground">{(quote.version ?? 1) > 1 ? (prev.isLoading ? "Betöltés…" : "Az előző verzió nem olvasható.") : "Ez az első verzió."}</p> : vDiff.d.same ? <p className="text-xs text-muted-foreground">v{vDiff.v}-hoz képest nincs mentett eltérés.</p> : <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {vDiff.d.fields.map((f) => <li key={f.label}>{f.label}: {f.before.slice(0, 80)} → {f.after.slice(0, 80)}</li>)}
                {vDiff.d.docsAdded.map((d) => <li key={`+${d.name}`}>+ dokumentum: {d.name}</li>)}
                {vDiff.d.docsRemoved.map((d) => <li key={`-${d.name}`}>− dokumentum: {d.name}</li>)}
              </ul>}</div>
          </div>}
        </div>
      )}

      <Dialog open={ackOpen} onOpenChange={setAckOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Belső jóváhagyás-előkészítés</DialogTitle></DialogHeader>
          {p && <div className="space-y-3 text-sm">
            <p className="text-xs text-muted-foreground">Ujjlenyomat {p.fingerprint.slice(0, 16)}… · nettó {p.offerNetHuf == null ? "—" : formatHuf(p.offerNetHuf)}. Ez a lépés NEM ment jóváhagyási naplót (az adatmodell tulajdonosi döntésre vár), és nem küld semmit. Ha a csomag tartalma megváltozik, újra kell nyugtázni.</p>
            {requiredAcks(p.gates).map((k) => <label key={k} className="flex items-start gap-2"><Checkbox checked={acks.includes(k)} onCheckedChange={(c) => setAcks((a) => (c ? [...a, k] : a.filter((x) => x !== k)))} /><span>{ACK_LABEL[k]}</span></label>)}
          </div>}
          <DialogFooter><Button variant="ghost" onClick={() => setAckOpen(false)}>Mégse</Button><Button onClick={doApprove}><ShieldCheck className="mr-1.5 h-4 w-4" /> Előkészítem</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
