/** Árazási teljesség: csak teljesen árazott, visszaellenőrzött számítás nettója lehet ajánlati összeg. */
export type CompletenessTotals = { byStatus: Record<string, number>; netHuf: number };
export function openLines(t: { byStatus: Record<string, number> }): number {
  return (t.byStatus.review ?? 0) + (t.byStatus.blocked ?? 0) + (t.byStatus.excluded_review ?? 0) + (t.byStatus.missing ?? 0);
}
export function pricingComplete(t: CompletenessTotals, exportStatus: string): boolean {
  return exportStatus === "verified" && openLines(t) === 0 && t.netHuf > 0;
}
