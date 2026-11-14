/**
 * P5 — ajánlatcsomag szerveroldali összeállítása egy KAPOTT KÖLTSÉGVETÉSES ajánlathoz.
 * Ugyanaz a P3 árazómotor és P4 tervellenőrzés fut (nincs második ár- vagy tervlogika), a hívó saját RLS-ével.
 * Jogosultság: Tulajdonos/Sales. Csak olvas: nem ment, nem tölt fel, nem küld, nem hagy jóvá.
 * A korábban mentett „Árazott Excel” / „Műszaki lehatárolás” dokumentumokat tartalom szerint ellenőrzi
 * (XLSX: ZIP-részenként, DOCX: SHA-256), így egy régi fájl nem számít a mostani csomag részének.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { unzipSync } from "fflate";
import { assertPricingRole, budPestDate, fetchR2, PricingAccessError, priceQuoteBudget } from "@/lib/pricing/pricing.server";
import { reviewQuotePlans } from "@/lib/plans/plan-review.server";
import type { PriceSourceItem } from "@/lib/pricing/price-sources";
import { canonical, composePackage, offerNet, type ComposeInput, type PackageMode, type PricingFacts, type ReviewFacts } from "./package-model";
import { buildScopeDocx, scopeFileName } from "./scope-docx";
import type { PackageRequest } from "./package-schema";

type Sb = SupabaseClient<any, any, any>;
type Download = (key: string, limit: number) => Promise<Uint8Array>;
const SAVE_CHECK_LIMIT = 20 * 1024 * 1024;
const safeKey = (k: string) => !!k && k.length <= 1024 && !k.includes("..") && !k.startsWith("/") && !k.includes("://");

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Két XLSX tartalmilag azonos, ha minden ZIP-rész bájtra egyezik (a ZIP-dátum nem számít). */
export function sameZipContent(a: Uint8Array, b: Uint8Array): boolean {
  try {
    const A = unzipSync(a), B = unzipSync(b), ka = Object.keys(A).sort(), kb = Object.keys(B).sort();
    if (ka.length !== kb.length || ka.some((k, i) => k !== kb[i])) return false;
    return ka.every((k) => { const x = A[k]!, y = B[k]!; if (x.length !== y.length) return false; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false; return true; });
  } catch { return false; }
}

export class PackageInputError extends Error {}

