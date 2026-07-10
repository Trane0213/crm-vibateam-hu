/**
 * Netlify webhook HMAC verifikáció. SERVER-ONLY use.
 *
 * A Netlify outgoing webhook a `X-Webhook-Signature` (vagy `X-Netlify-Webhook-Signature`)
 * headerben egy HMAC-SHA256 hex digestet küld a raw body-ról, a beállított
 * signing secretet használva. Timing-safe összehasonlítást használunk.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function computeHmacSha256Hex(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
}

export function verifyNetlifySignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;
  const expected = computeHmacSha256Hex(secret, rawBody);
  // A header lehet plain hex, vagy "sha256=..." prefixszel.
  const provided = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice("sha256=".length)
    : signatureHeader;
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}