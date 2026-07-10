/**
 * Refresh token AES-256-GCM titkosítás. Server-only.
 *
 * A kulcs a `GOOGLE_ADS_TOKEN_ENC_KEY` secret — 32 bájt Base64/hex/utf8-ként.
 * Kimenet: `{ cipher, iv }` — mindkettő Base64. `decrypt` visszaadja a
 * plain refresh tokent.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function keyBytes(): Buffer {
  const raw = process.env.GOOGLE_ADS_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_ADS_TOKEN_ENC_KEY nincs beállítva — kötelező a refresh token titkosításához.",
    );
  }
  // Elfogadunk base64 / hex / utf8 kulcsot, mindig 32 bájtot használunk.
  let buf: Buffer;
  if (/^[0-9a-f]{64}$/i.test(raw)) buf = Buffer.from(raw, "hex");
  else {
    try {
      const b = Buffer.from(raw, "base64");
      buf = b.length >= 32 ? b : Buffer.from(raw, "utf8");
    } catch {
      buf = Buffer.from(raw, "utf8");
    }
  }
  if (buf.length < 32) {
    // Deriválás: SHA-256 pad — de itt egyszerű zero-pad hiba lenne. Dobjunk.
    throw new Error("GOOGLE_ADS_TOKEN_ENC_KEY túl rövid (min. 32 bájt szükséges).");
  }
  return buf.subarray(0, 32);
}

export function encryptRefreshToken(plain: string): { cipher: string; iv: string } {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", keyBytes(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return {
    cipher: Buffer.concat([enc, tag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export function decryptRefreshToken(cipherB64: string, ivB64: string): string {
  const buf = Buffer.from(cipherB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const tag = buf.subarray(buf.length - 16);
  const data = buf.subarray(0, buf.length - 16);
  const d = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}