export async function prepareQuotePackage(sb: Sb, userId: string, input: PackageRequest, opts: { role?: string | null; download?: Download; referenceSources?: () => PriceSourceItem[]; asOf?: string } = {}) {
  const role = await assertPricingRole(sb, userId, opts.role);
  const q = await sb.from("quotes").select("id,title,version,alternative_key,quote_kind,scope_type,technical_scope,exclusions,valid_until,manual_net_amount,locked_at,status,contact_id,lead_id,project_id").eq("id", input.quoteId).maybeSingle();
  if (q.error || !q.data) throw new PricingAccessError("Az ajánlat nem hozzáférhető.");
  const quote = q.data as Record<string, any>;
  if (quote.quote_kind !== "received_budget") throw new PackageInputError("Ajánlatcsomag a kapott költségvetéses ajánlatokhoz készül; saját VIBA-ajánlatnál a meglévő PDF-útvonal érvényes.");
  const docsRes = await sb.from("quote_documents").select("id,name,file_url,size_bytes,document_type,created_at").eq("quote_id", input.quoteId).order("created_at", { ascending: false });
  if (docsRes.error) throw new PricingAccessError("Az ajánlat dokumentumai nem olvashatók.");
  const docs = (docsRes.data ?? []) as { id: string; name: string; file_url: string | null; size_bytes: number | null; document_type: string; created_at: string | null }[];
  const budgetDoc = input.budgetDocumentId ? docs.find((d) => d.id === input.budgetDocumentId) : docs.find((d) => d.document_type === "unpriced_budget" && /\.(xlsx|xlsm|xls)$/i.test(d.name));
  if (input.budgetDocumentId && !budgetDoc) throw new PricingAccessError("A költségvetés nem olvasható vagy más ajánlathoz tartozik.");
  const mode: PackageMode = input.mode ?? (quote.scope_type === "material_labor" ? "full_construction" : "subcontractor_labor");
  let contactName: string | null = null;
  if (quote.contact_id) { const c = await sb.from("contacts").select("id,name").eq("id", quote.contact_id).maybeSingle(); contactName = (c.data?.name as string | null) ?? null; }

  // Egy letöltés fájlonként (a P3 és a P4 ugyanazt a költségvetést olvassa).
  const raw = opts.download ?? fetchR2, cache = new Map<string, Promise<Uint8Array>>();
  const download: Download = (key, limit) => { if (!cache.has(key)) cache.set(key, raw(key, limit)); return cache.get(key)!; };
  const asOf = opts.asOf ?? budPestDate();

  let pricing: PricingFacts | null = null, pricingError: string | null = null, exportBytes: Uint8Array | null = null, writesDigest = "";
  if (budgetDoc) {
    try {
      const r = await priceQuoteBudget(sb, userId, { quoteId: input.quoteId, documentId: budgetDoc.id, mode, overrides: input.overrides, includeReference: true, template: input.template, adjustments: [], buildWorkbook: true }, { role, download, referenceSources: opts.referenceSources });
      const res = r.output.run.result, ex = r.output.exportResult;
      const sourced = (c: (typeof res.lines)[number]["material"]) => !c || c.status !== "priced" || !!c.source || c.confidence === "estimate" || c.confidence === "manual";
      pricing = {
        sourceFile: { name: r.output.file.name, sha256: r.output.file.sha256 },
        totals: { netHuf: res.totals.netHuf, materialHuf: res.totals.materialHuf, laborHuf: res.totals.laborHuf, existingHuf: res.totals.existingHuf, lines: res.totals.lines, byStatus: res.totals.byStatus },
        lines: res.lines.map((l) => ({ key: l.key, sheet: l.sheet, row: l.row, name: l.name.slice(0, 300), section: l.section.slice(0, 160), status: l.status, lineTotalHuf: l.lineTotalHuf, sourced: sourced(l.material) && sourced(l.labor) })),
        blockers: res.blockers,
        export: ex.status === "verified" ? { status: "verified", fileName: ex.fileName, bytes: ex.bytes.length, writtenCells: ex.writtenCells } : { status: ex.status, reasons: ex.reasons },
      };
      if (ex.status === "verified") exportBytes = ex.bytes;
      writesDigest = await sha256Hex(canonical(res.lines.flatMap((l) => l.writes.map((w) => `${w.address}=${w.valueHuf}`)).sort()));
    } catch (e) {
      if (e instanceof PricingAccessError) throw e;
      pricingError = e instanceof Error && /korlát|túl nagy|nem Excel|munkafüzet|ársablon|Érvénytelen|szükséges/.test(e.message) ? e.message : "A költségvetés nem dolgozható fel (sérült, titkosított vagy nem támogatott fájl).";
    }
  }
  let review: ReviewFacts | null = null, reviewError: string | null = null;
  try {
    const r = await reviewQuotePlans(sb, userId, { quoteId: input.quoteId, budgetDocumentId: budgetDoc?.id ?? null, mode, overrides: input.overrides, rules: null, adjustments: [], clarifications: [], template: null }, { role, download, referenceSources: opts.referenceSources });
    const x = r.result;
    review = {
      findings: x.findings.map((f) => ({ id: f.id, category: f.category, severity: f.severity, title: f.title, question: f.question, topic: f.topic })),
      questions: x.questions, allTextRead: x.completeness.allTextRead,
      cabinets: x.cabinets.map((c) => { const e = x.pricing.estimates.find((z) => z.cabinetId === c.id); return { id: c.id, status: c.status, mismatch: c.reconciliation.some((z) => z.ok === false), priceComplete: !!e?.totals.complete, pricedHuf: e?.totals.pricedHuf ?? 0, blockReasons: e?.totals.blockReasons ?? [] }; }),
      files: x.matrix.map((m) => ({ fileName: m.fileName, full: m.status === "full", label: m.label, reasons: m.reasons })),
    };
  } catch (e) {
    if (e instanceof PricingAccessError) throw e;
    reviewError = "A tervellenőrzés nem futott le — a lehatárolás csak a költségvetésre épül.";
  }

  const meta = { quoteTitle: String(quote.title ?? "").trim() || "VIBA-TEAM ajánlat", version: quote.version ?? null, alternativeKey: String(quote.alternative_key ?? "A"), customer: null, asOf, budgetFile: budgetDoc?.name ?? null };
  const scopeName = scopeFileName(meta);
  const ci: ComposeInput = {
    quote: { id: quote.id, title: quote.title ?? null, version: quote.version ?? null, alternativeKey: meta.alternativeKey, kind: quote.quote_kind, validUntil: quote.valid_until ?? null, technicalScope: quote.technical_scope ?? null, exclusions: quote.exclusions ?? null, savedNetHuf: quote.manual_net_amount == null ? null : Number(quote.manual_net_amount), locked: !!quote.locked_at, contactName },
    mode, asOf, budgetDocName: budgetDoc?.name ?? null, scopeFileName: scopeName, pricing, pricingError, review, reviewError,
  };
  const core = composePackage(ci);
  const scopeBytes = buildScopeDocx(meta, core.scope);
  const scopeSha = await sha256Hex(scopeBytes);
  const fingerprint = await sha256Hex(canonical({ v: 1, quote: { id: quote.id, version: quote.version ?? null, alt: meta.alternativeKey }, mode, overrides: input.overrides, template: input.template?.name ?? null,
    source: pricing?.sourceFile.sha256 ?? null, writes: writesDigest, net: offerNet(pricing), scopeSha, letter: core.coverLetter, gates: core.gates.map((g) => [g.key, g.ok]) }));

  // Mentett példányok tartalmi visszaellenőrzése (csak olvasás, a hívó RLS-ével látható sorokon).
  const verify = async (type: string, name: string | null, check: (b: Uint8Array) => Promise<boolean> | boolean) => {
    const ids: string[] = [], different: string[] = [];
    if (!name) return { ids, different };
    for (const d of docs.filter((x) => x.document_type === type && x.name === name).slice(0, 3)) {
      if (!safeKey(String(d.file_url ?? "")) || Number(d.size_bytes ?? 0) > SAVE_CHECK_LIMIT) { different.push(d.id); continue; }
      try { (await check(await download(String(d.file_url), SAVE_CHECK_LIMIT))) ? ids.push(d.id) : different.push(d.id); } catch { different.push(d.id); }
    }
    return { ids, different };
  };
  const pricedSaved = exportBytes ? await verify("priced_budget", pricing?.export.status === "verified" ? pricing.export.fileName : null, (b) => sameZipContent(b, exportBytes!)) : { ids: [], different: [] };
  const scopeSaved = await verify("technical_scope", scopeName, async (b) => (await sha256Hex(b)) === scopeSha);

  return {
    role, fingerprint, asOf, mode, core, quote: ci.quote,
    pricingFacts: pricing, review, budgetDoc: budgetDoc ? { id: budgetDoc.id, name: budgetDoc.name } : null,
    files: { priced: exportBytes && pricing?.export.status === "verified" ? { name: pricing.export.fileName, bytes: exportBytes } : null, scope: { name: scopeName, bytes: scopeBytes, sha256: scopeSha } },
    saved: { pricedDocIds: pricedSaved.ids, pricedDifferentIds: pricedSaved.different, scopeDocIds: scopeSaved.ids, scopeDifferentIds: scopeSaved.different },
    includeFiles: input.includeFiles,
  };
}

export type PreparedPackage = Awaited<ReturnType<typeof prepareQuotePackage>>;
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };

/** Böngészőnek átadott nézet. A belső összesítés (anyag/díj/szekrény-részösszeg) csak a CRM-felületen látszik, ügyfélfájlba nem kerül. */
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
