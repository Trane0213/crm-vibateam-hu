/** S5: ajánlati állapotok — a DB `quotes_status_guard` trigger tükre (a DB a döntő). */
export const QUOTE_STATUSES = ["draft", "ready", "sent", "negotiation", "accepted", "rejected", "withdrawn"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Piszkozat",
  ready: "Küldésre előkészítve",
  sent: "Kiküldött – elbírálásra vár",
  negotiation: "Pontosítás alatt",
  accepted: "Elfogadott",
  rejected: "Elutasította a megrendelő",
  withdrawn: "Visszavont (VIBA)",
};

export const CLOSED_QUOTE_STATUSES: QuoteStatus[] = ["accepted", "rejected", "withdrawn"];

export function quoteStatusLabel(s: string | null | undefined): string {
  return QUOTE_STATUS_LABEL[(s ?? "draft") as QuoteStatus] ?? s ?? "Piszkozat";
}

/** Kézzel választható következő állapotok. „Kiküldött" csak a kiküldési folyamatból jöhet. */
export function allowedNextStatuses(current: string | null | undefined, sentAt: string | null | undefined): QuoteStatus[] {
  const s = (current ?? "draft") as QuoteStatus;
  if (CLOSED_QUOTE_STATUSES.includes(s)) return [];
  if (!sentAt) {
    if (s === "draft") return ["ready", "withdrawn"];
    if (s === "ready") return ["draft", "withdrawn"];
    return ["withdrawn"];
  }
  if (s === "sent") return ["negotiation", "accepted", "rejected", "withdrawn"];
  if (s === "negotiation") return ["sent", "accepted", "rejected", "withdrawn"];
  return ["withdrawn"];
}

export function canScheduleQuoteFollowup(status: string | null | undefined): boolean {
  return status === "sent" || status === "negotiation";
}

/**
 * Kiküldés előtti visszavonás/törlés. Kiküldött (sent_at vagy zárolt) vagy lezárt ajánlatnál egyik sem.
 * A törlést az adatbázis `quote_discard_unsent` is ellenőrzi (dokumentum/utánkövetés esetén csak visszavonás).
 */
export function quoteDiscardOptions(q: { status: string | null | undefined; sent_at?: string | null; locked_at?: string | null }): { canWithdraw: boolean; canDelete: boolean } {
  const s = (q.status ?? "draft") as QuoteStatus;
  const unsent = !q.sent_at && !q.locked_at;
  const open = !CLOSED_QUOTE_STATUSES.includes(s);
  return { canWithdraw: unsent && open, canDelete: unsent && (s === "draft" || s === "ready" || s === "withdrawn") };
}
