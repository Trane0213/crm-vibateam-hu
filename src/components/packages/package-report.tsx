/**
 * P2 – Csomagjelentés: mely fájlok feldolgozása sikerült, melyeké nem, és miért.
 * Csak a hívó által látható fájlok (RLS); az (újra)indítás a feltöltési joghoz kötött, a szerver ellenőrzi.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileSearch, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { packageProcessingReport, startPackageProcessing } from "@/lib/packages/packages.functions";
import type { ReportState } from "@/lib/packages/processing-policy";

const TONE: Record<ReportState, "secondary" | "destructive" | "outline" | "default"> = {
  processed: "secondary", partial: "outline", unreadable: "destructive", failed: "destructive", not_supported: "outline",
  waiting: "outline", running: "outline", duplicate: "outline", upload_open: "outline",
};
const FILTERS: { id: "problems" | "all" | "processed"; label: string }[] = [
  { id: "problems", label: "Nem sikerült / részben" }, { id: "all", label: "Összes" }, { id: "processed", label: "Feldolgozva" },
];

export function PackageReportButton({ packageId, title, canStart }: { packageId: string; title: string; canStart: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><FileSearch className="mr-1.5 h-3.5 w-3.5" />Feldolgozási jelentés</Button>
      {open && <PackageReportDialog packageId={packageId} title={title} canStart={canStart} onClose={() => setOpen(false)} />}
    </>
  );
}

function PackageReportDialog({ packageId, title, canStart, onClose }: { packageId: string; title: string; canStart: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["documents", "packages", "report", packageId];
  const q = useQuery({ queryKey: key, queryFn: () => packageProcessingReport({ data: { packageId } }), refetchInterval: (s) => ((s.state.data?.totals.running ?? 0) > 0 ? 10_000 : false) });
  const [filter, setFilter] = useState<"problems" | "all" | "processed">("problems");
  const [busy, setBusy] = useState(false);
  const r = q.data;
  const problemStates: ReportState[] = ["failed", "unreadable", "partial", "upload_open"];
  const rows = (r?.rows ?? []).filter((x) => filter === "all" ? true : filter === "processed" ? x.state === "processed" : problemStates.includes(x.state));
  const retryable = (r?.rows ?? []).filter((x) => x.retryable).map((x) => x.fileId);

  async function start(fileIds: string[] | null) {
    setBusy(true);
    try {
      const res = await startPackageProcessing({ data: { packageId, fileIds } });
      if (!res.configured) toast.info("A feldolgozó még nincs bekapcsolva. A fájlok sorban várnak, és bekapcsoláskor feldolgozásra kerülnek.");
      else toast.success(`${res.started} fájl feldolgozása elindult${res.waiting ? `, ${res.waiting} várakozik` : ""}.`);
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["documents", "packages", "files", packageId] });
    } catch (e: any) { toast.error(e?.message ?? "A feldolgozás most nem indítható."); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Feldolgozási jelentés – {title}</DialogTitle>
          <DialogDescription>Fájlonként: sikerült-e kiolvasni a tartalmat, és ha nem, miért. Az eredeti fájlok változatlanok maradnak.</DialogDescription>
        </DialogHeader>
        {q.isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Jelentés betöltése…</p>}
        {q.isError && <p className="text-sm text-destructive">A jelentés most nem tölthető be. Próbáld újra később.</p>}
        {r && (
          <div className="space-y-3">
            {!r.configured && (
              <p className="flex items-start gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />A feldolgozó még nincs bekapcsolva. A feltöltött fájlok biztonságban tárolva várnak; bekapcsolás után feldolgozhatók.
              </p>
            )}
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <Stat label="Fájl összesen" value={r.totals.files} />
              <Stat label="Feldolgozva" value={r.totals.processed} />
              <Stat label="Részben olvasható" value={r.totals.partial} />
              <Stat label="Nem olvasható / hiba" value={r.totals.unreadable + r.totals.failed} danger={r.totals.unreadable + r.totals.failed > 0} />
              <Stat label="Csak tárolva" value={r.totals.notSupported} />
              <Stat label="Várakozik / folyamatban" value={r.totals.waiting + r.totals.running} />
              <Stat label="ZIP-ből kibontva" value={r.totals.extractedFromZip} />
              <Stat label="Oldal (szöveg / képfelismerés)" value={`${r.totals.textPages} / ${r.totals.ocrPages}`} />
            </dl>
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => <Button key={f.id} size="sm" variant={filter === f.id ? "default" : "outline"} onClick={() => setFilter(f.id)}>{f.label}</Button>)}
              {canStart && (
                <Button size="sm" variant="outline" className="sm:ml-auto" disabled={busy || (!retryable.length && r.totals.waiting === 0)} onClick={() => start(null)}>
                  {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1.5 h-3.5 w-3.5" />}Feldolgozás indítása / újrapróbálás
                </Button>
              )}
            </div>
            {!rows.length && <p className="text-sm text-muted-foreground">{filter === "problems" ? "Nincs hibás vagy részben olvasható fájl." : "Nincs megjeleníthető fájl."}</p>}
            <ul className="divide-y rounded-md border">
              {rows.slice(0, 500).map((x) => (
                <li key={x.fileId} className="flex flex-col gap-1 px-2 py-1.5 text-sm sm:flex-row sm:items-start sm:gap-2">
                  <span className="min-w-0 sm:flex-1">
                    <span className="block [overflow-wrap:anywhere]">{x.path}{x.fromArchive && <span className="ml-1.5 text-xs text-muted-foreground">(ZIP-ből)</span>}</span>
                    {x.details && <span className="block text-xs text-muted-foreground">{x.details}</span>}
                    {x.reasons.map((reason) => <span key={reason} className={cn("block text-xs", x.state === "processed" || x.state === "not_supported" ? "text-muted-foreground" : "text-destructive")}>{reason}</span>)}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={TONE[x.state]}>{x.label}</Badge>
                    {canStart && x.retryable && <Button size="sm" variant="ghost" disabled={busy} onClick={() => start([x.fileId])}>Újra</Button>}
                  </span>
                </li>
              ))}
            </ul>
            {rows.length > 500 && <p className="text-xs text-muted-foreground">Az első 500 sor látható ({rows.length} összesen). Szűkítsd a szűrővel.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, danger }: { label: string; value: number | string; danger?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-base font-semibold", danger && "text-destructive")}>{value}</dd>
    </div>
  );
}
