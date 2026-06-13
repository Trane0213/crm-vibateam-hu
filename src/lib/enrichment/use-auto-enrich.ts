import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  enrichCompanyFromExistingData,
  enrichContactFromExistingData,
  enrichLeadLinks,
  formatEnrichmentMessage,
  getEnrichmentResult,
  markEnriched,
  setEnrichmentResult,
  wasEnriched,
} from "./enrich";

type Kind = "company" | "contact" | "lead";

/**
 * Csendben futtatja a megfelelő enrichment-et a megadott rekordra,
 * sessionön belül egyszer per id. Sikernél rövid toast + cache invalidálás.
 */
export function useAutoEnrich(kind: Kind, id: string | null | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!id || wasEnriched(kind, id)) return;
    markEnriched(kind, id);
    let cancelled = false;
    (async () => {
      try {
        const fn =
          kind === "company" ? enrichCompanyFromExistingData
          : kind === "contact" ? enrichContactFromExistingData
          : enrichLeadLinks;
        const res = await fn(id);
        setEnrichmentResult(kind, id, res);
        if (cancelled || !res.ok || res.changed.length === 0) return;
        toast.success(`Automatikus adatjavítás: ${formatEnrichmentMessage(res.changed)}`, {
          description: "A rendszer a meglévő adatokból kitöltötte a hiányzó mezőket.",
        });
        // Cache frissítés
        if (kind === "company") qc.invalidateQueries({ queryKey: ["customers", "detail", id] });
        if (kind === "contact") qc.invalidateQueries({ queryKey: ["contacts", "detail", id] });
        if (kind === "lead") {
          qc.invalidateQueries({ queryKey: ["leads", "detail", id] });
          qc.invalidateQueries({ queryKey: ["leads"] });
        }
      } catch {
        /* csendes hiba — UI-t nem zavarjuk */
      }
    })();
    return () => { cancelled = true; };
  }, [kind, id, qc]);

  return id ? getEnrichmentResult(kind, id) : null;
}