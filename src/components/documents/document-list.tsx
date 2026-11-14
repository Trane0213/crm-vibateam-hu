/**
 * Egységes dokumentumlista (projekt, ügyfél/cég, ajánlat): keresés, kategória-
 * és forrásszűrés, kapcsolódó rekord, állapot, megnyitás és soronkénti hiba.
 * Mobilon kártyaszerű sorok, asztalon ugyanaz egy sorban — egyetlen DOM.
 * Csak a hívó által (RLS) már látható sorokat mutatja; megnyitás kizárólag a
 * meglévő `r2PresignDownload` úton (`useOpenDocument`).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Download, FileText, Link2Off, Loader2, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute } from "@/lib/permissions";
import {
  DOC_NOT_LINKED_TEXT, DOC_SOURCE_LABEL, categoryCounts, docParentKind, docParentLink, docParentState, filterDocs, formatBytes, sourceCounts,
  type DocSource, type UnifiedDoc,
} from "@/lib/documents/document-access";
import { DocumentProcessingBadge, DocumentProcessingNotice, useDocumentProcessing } from "@/components/documents/document-processing-badge";
import { useOpenDocument } from "@/components/documents/use-open-document";

export type DocumentListProps = {
  docs: UnifiedDoc[];
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Forrás jelvény + forrásszűrő (több forrás esetén). */
  showSource?: boolean;
  /** Kapcsolódó rekord (projekt / ügyfél / ajánlat) hivatkozása vagy NINCS ÖSSZEKÖTVE. */
  showParent?: boolean;
  /** Kezdő kategóriaszűrő (pl. a projekt Fénykép csempéje). */
  initialCategory?: string;
  /** Kategória-szűrők megjelenítése. */
  categoryFilter?: boolean;
  emptyTitle: string;
  emptyDescription?: string;
  /** Soronkénti további művelet (pl. a meglévő törlés). */
  renderActions?: (d: UnifiedDoc) => ReactNode;
  ariaLabel: string;
  className?: string;
};

function useProcessingMaps(docs: UnifiedDoc[]) {
  const ids = (s: DocSource) => docs.filter((d) => d.source === s).map((d) => d.id);
  const p = useDocumentProcessing("project_documents", ids("project_documents"));
  const c = useDocumentProcessing("company_documents", ids("company_documents"));
  const q = useDocumentProcessing("quote_documents", ids("quote_documents"));
  const merged = useMemo(() => {
    const m = new Map<string, any>();
    const add = (s: DocSource, map?: Map<string, any>) => map?.forEach((v, k) => m.set(`${s}:${k}`, v));
    add("project_documents", p.data); add("company_documents", c.data); add("quote_documents", q.data);
    return m;
  }, [p.data, c.data, q.data]);
  const loading = p.isLoading || c.isLoading || q.isLoading || !!(p.error || c.error || q.error);
  return { merged, loading };
}

