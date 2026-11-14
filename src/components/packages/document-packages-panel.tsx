/**
 * P1 – Tervcsomagok: egy ügy (projekt vagy ajánlat) teljes dokumentációjának feltöltése,
 * folytatása, megnyitása és hibáinak megtekintése. A meglévő dokumentumtár része:
 * ugyanaz a tárhely, ugyanaz a megnyitási út (r2PresignDownload), a szülő ügy jogosultsága szerint.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, FileArchive, FolderOpen, FolderUp, Loader2, PauseCircle, RotateCcw, Upload, Files as FilesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useOpenDocument } from "@/components/documents/use-open-document";
import {
  DEFAULT_LIMITS, ERROR_TEXT, FILE_STATUS_LABEL, PROCESSING_LABEL, baseName, canUploadPackage, checkPackageFile, folderOf, formatBytes, resolveLimits,
  type FileStatus, type PackageParent, type ProcessingStatus, type PackageSummary, type PackageFileView,
} from "@/lib/packages/package-policy";
import { UploadAborted, uploadFiles, type FileOutcome, type LocalFile } from "@/lib/packages/upload-engine";
import { createDocumentPackage, listDocumentPackages, listPackageFiles, packageLimits } from "@/lib/packages/packages.functions";
import { makeTransport } from "./package-transport";
import { fromDrop, fromInput, supportsFolderPicker } from "./local-files";

const pkgKey = (parent: PackageParent | null) => ["documents", "packages", parent?.kind ?? "all", parent?.id ?? "all"] as const;

export function DocumentPackagesPanel({ parent, title = "Tervcsomagok", className }: { parent: PackageParent | null; title?: string; className?: string }) {
  const { role, isLoading: roleLoading } = usePermissions();
  const canUpload = !!parent && !roleLoading && canUploadPackage(parent.kind, role, role === "owner");
  const q = useQuery({ queryKey: pkgKey(parent), queryFn: () => listDocumentPackages({ data: { parent } }), retry: 1 });
  const [dialog, setDialog] = useState<{ packageId?: string; title?: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  if (q.data && !q.data.available) {
    return (
      <section aria-label={title} className={cn("rounded-lg border border-dashed bg-card p-4", className)}>
        <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderUp className="h-4 w-4" />{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">A nagy tervcsomagok (mappák, ZIP, akár 1 GB-os fájlok) feltöltése tulajdonosi jóváhagyásra vár. Addig a lenti, megszokott feltöltés használható.</p>
      </section>
    );
  }
  const packages = q.data?.packages ?? [];
  return (
    <section aria-label={title} className={cn("rounded-lg border bg-card", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3 sm:p-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><FolderUp className="h-4 w-4" />{title}</h2>
          <p className="text-xs text-muted-foreground">{parent ? "A teljes dokumentáció egyben, mappaszerkezettel. Egyszer kell feltölteni, a projekt és az ajánlat is ezt használja." : "Az összes számodra látható tervcsomag, ügyenként."}</p>
        </div>
        {canUpload && <Button size="sm" onClick={() => setDialog({})}><Upload className="mr-1.5 h-4 w-4" />Új dokumentáció feltöltése</Button>}
      </div>
      {q.isLoading && <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betöltés…</p>}
      {q.isError && <p className="p-4 text-sm text-destructive">A tervcsomagok most nem tölthetők be. Próbáld újra később.</p>}
      {q.data && !packages.length && <p className="p-4 text-sm text-muted-foreground">{parent ? "Még nincs feltöltött tervcsomag ehhez az ügyhöz." : "Nincs számodra látható tervcsomag."}</p>}
      <ul className="divide-y">
        {packages.map((p) => (
          <PackageRow key={p.id} pkg={p} showParent={!parent} expanded={openId === p.id} onToggle={() => setOpenId(openId === p.id ? null : p.id)}
            onResume={() => setDialog({ packageId: p.id, title: p.title })} />
        ))}
      </ul>
      {dialog && parent && <UploadDialog parent={parent} resume={dialog.packageId ? { packageId: dialog.packageId, title: dialog.title ?? "" } : null} onClose={() => setDialog(null)} />}
      {dialog && !parent && dialog.packageId && <UploadDialog parent={null} resume={{ packageId: dialog.packageId, title: dialog.title ?? "" }} onClose={() => setDialog(null)} />}
    </section>
  );
}

function PackageRow({ pkg, showParent, expanded, onToggle, onResume }: { pkg: PackageSummary; showParent: boolean; expanded: boolean; onToggle: () => void; onResume: () => void }) {
  const state = pkg.open ? "open" : pkg.failed ? "failed" : "done";
  return (
    <li>
      <div className="flex flex-wrap items-center gap-2 p-3 sm:px-4">
        <button type="button" onClick={onToggle} className="flex min-w-0 basis-full items-center gap-2 text-left sm:basis-0 sm:flex-1" aria-expanded={expanded}>
          {expanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{pkg.title}</span>
            <span className="block text-xs text-muted-foreground">
              {new Date(pkg.createdAt).toLocaleDateString("hu-HU")} · {pkg.verified} fájl kész · {formatBytes(pkg.bytes)}
              {pkg.duplicates ? ` · ${pkg.duplicates} már meglévő` : ""}
            </span>
          </span>
        </button>
        {showParent && (pkg.parentKind === "project"
          ? <Link to="/projects/$id" params={{ id: pkg.parentId }} className="text-xs text-primary hover:underline">Projekt: {pkg.parentTitle ?? "megnyitás"}</Link>
          : <Link to="/quotes/$id" params={{ id: pkg.parentId }} className="text-xs text-primary hover:underline">Ajánlat: {pkg.parentTitle ?? "megnyitás"}</Link>)}
        {state === "done" && <Badge variant="secondary" className="gap-1"><CheckCircle2 className="h-3 w-3" />Kész</Badge>}
        {state === "failed" && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />{pkg.failed} hibás</Badge>}
        {state === "open" && <Badge variant="outline" className="gap-1"><PauseCircle className="h-3 w-3" />{pkg.open} fájl befejezetlen</Badge>}
        {(state === "open" || state === "failed") && pkg.mine && <Button size="sm" variant="outline" onClick={onResume}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Feltöltés folytatása</Button>}
      </div>
      {expanded && <PackageFiles packageId={pkg.id} />}
    </li>
  );
}

function PackageFiles({ packageId }: { packageId: string }) {
  const q = useQuery({ queryKey: ["documents", "packages", "files", packageId], queryFn: () => listPackageFiles({ data: { packageId } }) });
  const { open, pending } = useOpenDocument();
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [search, setSearch] = useState("");
  const files = (q.data?.files ?? []).filter((f) => f.status !== "aborted");
  const problems = files.filter((f) => f.status === "failed" || f.processingStatus === "unreadable" || f.processingStatus === "partial");
  const shown = (onlyProblems ? problems : files).filter((f) => !search || f.relativePath.toLowerCase().includes(search.toLowerCase()));
  const groups = useMemo(() => {
    const m = new Map<string, PackageFileView[]>();
    for (const f of shown) { const k = folderOf(f.relativePath); m.set(k, [...(m.get(k) ?? []), f]); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b, "hu"));
  }, [shown]);
  if (q.isLoading) return <p className="px-4 pb-3 text-sm text-muted-foreground">Fájlok betöltése…</p>;
  if (q.isError) return <p className="px-4 pb-3 text-sm text-destructive">A fájllista most nem tölthető be.</p>;
  return (
    <div className="space-y-2 px-3 pb-3 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Keresés fájlnévben, mappában…" className="h-8 max-w-xs" aria-label="Keresés a csomagban" />
        <Button size="sm" variant={onlyProblems ? "default" : "outline"} onClick={() => setOnlyProblems(!onlyProblems)} disabled={!problems.length}>
          <AlertTriangle className="mr-1.5 h-3.5 w-3.5" />Hibák ({problems.length})
        </Button>
      </div>
      {!shown.length && <p className="text-sm text-muted-foreground">Nincs megjeleníthető fájl.</p>}
      {groups.map(([folder, list]) => (
        <div key={folder || "_"} className="rounded-md border">
          <p className="flex items-center gap-1.5 border-b bg-muted/40 px-2 py-1 text-xs font-medium"><FolderOpen className="h-3.5 w-3.5" />{folder || "(gyökérmappa)"}</p>
          <ul className="divide-y">
            {list.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 px-2 py-1.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{baseName(f.relativePath)}{f.revisionNo > 1 && <span className="ml-1.5 text-xs text-muted-foreground">({f.revisionNo}. változat)</span>}</span>
                  <span className={cn("block text-xs", f.status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {formatBytes(f.size)} · {FILE_STATUS_LABEL[f.status as FileStatus] ?? f.status}
                    {f.status === "verified" || f.status === "duplicate" ? ` · ${PROCESSING_LABEL[f.processingStatus as ProcessingStatus] ?? ""}` : ""}
                    {f.errorCode && ERROR_TEXT[f.errorCode] ? ` · ${ERROR_TEXT[f.errorCode]}` : ""}
                  </span>
                </span>
                {f.openKey && <Button size="sm" variant="ghost" disabled={pending === f.id} onClick={() => open({ uid: f.id, fileKey: f.openKey, name: f.name })}>Megnyitás</Button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

type Phase = "choose" | "working" | "done";

function UploadDialog({ parent, resume, onClose }: { parent: PackageParent | null; resume: { packageId: string; title: string } | null; onClose: () => void }) {
  const qc = useQueryClient();
  const limitsQ = useQuery({ queryKey: ["documents", "packages", "limits"], queryFn: () => packageLimits(), staleTime: 300_000 });
  const limits = limitsQ.data ? resolveLimits(limitsQ.data) : DEFAULT_LIMITS;
  const [files, setFiles] = useState<LocalFile[]>([]);
  const [source, setSource] = useState<"files" | "folder" | "zip" | "mixed">("files");
  const [title, setTitle] = useState(resume?.title ?? "");
  const [phase, setPhase] = useState<Phase>("choose");
  const [status, setStatus] = useState<{ label: string; done: number; total: number }>({ label: "", done: 0, total: 0 });
  const [outcomes, setOutcomes] = useState<FileOutcome[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const acRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null), dirRef = useRef<HTMLInputElement>(null), zipRef = useRef<HTMLInputElement>(null);
  const folderOk = supportsFolderPicker();

  useEffect(() => {
    if (phase !== "working") return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [phase]);

  const add = (list: LocalFile[], kind: typeof source) => {
    if (!list.length) return;
    setFiles((prev) => { const seen = new Set(prev.map((f) => f.relativePath)); return [...prev, ...list.filter((f) => !seen.has(f.relativePath))]; });
    setSource((s) => (files.length && s !== kind ? "mixed" : kind));
    if (!title) { const first = list[0].relativePath; setTitle(first.includes("/") ? first.split("/")[0] : kind === "zip" ? first.replace(/\.zip$/i, "") : "Dokumentáció"); }
  };
  const rejected = files.map((f) => ({ f, why: checkPackageFile({ relativePath: f.relativePath, size: f.blob.size }, limits) })).filter((x) => x.why);
  const accepted = files.filter((f) => !checkPackageFile({ relativePath: f.relativePath, size: f.blob.size }, limits));
  const total = accepted.reduce((s, f) => s + f.blob.size, 0);

  async function start() {
    if (!accepted.length) return;
    const ac = new AbortController(); acRef.current = ac;
    setPhase("working"); setOutcomes([]);
    try {
      const packageId = resume?.packageId ?? (await createDocumentPackage({ data: { parent: parent!, title: title.trim() || "Dokumentáció", source } })).packageId;
      const sizes = new Map(accepted.map((f) => [f.relativePath.replace(/\\/g, "/").replace(/^\.?\//, ""), f.blob.size]));
      const sent = new Map<string, number>();
      const totalBytes = [...sizes.values()].reduce((a, b) => a + b, 0);
      let hashed = 0; const hashedPer = new Map<string, number>();
      const mode = sessionStorage.getItem("viba-pkg-mode") === "relay" ? "relay" : "direct";
      const res = await uploadFiles(accepted, {
        transport: makeTransport(packageId), signal: ac.signal, initialMode: mode,
        onEvent: (e) => {
          if (e.type === "hash") { hashedPer.set(e.relativePath, e.done); hashed = [...hashedPer.values()].reduce((a, b) => a + b, 0); setStatus({ label: `Ellenőrzés: ${baseName(e.relativePath)}`, done: hashed, total: totalBytes }); }
          if (e.type === "progress") { sent.set(e.relativePath, e.sentBytes); setStatus({ label: `Feltöltés: ${baseName(e.relativePath)}`, done: [...sent.values()].reduce((a, b) => a + b, 0), total: totalBytes }); }
          if (e.type === "file") {
            setOutcomes((o) => [...o, e.outcome]);
            // A korábban már kész vagy duplikált fájl is a teljes mennyiség része.
            if (e.outcome.state === "already" || e.outcome.state === "duplicate" || e.outcome.state === "verified") {
              sent.set(e.outcome.relativePath, sizes.get(e.outcome.relativePath) ?? 0);
              setStatus((st) => ({ label: st.label, done: [...sent.values()].reduce((a, b) => a + b, 0), total: totalBytes }));
            }
          }
          if (e.type === "mode") sessionStorage.setItem("viba-pkg-mode", e.mode);
        },
      });
      const bad = res.filter((r) => r.state === "failed" || r.state === "rejected").length;
      if (bad) toast.warning(`${bad} fájl feltöltése nem sikerült`, { description: "A többi fájl elkészült. A hibás fájlok folytathatók." });
      else toast.success("A dokumentáció feltöltése kész");
      setPhase("done");
    } catch (e) {
      if (e instanceof UploadAborted || ac.signal.aborted) { toast.info("Feltöltés szüneteltetve", { description: "Később a „Feltöltés folytatása” gombbal ugyanonnan folytatható." }); setStatus((st) => ({ ...st, label: "Szüneteltetve – folytatható" })); setPhase("done"); }
      else { toast.error("A feltöltés megszakadt", { description: (e as Error)?.message ?? "Később folytatható." }); setPhase("done"); }
    } finally {
      qc.invalidateQueries({ queryKey: ["documents"] });
    }
  }

  const counts = { ok: outcomes.filter((o) => o.state === "verified" || o.state === "already").length, dup: outcomes.filter((o) => o.state === "duplicate").length, bad: outcomes.filter((o) => o.state === "failed" || o.state === "rejected") };
  return (
    <Dialog open onOpenChange={(o) => { if (!o && phase !== "working") onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{resume ? "Feltöltés folytatása" : "Új dokumentáció feltöltése"}</DialogTitle>
          <DialogDescription>
            {resume ? "Válaszd ki újra ugyanazokat a fájlokat vagy ugyanazt a mappát. Csak a hiányzó részek töltődnek fel, a kész fájlok kimaradnak."
              : `Fájlok, teljes mappa vagy ZIP. Fájlonként legfeljebb ${formatBytes(limits.maxFileBytes)}, ügyenként összesen ${formatBytes(limits.maxParentBytes)}.`}
          </DialogDescription>
        </DialogHeader>

        {phase === "choose" && (
          <div className="space-y-3">
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={async (e) => { e.preventDefault(); setDragOver(false); const l = await fromDrop(e.dataTransfer); add(l, l.some((f) => f.relativePath.includes("/")) ? "folder" : "files"); }}
              className={cn("rounded-lg border-2 border-dashed p-4 text-center text-sm", dragOver ? "border-primary bg-primary/5" : "border-muted")}>
              <p className="mb-3 text-muted-foreground">Húzd ide a fájlokat vagy a teljes mappát, vagy válassz:</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}><FilesIcon className="mr-1.5 h-4 w-4" />Fájlok</Button>
                {folderOk && <Button type="button" variant="outline" onClick={() => dirRef.current?.click()}><FolderOpen className="mr-1.5 h-4 w-4" />Teljes mappa</Button>}
                <Button type="button" variant="outline" onClick={() => zipRef.current?.click()}><FileArchive className="mr-1.5 h-4 w-4" />ZIP</Button>
              </div>
              <input ref={fileRef} type="file" multiple hidden onChange={(e) => { add(fromInput(e.target.files), "files"); e.target.value = ""; }} />
              <input ref={dirRef} type="file" multiple hidden {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={(e) => { add(fromInput(e.target.files), "folder"); e.target.value = ""; }} />
              <input ref={zipRef} type="file" accept=".zip,application/zip" multiple hidden onChange={(e) => { add(fromInput(e.target.files), "zip"); e.target.value = ""; }} />
            </div>
            {!resume && <div><label className="text-xs font-medium" htmlFor="pkg-title">A csomag neve</label><Input id="pkg-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="pl. Kiviteli terv – 2. revízió" maxLength={200} /></div>}
            {files.length > 0 && (
              <div className="rounded-md border p-3 text-sm">
                <p><strong>{accepted.length}</strong> fájl · {formatBytes(total)}{folderOf(accepted[0]?.relativePath ?? "") ? " · a mappaszerkezet megmarad" : ""}</p>
                {rejected.length > 0 && (
                  <details className="mt-1 text-destructive"><summary className="cursor-pointer">{rejected.length} fájl nem tölthető fel</summary>
                    <ul className="mt-1 max-h-32 overflow-y-auto text-xs">{rejected.slice(0, 200).map(({ f, why }) => <li key={f.relativePath}>{f.relativePath} – {why}</li>)}</ul>
                  </details>)}
                <Button type="button" size="sm" variant="ghost" className="mt-1 h-7 px-2" onClick={() => setFiles([])}>Kijelölés törlése</Button>
              </div>
            )}
          </div>
        )}

        {phase !== "choose" && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span className="truncate">{phase === "done" && !status.label.startsWith("Szüneteltetve") ? "Befejezve" : status.label || "Előkészítés…"}</span><span>{formatBytes(status.done)} / {formatBytes(status.total || total)}</span></div>
              <Progress value={status.total ? (status.done / status.total) * 100 : 0} aria-label="Feltöltés állapota" />
            </div>
            <p className="text-sm">{counts.ok} fájl kész{counts.dup ? ` · ${counts.dup} már korábban feltöltve (nem tároltuk újra)` : ""}{counts.bad.length ? ` · ${counts.bad.length} hibás` : ""}</p>
            {counts.bad.length > 0 && (
              <ul className="max-h-40 overflow-y-auto rounded-md border p-2 text-xs text-destructive">
                {counts.bad.map((o) => <li key={o.relativePath}>{o.relativePath} – {ERROR_TEXT[(o as { reason: string }).reason] ?? "Nem sikerült, folytatható."}</li>)}
              </ul>
            )}
            {phase === "working" && <p className="text-xs text-muted-foreground">Ne zárd be az oldalt. Ha mégis megszakad, a „Feltöltés folytatása” gombbal ugyanonnan folytatható.</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          {phase === "choose" && <><Button variant="outline" onClick={onClose}>Mégse</Button><Button onClick={start} disabled={!accepted.length || (!resume && !parent)}><Upload className="mr-1.5 h-4 w-4" />Feltöltés indítása</Button></>}
          {phase === "working" && <Button variant="outline" onClick={() => acRef.current?.abort()}><PauseCircle className="mr-1.5 h-4 w-4" />Szüneteltetés</Button>}
          {phase === "done" && <Button onClick={onClose}>Bezárás</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
