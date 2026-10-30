/**
 * Sales-átadás előtti meglévő-lead felismerés (3. szakasz).
 * Csak a felületet vezérli; a Pipeline szabályai (DB triggerek) változatlanok.
 * Lezárt (won/lost) lead nem akadályoz; nyitott lead esetén kifejezett
 * megerősítés kell, hogy ez KÜLÖN projektlehetőség (nem duplikált átadás).
 */
export const TERMINAL_LEAD_STATUSES = ["won", "lost"];

export function openLeads<T extends { status?: string | null }>(leads: T[]): T[] {
  return leads.filter((l) => !TERMINAL_LEAD_STATUSES.includes((l.status ?? "").toLowerCase()));
}

export function canSubmitHandoff(input: {
  summary: string; leadSource: string; assignee: string; submitting: boolean;
  openLeadCount: number; confirmedSeparateOpportunity: boolean;
}): boolean {
  if (input.submitting) return false;
  if (!input.summary.trim() || !input.leadSource || !input.assignee) return false;
  if (input.openLeadCount > 0 && !input.confirmedSeparateOpportunity) return false;
  return true;
}
