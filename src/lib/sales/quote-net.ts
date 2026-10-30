/** Ajánlat nettó értéke a tételekből (ugyanaz a képlet, mint a nyomtatási nézetben). */
export function quoteNet(
  items: { quantity: number | string | null; unit_price: number | string | null }[],
  discountPercent: number | string | null | undefined,
): number {
  const subtotal = items.reduce((a, r) => a + (Number(r.quantity) || 0) * (Number(r.unit_price) || 0), 0);
  const disc = Math.round((subtotal * (Number(discountPercent) || 0)) / 100);
  return subtotal - disc;
}
