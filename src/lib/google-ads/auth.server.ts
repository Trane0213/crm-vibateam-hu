/**
 * Google Ads OAuth state HMAC helper. Server-only.
 * Ugyanaz a séma, mint a Gmail integrációnál, de saját secretet használ,
 * hogy a két flow ne keveredhessen össze.
 */
import { createHmac, timingSafeEqual } from "crypto";

function stateSecret(): string {
  const s =
    process.env.GOOGLE_ADS_STATE_SECRET ??
    process.env.GOOGLE_ADS_TOKEN_ENC_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "GOOGLE_ADS_STATE_SECRET nincs beállítva (fallback: GOOGLE_ADS_TOKEN_ENC_KEY / SUPABASE_SERVICE_ROLE_KEY sem).",
    );
  }
  return s;
}

function b64u(b: Buffer | string): string {
  const buf = typeof b === "string" ? Buffer.from(b, "utf8") : b;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function ub64u(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const mac = createHmac("sha256", stateSecret()).update(payload).digest();
  return `${b64u(payload)}.${b64u(mac)}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000): string {
  const [p, m] = state.split(".");
  if (!p || !m) throw new Error("Hibás state");
  const payload = ub64u(p).toString("utf8");
  const mac = ub64u(m);
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw new Error("Érvénytelen state aláírás");
  }
  const [userId, tsStr] = payload.split(".");
  if (!userId || !tsStr) throw new Error("Hibás state payload");
  if (Date.now() - Number(tsStr) > maxAgeMs) throw new Error("Lejárt state");
  return userId;
}