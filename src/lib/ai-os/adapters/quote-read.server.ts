import type { ToolContext } from "../types";
import { crmReadPage, readWindow } from "./crm-read-page";
import { QUOTE_SELECT, quoteContext, quotePageSummary } from "./quote-context";

export async function readQuoteList(args: Record<string, unknown>, ctx: ToolContext, defaultLimit = 25, budget = 10000) {
  const window = readWindow(args, defaultLimit);
  const sb = ctx.supabaseUser;
  let q = sb.from("quotes").select(QUOTE_SELECT, { count: "exact" });
  if (args.lead_id) q = q.eq("lead_id", String(args.lead_id));
  if (args.project_id) q = q.eq("project_id", String(args.project_id));
  if (args.group_id) q = q.eq("group_id", String(args.group_id));
  let rows: Record<string, unknown>[] = [];
  let count: number | null = null;
  if (args.company_id) {
    // Two disjoint branches: all lead-linked quotes first, then project-only.
    // No capped lead/project ID download, and no duplicate won-lead quotes.
    let leadQuery = sb.from("quotes").select(`${QUOTE_SELECT},leads!inner(company_id)`, { count: "exact" }).eq("leads.company_id", String(args.company_id));
    if (args.lead_id) leadQuery = leadQuery.eq("lead_id", String(args.lead_id));
    if (args.project_id) leadQuery = leadQuery.eq("project_id", String(args.project_id));
    if (args.group_id) leadQuery = leadQuery.eq("group_id", String(args.group_id));
    const leads = await leadQuery.order("created_at", { ascending: false, nullsFirst: false }).order("id").range(window.offset, window.offset + window.limit - 1);
    if (leads.error) throw leads.error;
    if (leads.count == null) throw new Error("Hiányzó látható ajánlati darabszám.");
    rows = leads.data ?? [];
    let projectQuery = sb.from("quotes").select(`${QUOTE_SELECT},projects!inner(company_id)`, { count: "exact" }).is("lead_id", null).eq("projects.company_id", String(args.company_id));
    if (args.lead_id) projectQuery = projectQuery.eq("lead_id", String(args.lead_id));
    if (args.project_id) projectQuery = projectQuery.eq("project_id", String(args.project_id));
    if (args.group_id) projectQuery = projectQuery.eq("group_id", String(args.group_id));
    const offset = Math.max(0, window.offset - leads.count);
    const remaining = window.limit - rows.length;
    const projects = await projectQuery.order("created_at", { ascending: false, nullsFirst: false }).order("id").range(offset, offset + Math.max(1, remaining) - 1);
    if (projects.error) throw projects.error;
    if (projects.count == null) throw new Error("Hiányzó látható projektajánlati darabszám.");
    rows.push(...(projects.data ?? []).slice(0, remaining));
    count = leads.count + projects.count;
  } else {
    const result = await q.order("created_at", { ascending: false, nullsFirst: false }).order("id").range(window.offset, window.offset + window.limit - 1);
    if (result.error) throw result.error;
    rows = result.data ?? [];
    count = result.count;
  }
  const page = crmReadPage(rows.map(quoteContext), count, window, "quotes", budget);
  return { ...page, active_summary: quotePageSummary(page.items, page.completeness.page_complete && page.completeness.truncated_fields.length === 0),
    order: args.company_id ? "lead_linked_then_project_only; created_at DESC,id ASC within branches" : "created_at DESC,id ASC",
    limitations: ["Csak jogosultan látható ajánlatok. Részleges oldal nem teljes nyitott állomány.", "Kiküldéshez quote_sends bizonyíték, válaszhoz külön jogosult levéltartalom kell.", "Fájlok tartalmát P1/D előtt nem olvassa."] };
}