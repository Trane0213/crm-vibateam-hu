import { quoteAmounts } from "../../quotes/amounts";
import { isActiveQuote, summarizeActiveQuotes } from "../../quotes/quote-list";
import { quoteStatusLabel } from "../../quotes/quote-status";
import { quoteWorkflow } from "../../quotes/workflow";
import { safeMailText } from "./gmail-context";

export const QUOTE_SELECT = "id,lead_id,project_id,group_id,alternative_key,alternative_label,version,is_current,title,status,quote_kind,contact_id,responsible_user_id,created_at,sent_at,locked_at,valid_until,request_due_date,offer_due_date,total_amount,manual_net_amount,tax_percent,discount_percent,scope_note,technical_scope,exclusions,notes,template_key,template_version,template_terms,site_address,quote_items(count)";

/** Apply the existing quote workspace's amount and state rules, never a new KPI. */
export function quoteContext(row: Record<string, unknown>): Record<string, unknown> & { amounts: ReturnType<typeof quoteAmounts> | null; net: number | null; workflow: ReturnType<typeof quoteWorkflow>; active: boolean; content_status: Record<string, unknown> } {
  const counts = row.quote_items as { count: number }[] | undefined;
  const itemCount = counts?.[0]?.count;
  const amounts = itemCount == null ? null : quoteAmounts({ itemCount,
    totalAmount: row.total_amount as number | null, manualNetAmount: row.manual_net_amount as number | null, taxPercent: row.tax_percent as number | null });
  const safe: Record<string, unknown> = {};
  const contentStatus: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "quote_items") continue;
    if (typeof value === "string") {
      const bounded = safeMailText(value, 0, 1500);
      safe[key] = bounded.text;
      if (bounded.status !== "cached") contentStatus[key] = bounded;
    } else if (value && typeof value === "object") {
      const bounded = safeMailText(JSON.stringify(value), 0, 1500);
      safe[key] = bounded.text;
      if (bounded.status !== "cached") contentStatus[key] = bounded;
    } else safe[key] = value;
  }
  return { ...safe, item_count: itemCount ?? null, amounts, net: amounts?.net ?? null,
    workflow: quoteWorkflow(row.quote_kind), status_label: quoteStatusLabel(row.status as string | null),
    active: isActiveQuote(row as { status: string | null; is_current: boolean | null }),
    content_status: contentStatus, link: `/quotes/${row.id}` };
}

export function quotePageSummary(items: Record<string, unknown>[], pageComplete: boolean) {
  const summary = summarizeActiveQuotes(items.map((r) => ({ id: String(r.id), lead_id: r.lead_id as string | null,
    project_id: r.project_id as string | null, status: r.status as string | null, is_current: r.is_current as boolean | null, net: r.net as number | null })));
  return { ...summary, scope: pageComplete ? "complete_visible_selection" : "page_only_not_full_portfolio", full_portfolio: pageComplete,
    definition: "Aktuális, nyitott ajánlatok; lead/projekt/önálló ügyenként legnagyobb ismert nettó, nem alternatívák/verziók összege." };
}

export function quoteSendEvidence(row: Record<string, unknown>) {
  // Mirrors quote_lock_sent's evidence predicate; never claims a live Gmail read.
  const verified = ["sent", "recorded"].includes(String(row.status)) && Boolean(row.sent_at && String(row.gmail_message_id ?? "").trim());
  return { ...row, verified_send_record: verified, customer_response_proven: false };
}

export function sameQuoteScope(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Boolean(a.group_id && a.group_id === b.group_id && a.lead_id === b.lead_id && a.project_id === b.project_id);
}

export function quoteFieldChanges(a: Record<string, unknown>, b: Record<string, unknown>) {
  const fields = ["title", "quote_kind", "net", "tax_percent", "discount_percent", "scope_note", "technical_scope", "exclusions", "notes", "valid_until", "site_address", "template_key", "template_version", "template_terms", "contact_id"];
  return fields.filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key])).map((field) => ({ field, from: a[field] ?? null, to: b[field] ?? null }));
}