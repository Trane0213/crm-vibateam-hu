import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordSearchSchema, type RecordSearchPage } from "./record-search-model";

export const searchRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => recordSearchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc("crm_record_search", {
      p_source: data.source, p_search: data.search, p_page: data.page,
      p_id: data.id, p_filters: data.filters,
    });
    if (error) throw error;
    return result as unknown as RecordSearchPage;
  });