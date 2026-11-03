import type { ToolContext } from "../types";
import { crmReadPage, readWindow } from "./crm-read-page";
import { QUOTE_SELECT, quoteContext, quotePageSummary } from "./quote-context";
import { isActiveQuote } from '@/lib/quotes/quote-list';
import { CLOSED_QUOTE_STATUSES } from '@/lib/quotes/quote-status';
import { LEGACY_CLOSED } from '@/lib/quotes/quote-list';

export async function readQuoteList(args: Record<string, unknown>, ctx: ToolContext, defaultLimit = 25, budget = 10000) {
  for (const field of ['lead_id', 'company_id', 'project_id', 'group_id']) {
    if (args[field] === 'me') throw new Error(`${field} rekordazonosító, nem felhasználó. Saját ajánlatokhoz hagyd el a szűrőt: a felhasználói RLS érvényesül; me csak assigned_to mezőben használható.`);
  }
  const window = readWindow(args, defaultLimit);
  const sb = ctx.supabaseUser;
  const selection = String(args.selection ?? 'all');
  if (!['all', 'open'].includes(selection)) throw new Error('Érvénytelen ajánlati kiválasztás.');
  const openStatusFilter = `status.is.null,status.not.in.(${[...CLOSED_QUOTE_STATUSES, ...LEGACY_CLOSED].join(',')})`;
  let q = sb.from("quotes").select(QUOTE_SELECT, { count: "exact" });
  if (args.lead_id) q = q.eq("lead_id", String(args.lead_id));
  if (args.project_id) q = q.eq("project_id", String(args.project_id));
  if (args.group_id) q = q.eq("group_id", String(args.group_id));
  if (selection === 'open') q = q.or('is_current.is.null,is_current.eq.true').or(openStatusFilter);
  let rows: Record<string, unknown>[] = [];
  let count: number | null = null;
  if (args.company_id) {
    // Two disjoint branches: all lead-linked quotes first, then project-only.
    // No capped lead/project ID download, and no duplicate won-lead quotes.
    let leadQuery = sb.from("quotes").select(`${QUOTE_SELECT},leads!inner(company_id)`, { count: "exact" }).eq("leads.company_id", String(args.company_id));
    if (args.lead_id) leadQuery = leadQuery.eq("lead_id", String(args.lead_id));
    if (args.project_id) leadQuery = leadQuery.eq("project_id", String(args.project_id));
    if (args.group_id) leadQuery = leadQuery.eq("group_id", String(args.group_id));
    if (selection === 'open') leadQuery = leadQuery.or('is_current.is.null,is_current.eq.true').or(openStatusFilter);
    const leads = await leadQuery.order("created_at", { ascending: false, nullsFirst: false }).order("id").range(window.offset, window.offset + window.limit - 1);
    if (leads.error) throw leads.error;
    if (leads.count == null) throw new Error("Hiányzó látható ajánlati darabszám.");
    rows = leads.data ?? [];
    let projectQuery = sb.from("quotes").select(`${QUOTE_SELECT},projects!inner(company_id)`, { count: "exact" }).is("lead_id", null).eq("projects.company_id", String(args.company_id));
    if (args.lead_id) projectQuery = projectQuery.eq("lead_id", String(args.lead_id));
    if (args.project_id) projectQuery = projectQuery.eq("project_id", String(args.project_id));
    if (args.group_id) projectQuery = projectQuery.eq("group_id", String(args.group_id));
    if (selection === 'open') projectQuery = projectQuery.or('is_current.is.null,is_current.eq.true').or(openStatusFilter);
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
  return { ...page, selection, open_items: page.items.filter(r => isActiveQuote(r as {status: string | null; is_current: boolean | null})), historical_items: page.items.filter(r => r.is_current === false), active_summary: quotePageSummary(page.items, page.completeness.page_complete && page.completeness.truncated_fields.length === 0),
    order: args.company_id ? "lead_linked_then_project_only; created_at DESC,id ASC within branches" : "created_at DESC,id ASC",
    limitations: ["Nyitott listán csak active=true sorok; active=false korábbi verzió külön történet, nem nyitott ajánlat.", "Összeg: amount_display vagy amounts.net; null = Nincs megadva, soha nem 0 Ft. source_link relatív CRM-linket használd változtatás nélkül, ne vibateam.hu címet.", "Csak jogosultan látható ajánlatok. Részleges oldal nem teljes nyitott állomány.", "Sales Ma csak saját nyitott leadhez tartozó, kiküldött aktuális ajánlatokat számol; a teljes ajánlatlista önálló és draft rekordokat is tartalmazhat, ezért eltérhet.", "Kiküldéshez quote_sends bizonyíték, válaszhoz külön jogosult levéltartalom kell.", "Fájlok tartalmát csak külön dokumentumolvasás értelmezi."] };
}