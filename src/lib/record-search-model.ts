import { z } from "zod";

export const RECORD_PAGE_SIZE = 20;
export const RECORD_SEARCH_DELAY = 250;
export const recordSearchSchema = z.object({
  source: z.enum(["companies", "contacts", "projects", "leads", "quotes", "users_profile", "users_profile_lookup", "auth_users", "v_sales_user_load", "attendance_workers", "attendance_projects", "email_threads"]),
  search: z.string().max(200).default(""),
  page: z.number().int().min(0).max(100000).default(0),
  id: z.string().uuid().optional(),
  filters: z.record(z.union([z.string(), z.boolean(), z.null(), z.array(z.string())])).default({}),
});
export type RecordSource = z.infer<typeof recordSearchSchema>["source"];
export type RecordSearchInput = z.input<typeof recordSearchSchema>;
export type RecordOption = { value: string; label: string; detail: string; fields: Record<string, string | number | boolean | null> };
export type RecordSearchPage = { rows: RecordOption[]; hasMore: boolean };
export function normalizeRecordSearch(value: string) {
  return value.toLocaleLowerCase("hu-HU").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
export function mergeRecordPages(pages: RecordSearchPage[]) {
  return Array.from(new Map(pages.flatMap((p) => p.rows).map((row) => [row.value, row])).values());
}