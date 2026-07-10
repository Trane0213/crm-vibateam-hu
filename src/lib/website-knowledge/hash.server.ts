/**
 * Tartalom-hash számítás. SHA-256 hex.
 */

import { createHash } from "node:crypto";

export function normalizeForHash(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function contentHash(input: string): string {
  const norm = normalizeForHash(input);
  return createHash("sha256").update(norm, "utf8").digest("hex");
}