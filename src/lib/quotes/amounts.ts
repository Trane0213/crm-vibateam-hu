/**
 * Ajánlati összegek (S2): tételes nettó (DB-trigger által számolt total_amount,
 * csak ha van tétel) vs. kézzel megadott nettó (fájlalapú ajánlat).
 * Ismeretlen összeg nem számít 0 Ft-nak.
 */
export type QuoteAmounts = {
  source: "items" | "manual" | "none";
  net: number | null;
  vatPercent: number;
  vat: number | null;
  gross: number | null;
  mismatch: boolean;
  itemsNet: number | null;
  manualNet: number | null;
};

export function quoteAmounts(input: {
  itemCount: number;
  totalAmount: number | null | undefined;
  manualNetAmount: number | null | undefined;
  taxPercent: number | null | undefined;
}): QuoteAmounts {
  const itemsNet = input.itemCount > 0 && input.totalAmount != null ? Number(input.totalAmount) : null;
  const manualNet = input.manualNetAmount != null ? Number(input.manualNetAmount) : null;
  const vatPercent = input.taxPercent == null ? 27 : Number(input.taxPercent);
  const net = itemsNet ?? manualNet;
  const source = itemsNet != null ? "items" : manualNet != null ? "manual" : "none";
  const vat = net == null ? null : Math.round((net * vatPercent) / 100);
  return {
    source, net, vatPercent, vat, gross: net == null ? null : net + (vat ?? 0),
    mismatch: itemsNet != null && manualNet != null && Math.abs(itemsNet - manualNet) >= 1,
    itemsNet, manualNet,
  };
}
