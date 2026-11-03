/** Sales saját ügy: kizárólag a hozzá rendelt lead (a DB leads_select_sales RLS-sel azonos szabály). */
export function isOwnSalesLead(lead: { assigned_to: string | null } | null | undefined, userId: string | null | undefined): boolean {
  return !!lead && !!userId && lead.assigned_to === userId;
}

/** Sales előkészítő listában megjelenhet-e: saját, még nincs Pipeline-ban, nem lezárt. */
export function isSalesPrepListLead(
  lead: { assigned_to: string | null; status: string | null; pipeline_entered_at: string | null },
  userId: string | null | undefined,
): boolean {
  if (!isOwnSalesLead(lead, userId)) return false;
  if (lead.pipeline_entered_at) return false;
  return lead.status !== "lost" && lead.status !== "won";
}
