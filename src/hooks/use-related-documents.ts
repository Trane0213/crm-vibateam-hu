/**
 * Kapcsolódó dokumentumok a hívó jogosultságával (RLS). Kulcs: ["documents", …];
 * a meglévő dokumentumkezelők feltöltése/törlése ezt is érvényteleníti. Csak olvas.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { DocSource } from "@/lib/documents/document-access";
import { loadRelatedDocs, type RelatedDocsContext, type RelatedDocsResult } from "@/lib/documents/related-docs-loader";

export function relatedDocsKey(ctx: RelatedDocsContext, sources: DocSource[]) {
  const s = (xs?: (string | null | undefined)[]) => [...new Set((xs ?? []).filter(Boolean) as string[])].sort().join(",");
  return ["documents", "related", ctx.all ? "all" : "ctx", ctx.leadId ?? "", s(ctx.projectIds), s(ctx.companyIds), s(ctx.quoteIds), [...sources].sort().join(",")];
}

export function useRelatedDocuments(ctx: RelatedDocsContext, sources: DocSource[], enabled = true) {
  return useQuery({
    queryKey: relatedDocsKey(ctx, sources),
    enabled: enabled && sources.length > 0,
    staleTime: 30_000,
    queryFn: (): Promise<RelatedDocsResult> => loadRelatedDocs(supabase as any, ctx, sources),
  });
}
