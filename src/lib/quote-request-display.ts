/**
 * Webes megkeresések (quote_requests) megjelenítési szabályai — tiszta függvények.
 * - Beérkezés = weboldali eredeti idő (source_created_at), ha van; különben CRM created_at.
 * - TESZT jelölés: név/e-mail/üzenet "TESZT"/"TEST" szóval.
 * - Eredeti űrlapadatok: újra-sanitizált, csak szövegként megjelenített kulcs–érték lista.
 */
import { sanitizePayload } from "./website-lead-sync";

type Dated = { created_at: string; source_created_at?: string | null };
export function receivedAt(r: Dated): string {
  return r.source_created_at || r.created_at;
}

export function isTestRequest(r: { name?: string | null; email?: string | null; message?: string | null }): boolean {
  return [r.name, r.email, r.message].some((v) => !!v && /(^|[^a-z0-9áéíóöőúüű])(teszt|test)([^a-z0-9áéíóöőúüű]|$)/i.test(v));
}

const BLOB_RE = /^data:|^blob:|^[A-Za-z0-9+/=]{400,}$/;

/** Lapos [kulcs, szöveg] lista; titok-, blob- és aláírt URL-szerű értékek kihagyva. */
export function payloadEntries(payload: unknown): Array<[string, string]> {
  const clean = sanitizePayload(payload);
  if (!clean || typeof clean !== "object" || Array.isArray(clean)) return [];
  const out: Array<[string, string]> = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v === null || v === undefined) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        walk(v as Record<string, unknown>, key);
        continue;
      }
      const text = Array.isArray(v) ? v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ") : String(v);
      if (BLOB_RE.test(text)) continue;
      out.push([key, text.slice(0, 2000)]);
    }
  };
  walk(clean as Record<string, unknown>, "");
  return out.slice(0, 200);
}
