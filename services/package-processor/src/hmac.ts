// Aláírt üzenetek a CRM és a feldolgozó között: HMAC-SHA256 a "<időbélyeg>.<törzs>" szövegen.
// Ugyanez a formátum a CRM-oldalon (src/lib/packages/processing-policy.ts) – a teszt ellenőrzi az egyezést.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "x-viba-signature";
export const MAX_SKEW_SECONDS = 300;

export function sign(secret: string, body: string, now = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${now}.${body}`).digest("hex");
  return `t=${now},v1=${mac}`;
}

export function verify(secret: string, body: string, header: string | null | undefined, now = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(now - t) > MAX_SKEW_SECONDS || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  const want = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"), "hex");
  const got = Buffer.from(parts.v1, "hex");
  return want.length === got.length && timingSafeEqual(want, got);
}
