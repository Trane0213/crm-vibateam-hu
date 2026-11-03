/** The saved quote selection is authoritative, not the lead's contact. */
export function quotePrintContactId(quote: { contact_id?: string | null } | null | undefined): string | null {
  return quote?.contact_id ?? null;
}