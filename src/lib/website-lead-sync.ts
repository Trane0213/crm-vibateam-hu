/**
 * Weboldal → CRM beérkező megkeresés szinkron — tiszta (I/O nélküli) logika.
 * A végpont: src/routes/api/public/website-lead-sync.ts
 * Szerződés: docs/integrations/website-lead-sync-api-v1.md
 *
 * Hitelesítés: HMAC-SHA256(secret, `${timestamp}.${rawBody}`) hexben,
 * fejlécek: X-Viba-Timestamp (unix mp), X-Viba-Signature: sha256=<hex>.
 * Web Crypto-t használ (Cloudflare Workers kompatibilis).
 */
import { z } from "zod";

export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_SKEW_SECONDS = 300;
export const SOURCE_TYPES = [
  "lakossagi",
  "tarsashazi",
  "general",
  "kapcsolat",
  "visszahivas",
  "letoltes",
] as const;

export type SyncErrorCode =
  | "missing_auth"
  | "invalid_signature"
  | "stale_timestamp"
  | "payload_too_large"
  | "invalid_json"
  | "validation_failed"
  | "invalid_attachment"
  | "server_misconfigured"
  | "storage_error";

export const ERROR_STATUS: Record<SyncErrorCode, number> = {
  missing_auth: 401,
  invalid_signature: 401,
  stale_timestamp: 401,
  payload_too_large: 413,
  invalid_json: 400,
  validation_failed: 422,
  invalid_attachment: 422,
  server_misconfigured: 503,
  storage_error: 503,
};

// --- Signature -------------------------------------------------------------

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeSignature(secret: string, timestamp: string, rawBody: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return toHex(sig);
}

function constantTimeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function verifyRequestAuth(opts: {
  secret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
  nowSeconds: number;
}): Promise<SyncErrorCode | null> {
  const { secret, timestamp, signature, rawBody, nowSeconds } = opts;
  if (!timestamp || !signature) return "missing_auth";
  if (!/^\d{9,11}$/.test(timestamp)) return "stale_timestamp";
  if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) return "stale_timestamp";
  const provided = signature.replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return "invalid_signature";
  const expected = await computeSignature(secret, timestamp, rawBody);
  return constantTimeEqual(provided, expected) ? null : "invalid_signature";
}

// --- Payload ---------------------------------------------------------------

/** Vezérlőkarakterek eltávolítása, trim, üres → null. Tartalom nem értelmeződik (csak szöveg). */
function clean(max: number) {
  return z
    .string()
    .max(max)
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim())
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
}

const ATTACHMENT_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9_\-./]{0,299}$/;

export const websiteLeadSchema = z
  .object({
    lead_id: z.string().uuid(),
    created_at: z.string().datetime({ offset: true }),
    source_type: z.enum(SOURCE_TYPES),
    name: clean(200),
    email: z.string().trim().max(254).email().nullable().optional(),
    phone: clean(50),
    source_page: clean(500),
    origin_page: clean(500),
    entry_page: clean(500),
    utm: z.record(z.string().max(40), z.string().max(300)).nullable().optional(),
    project_type: clean(200),
    property_type: clean(200),
    budget: clean(100),
    company_name: clean(200),
    apartment_count: clean(50),
    consent: z.boolean().nullable().optional(),
    message: clean(10000),
    attachment_path: z.string().max(300).nullable().optional(),
    payload: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .strict();

export type WebsiteLeadInput = z.infer<typeof websiteLeadSchema>;

export function isSafeAttachmentPath(p: string): boolean {
  if (!ATTACHMENT_PATH_RE.test(p)) return false;
  if (p.includes("..") || p.includes("//")) return false;
  if (/^https?:/i.test(p) || /token=|signature=/i.test(p)) return false;
  return true;
}

export type ParseResult =
  | { ok: true; data: WebsiteLeadInput }
  | { ok: false; code: SyncErrorCode; details?: string[] };

export function parseWebsiteLead(rawBody: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return { ok: false, code: "invalid_json" };
  }
  const parsed = websiteLeadSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      code: "validation_failed",
      details: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`),
    };
  }
  const d = parsed.data;
  if (!d.name && !d.email && !d.phone) {
    return { ok: false, code: "validation_failed", details: ["contact: name/email/phone required"] };
  }
  if (d.source_type === "visszahivas" && !d.phone) {
    return { ok: false, code: "validation_failed", details: ["phone: required for visszahivas"] };
  }
  if (d.attachment_path && !isSafeAttachmentPath(d.attachment_path)) {
    return { ok: false, code: "invalid_attachment" };
  }
  if (d.payload && JSON.stringify(d.payload).length > 32 * 1024) {
    return { ok: false, code: "payload_too_large" };
  }
  return { ok: true, data: d };
}

/** quote_requests sorrá alakítás. A form_type a source_type-ot tükrözi (meglévő lista ezt mutatja). */
export function toQuoteRequestRow(d: WebsiteLeadInput, nowIso: string) {
  return {
    source_lead_id: d.lead_id,
    source_system: "vibateam.hu",
    source_type: d.source_type,
    form_type: d.source_type,
    source_created_at: d.created_at,
    created_at: d.created_at,
    synced_at: nowIso,
    name: d.name ?? "(név nélkül)",
    email: d.email ?? null,
    phone: d.phone ?? null,
    source_page: d.source_page ?? null,
    origin_page: d.origin_page ?? null,
    entry_page: d.entry_page ?? null,
    utm: d.utm ?? null,
    project_type: d.project_type ?? null,
    property_type: d.property_type ?? null,
    budget: d.budget ?? null,
    company_name: d.company_name ?? null,
    apartment_count: d.apartment_count ?? null,
    consent: d.consent ?? null,
    message: d.message ?? null,
    attachment_path: d.attachment_path ?? null,
    attachment_url: null,
    payload: d.payload ?? null,
  };
}
