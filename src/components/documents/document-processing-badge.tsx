// AI OS 2.0/7 — dokumentum AI-feldolgozási állapota a dokumentumlistákban (user-RLS: csak látható forrás).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { processingView } from "@/lib/knowledge/ingest-model";

export type ProcessingSource = "project_documents" | "company_documents" | "quote_documents";
type Row = { source_id: string; processing_status: string; error_code: string | null };

export function useDocumentProcessing(source: ProcessingSource, ids: string[]) {
  const key = [...ids].sort();
  return useQuery({
    queryKey: ["knowledge_processing", source, key],
    enabled: key.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const map = new Map<string, Row>();
      for (let i = 0; i < key.length; i += 100) {
        const { data, error } = await supabase.from("knowledge_documents")
          .select("source_id, processing_status, error_code")
          .eq("source_table", source).in("source_id", key.slice(i, i + 100)).is("superseded_at", null);
        if (error) throw error;
        for (const r of (data ?? []) as Row[]) map.set(r.source_id, r);
      }
      return map;
    },
  });
}

const TONE = { ok: "border-status-success/40 text-status-success", info: "text-muted-foreground", warning: "border-status-warning/60 text-status-warning", error: "border-destructive/60 text-destructive" } as const;

export function DocumentProcessingBadge({ row, loading }: { row?: Row; loading?: boolean }) {
  if (loading) return null;
  const v = processingView(row?.processing_status, row?.error_code);
  return <Badge variant="outline" className={`text-[10px] font-normal ${TONE[v.tone]}`} title={v.help}>{v.label}</Badge>;
}

/** Ha van ellenőrzést igénylő / hibás fájl, rövid magyarázat a lista fölött. */
export function DocumentProcessingNotice({ map }: { map?: Map<string, Row> }) {
  if (!map) return null;
  const bad = [...map.values()].filter((r) => r.processing_status === "needs_review" || r.processing_status === "error").length;
  if (!bad) return null;
  return <p role="status" className="m-2 rounded-md border border-status-warning/50 bg-status-warning/10 px-3 py-2 text-xs">
    {bad} dokumentum tartalmát az AI még nem tudja teljesen olvasni. A fájlok letölthetők; az okot a jelvényre mutatva látod. Az AI ezekre nem hivatkozhat biztosként.
  </p>;
}
