import { MAX_BYTES } from "@/lib/r2-policy";

/** S4: ajánlat-kiküldés szabályai — szerver és kliens közös, tesztelt. */
export const OUTBOUND_TOTAL_MAX = MAX_BYTES.outbound; // meglévő 20 MB-os kimenő korlát

export const isIdempotencyKey = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9-]{16,64}$/.test(v);

export function checkOutboundSize(sizes: (number | null | undefined)[]): string | null {
  const total = sizes.reduce<number>((a, s) => a + (Number(s) || 0), 0);
  if (total > OUTBOUND_TOTAL_MAX) {
    return `A mellékletek összmérete ${(total / 1024 / 1024).toFixed(1)} MB — legfeljebb ${OUTBOUND_TOTAL_MAX / 1024 / 1024} MB küldhető. Válassz kevesebb fájlt, vagy küldd letöltési linkkel.`;
  }
  return null;
}

/** A kiválasztott dokumentumoknak mind az adott ajánlathoz kell tartozniuk. */
export function checkQuoteDocs(requested: string[], found: { id: string; quote_id: string }[], quoteId: string): string | null {
  const uniq = Array.from(new Set(requested));
  if (uniq.length !== requested.length) return "Ismétlődő melléklet.";
  if (found.length !== uniq.length || found.some((d) => d.quote_id !== quoteId)) return "A melléklet nem ehhez az ajánlathoz tartozik, vagy nem elérhető.";
  return null;
}
