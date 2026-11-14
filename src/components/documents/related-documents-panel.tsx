/**
 * Kapcsolódó dokumentumok egy munkafelületen (Pipeline ügy, lead adatlap,
 * ügyfél, projekt, Dokumentumtár). A három meglévő forrásból, a hívó
 * jogosultságával olvas; forrásonként kiírja az állapotot (fájlszám / NINCS
 * ADAT / NINCS ÖSSZEKÖTVE / nem teljes). Nem tölt fel, nem ír, nem mozgat.
 */
import { FolderOpen, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/use-permissions";
import { useRelatedDocuments } from "@/hooks/use-related-documents";
import { DOC_SOURCE_LABEL, DOC_SOURCES, documentSourcesForRole, sourceCounts, type DocSource } from "@/lib/documents/document-access";
import { sourceStateText, type RelatedDocsContext } from "@/lib/documents/related-docs-loader";
import { DocumentList } from "@/components/documents/document-list";

export function RelatedDocumentsPanel({
  ctx, title, description, exclude, enabled = true, emptyTitle = "Nincs kapcsolódó dokumentum", emptyDescription, className, bare,
}: {
  ctx: RelatedDocsContext;
  title: string;
  description?: string;
  /** Az adott képernyőn máshol már megjelenő forrás (ne ismétlődjön). */
  exclude?: DocSource[];
  enabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
  /** Keret és fejléc nélkül (fülön belül). */
  bare?: boolean;
}) {
  const { role, isLoading: roleLoading } = usePermissions();
  const roleSources = documentSourcesForRole(role);
  const sources = roleSources.filter((s) => !exclude?.includes(s));
  const q = useRelatedDocuments(ctx, sources, enabled && !roleLoading);
  const counts = q.data ? sourceCounts(q.data.docs) : null;
  const hiddenForRole = DOC_SOURCES.filter((s) => !roleSources.includes(s) && !exclude?.includes(s));
  const anyError = q.data ? sources.some((s) => q.data!.states[s] === "error") : false;
  if (!roleLoading && !sources.length) return null;

  return (
    <section aria-label={title} className={cn(!bare && "rounded-lg border bg-card", className)}>
      {!bare && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b px-3 py-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold"><FolderOpen className="h-4 w-4 text-muted-foreground" />{title}</h3>
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
        </header>
      )}
      <div className={cn("space-y-2", !bare && "p-3")}>
        {q.data && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground" aria-label="Dokumentumforrások állapota">
            {sources.map((s) => (
              <li key={s} data-doc-source-state={q.data!.states[s]} className={cn(q.data!.states[s] === "error" && "text-destructive", q.data!.states[s] === "truncated" && "text-status-warning")}>
                <span className="font-medium">{DOC_SOURCE_LABEL[s]}:</span> {sourceStateText(q.data!.states[s], counts?.[s] ?? 0, q.data!.limit)}
              </li>
            ))}
          </ul>
        )}
        {anyError && (
          <p role="alert" className="text-xs text-destructive">
            Egy dokumentumforrás nem tölthető be, ezért a lista nem teljes. <button type="button" className="underline" onClick={() => q.refetch()}>Újrapróbálás</button>
          </p>
        )}
        <DocumentList
          docs={q.data?.docs ?? []}
          loading={roleLoading || q.isPending}
          error={q.error}
          onRetry={() => q.refetch()}
          showSource={sources.length > 1}
          showParent
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          ariaLabel={title}
        />
        {hiddenForRole.length > 0 && (
          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            {hiddenForRole.map((s) => DOC_SOURCE_LABEL[s]).join(" és ")} dokumentumok a te munkakörödben itt nem jelennek meg.
          </p>
        )}
      </div>
    </section>
  );
}
