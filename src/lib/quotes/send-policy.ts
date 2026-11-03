import { MAX_BYTES } from "@/lib/r2-policy";

/** S4: ajánlat-kiküldés szabályai — szerver és kliens közös, tesztelt. */
export const OUTBOUND_TOTAL_MAX = MAX_BYTES.outbound; // meglévő 20 MB-os kimenő korlát

export const isIdempotencyKey = (v: unknown): v is string =>
  typeof v === "string" && /^[A-Za-z0-9-]{16,64}$/.test(v);

/** A quoted attachment must actually be present, both in UI and on the server. */
export function checkReferencedAttachment(text: string, attachmentCount: number): string | null {
  const plain = text.replace(/<[^>]*>/g, " ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (attachmentCount === 0 && /\b(mellekelten|mellekelt|melleklet\w*|csatolt|csatolva|csatolmany\w*|attached|attachment\w*)\b/.test(plain)) {
    return "A levél csatolt ajánlatra hivatkozik, de nincs kiválasztott melléklet. Csatold az ajánlatot, vagy módosítsd a kísérőlevelet.";
  }
  return null;
}

/** Live Gmail evidence, not an editable CRM outbound flag, proves delivery. */
export function isVerifiedSentMessage(message: { id: string; labelIds?: string[]; internalDate?: string }, expectedId: string): boolean {
  const date = Number(message.internalDate);
  return message.id === expectedId && !!message.labelIds?.includes("SENT") && Number.isFinite(date) && date > 0;
}

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