export function DocumentList({
  docs, loading, error, onRetry, showSource, showParent, initialCategory = "all", categoryFilter = true,
  emptyTitle, emptyDescription, renderActions, ariaLabel, className,
}: DocumentListProps) {
  const { role } = usePermissions();
  const can = (p: string) => canAccessRoute(role, p);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>(initialCategory);
  const [source, setSource] = useState<DocSource | "all">("all");
  const { open, pending, failures } = useOpenDocument();
  const processing = useProcessingMaps(docs);

  const cats = useMemo(() => categoryCounts(docs), [docs]);
  const srcCounts = useMemo(() => sourceCounts(docs), [docs]);
  const multiSource = showSource && Object.values(srcCounts).filter((n) => n > 0).length > 1;
  const rows = useMemo(() => filterDocs(docs, { query, category, source }), [docs, query, category, source]);
  const filtered = query.trim() !== "" || category !== "all" || source !== "all";

  if (loading) {
    return <div role="status" className="flex items-center gap-2 rounded-md border bg-card p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Dokumentumok betöltése…</div>;
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4" />A dokumentumok nem tölthetők be (NINCS ADAT): {humanizeSupabaseError(error)}
        {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Újrapróbálás</Button>}
      </div>
    );
  }
  if (!docs.length) {
    return <EmptyState icon={FileText} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Keresés fájlnévben, kategóriában…" aria-label="Dokumentum keresése" className="h-9 pl-8" />
        </div>
        {categoryFilter && cats.length > 1 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Kategória szűrő">
            <FilterChip active={category === "all"} onClick={() => setCategory("all")}>Mind ({docs.length})</FilterChip>
            {cats.map((c) => <FilterChip key={c.category} active={category === c.category} onClick={() => setCategory(c.category)}>{c.label} ({c.count})</FilterChip>)}
          </div>
        )}
        {multiSource && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Forrás szűrő">
            <FilterChip active={source === "all"} onClick={() => setSource("all")}>Minden forrás</FilterChip>
            {(Object.keys(srcCounts) as DocSource[]).filter((s) => srcCounts[s] > 0).map((s) => (
              <FilterChip key={s} active={source === s} onClick={() => setSource(s)}>{DOC_SOURCE_LABEL[s]} ({srcCounts[s]})</FilterChip>
            ))}
          </div>
        )}
        <span className="text-xs tabular-nums text-muted-foreground sm:ml-auto" aria-live="polite">{rows.length} / {docs.length} fájl</span>
      </div>

      <div className="overflow-hidden rounded-md border bg-card">
        <DocumentProcessingNotice map={processing.merged} />
        {rows.length === 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm text-muted-foreground">
            Nincs a szűrésnek megfelelő dokumentum.
            {filtered && <Button size="sm" variant="ghost" onClick={() => { setQuery(""); setCategory("all"); setSource("all"); }}><X className="mr-1 h-3.5 w-3.5" />Szűrés törlése</Button>}
          </div>
        ) : (
          <ul className="divide-y text-sm" aria-label={ariaLabel}>
            {rows.map((d) => {
              const failure = failures[d.uid];
              const link = showParent ? docParentLink(d, can) : null;
              const size = formatBytes(d.sizeBytes);
              return (
                <li key={d.uid} data-doc-uid={d.uid} data-doc-source={d.source} className="flex flex-col gap-2 px-3 py-2.5 hover:bg-muted/30 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className={cn("min-w-0 break-words font-medium", d.nameMissing && "italic text-muted-foreground")}>{d.name}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant={d.category === "sent_offer" ? "default" : "secondary"} className="text-[10px]">{d.categoryLabel}</Badge>
                      {showSource && <Badge variant="outline" className="text-[10px]">Forrás: {DOC_SOURCE_LABEL[d.source]}</Badge>}
                      <DocumentProcessingBadge row={processing.merged.get(d.uid)} loading={processing.loading} />
                      {!d.fileKey && <Badge variant="outline" className="border-destructive/60 text-[10px] text-destructive">Nincs tárolt fájl</Badge>}
                      {d.sameFileCount > 0 && <Badge variant="outline" className="border-status-warning/60 text-[10px] text-status-warning" title="Ugyanaz a tárolt fájl több rekordhoz is tartozik. Nem vontuk össze.">Ugyanez a fájl még {d.sameFileCount} helyen</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {showParent && (link
                        ? <Link to={link.to as any} params={link.params as any} search={link.search as any} className="font-medium text-primary hover:underline">{docParentKind(d.source)}: {link.label}</Link>
                        : docParentState(d) === "not_linked"
                          ? <span className="inline-flex items-center gap-1"><Link2Off className="h-3 w-3" />{DOC_NOT_LINKED_TEXT[d.source]}</span>
                          : <span>{docParentKind(d.source)}: {d.parentLabel ?? "—"}</span>)}
                      <span>Feltöltve: {formatDateTime(d.createdAt)}</span>
                      {size && <span>{size}</span>}
                    </div>
                    {failure && <p role="alert" data-open-failure={failure.kind} className="mt-1 text-xs text-destructive">{failure.title}: {failure.detail}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
                    <Button size="sm" variant="outline" className="h-9 sm:h-8" disabled={pending === d.uid || !d.fileKey} onClick={() => open(d)} aria-label={`${d.name} megnyitása`}>
                      {pending === d.uid ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}Megnyitás
                    </Button>
                    {renderActions?.(d)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick}
      className={cn("min-h-8 rounded-full border px-2.5 text-xs transition", active ? "border-primary bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted")}>
      {children}
    </button>
  );
}
