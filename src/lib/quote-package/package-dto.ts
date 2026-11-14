/** P5 — böngészőnek átadott ajánlatcsomag-nézet. Tárolási kulcs, URL vagy forrásár nincs benne; a belső összesítés csak CRM-felületre. */
import type { PreparedPackage } from "./package.server";

const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

export function packageDto(p: PreparedPackage) {
  const lines = p.pricingFacts?.lines ?? [];
  return {
    fingerprint: p.fingerprint, asOf: p.asOf, mode: p.mode, status: p.core.status, offerNetHuf: p.core.offerNetHuf, gates: p.core.gates, scope: p.core.scope,
    missing: p.core.missing.slice(0, 300), missingTotal: p.core.missing.length, coverLetter: p.core.coverLetter, internal: p.core.internal,
    quote: { id: p.quote.id, version: p.quote.version, alternativeKey: p.quote.alternativeKey, savedNetHuf: p.quote.savedNetHuf, locked: p.quote.locked },
    budgetDoc: p.budgetDoc, sourceSha256: p.pricingFacts?.sourceFile.sha256 ?? null,
    lines: lines.slice(0, 3000).map((l) => ({ key: l.key, name: l.name.slice(0, 160), status: l.status, lineTotalHuf: l.lineTotalHuf })), linesTruncated: lines.length > 3000,
    files: {
      priced: p.files.priced ? { name: p.files.priced.name, size: p.files.priced.bytes.length, base64: p.includeFiles ? b64(p.files.priced.bytes) : null } : null,
      scope: { name: p.files.scope.name, size: p.files.scope.bytes.length, sha256: p.files.scope.sha256, base64: p.includeFiles ? b64(p.files.scope.bytes) : null },
    },
    saved: p.saved,
  };
}
export type PackageDto = ReturnType<typeof packageDto>;
