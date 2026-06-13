import { CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { EnrichResult } from "@/lib/enrichment/enrich";
import { enrichmentFieldLabel } from "@/lib/enrichment/enrich";

export function LeadAutoFixesBlock({
  status,
  result,
}: {
  status: "idle" | "running" | "done";
  result: EnrichResult | null;
}) {
  const changed = result?.changed ?? [];

  return (
    <section className="rounded-md border p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        Automatikus javítások
      </div>

      {status === "running" && (
        <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Meglévő adatok ellenőrzése…
        </div>
      )}

      {status !== "running" && changed.length > 0 && (
        <ul className="mt-2 space-y-1.5 text-sm">
          {changed.map((field) => (
            <li key={field} className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{enrichmentFieldLabel(field)} automatikusan kitöltve</span>
            </li>
          ))}
        </ul>
      )}

      {status !== "running" && changed.length === 0 && (
        <div className="mt-2 text-sm text-muted-foreground">
          Nincs javítható adat.
        </div>
      )}
    </section>
  );
}