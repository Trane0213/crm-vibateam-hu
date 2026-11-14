/**
 * P3 — ellenőrizhető árforrások, minősítés és rangsor (specifikáció 6. fejezet).
 * Rangsor: (1) projektre kapott érvényes beszállítói ár; (2) friss jóváhagyott VIBA beszerzési/munkadíjtörzs;
 * (3) összehasonlítható korábbi VIBA-ajánlat / szerződés / tényleges elszámolás; (4) piaci ár; (5) becslés.
 * Hiányzó, nem összevethető vagy elavult referencia nem válik tényárrá.
 */
import { norm, normUnit, techTokens, tokenScore, trigramScore } from "./normalize";

export type PriceSourceKind = "supplier_quote" | "ramon_approved_template" | "accepted_contract" | "actual_cost" | "viba_historical_quote" | "market_reference" | "ai_estimate";
export type PriceComponent = "material" | "labor";
/** cost = beszerzési ár / önköltség (járulék, tartalék, fedezet ráépül); sell = korábbi eladási (ajánlati) ár (fedezetet már tartalmaz). */
export type PriceBasis = "cost" | "sell";
export type NormHourBasis = "measured" | "experience" | "derived_from_price";

export const SOURCE_RANK: Record<PriceSourceKind, number> = {
  supplier_quote: 1, ramon_approved_template: 2, accepted_contract: 3, actual_cost: 3, viba_historical_quote: 3, market_reference: 4, ai_estimate: 5,
};
export const SOURCE_LABEL: Record<PriceSourceKind, string> = {
  supplier_quote: "Projektre kapott beszállítói ár", ramon_approved_template: "VIBA ár- és normasablon", accepted_contract: "Szerződött korábbi ár",
  actual_cost: "Tényleges elszámolt költség", viba_historical_quote: "Korábbi VIBA-ajánlati ár", market_reference: "Piaci referencia", ai_estimate: "Becslés",
};

export type PriceSourceItem = {
  id: string; kind: PriceSourceKind; component: PriceComponent; basis: PriceBasis;
  name: string; type?: string | null; unit: string;
  unitPriceHuf: number | null;
  /** Munkadíjnál: óra/ME és annak jellege. Visszaszámolt norma nem igazolt műszaki norma. */
  normHours?: number | null; normBasis?: NormHourBasis | null;
  /** Fix tételár (nem óradíjjal skálázható). */
  fixed?: boolean;
  manufacturer?: string | null; articleNo?: string | null; supplier?: string | null;
  priceDate: string | null; validUntil?: string | null;
  /** Jóváhagyás csak akkor igaz, ha a CRM-ben ellenőrzötten rögzített; fájlban szereplő név nem jóváhagyás. */
  approvalVerified: boolean; approvedBy?: string | null;
  section?: string | null;
  /** Rövid altételnél a megelőző leíró tétel (pl. kábeltípus) — azonos nevű, eltérő árú tételek szétválasztásához. */
  context?: string | null;
  provenance: { label: string; file?: string | null; sheet?: string | null; row?: number | null; url?: string | null; note?: string | null };
};

export type MatchCategory = "exact" | "strong" | "suggest" | "ambiguous" | "missing" | "noPrice";
export type Candidate = { item: PriceSourceItem; score: number };
export type MatchResult = { category: MatchCategory; best: Candidate | null; candidates: Candidate[] };

type Indexed = PriceSourceItem & { _key: string; _unit: string; _tech: string[]; _type: string; _tokens: string[] };
export type SourceIndex = { items: Indexed[]; byToken: Map<string, number[]> };

export function indexSources(items: PriceSourceItem[]): SourceIndex {
  const out: Indexed[] = items.map((i) => { const key = norm(i.name); return { ...i, _key: key, _unit: normUnit(i.unit), _tech: techTokens(i.name), _type: norm(i.type), _tokens: key.split(" ").filter((t) => t.length >= 3) }; });
  const byToken = new Map<string, number[]>();
  out.forEach((it, idx) => { for (const t of new Set(it._tokens)) byToken.set(t, [...(byToken.get(t) ?? []), idx]); });
  return { items: out, byToken };
}

/** Számot tartalmazó szavak (tételszám, jel, méret: „l04”, „36”, „300”) — eltérésük nem lehet automatikus egyezés. */
const digitWords = (n: string) => [...new Set(n.split(" ").filter((w) => /\d/.test(w)))].sort().join(" ");

/** A régi VIBA árazó pontszáma: 0,59 × szóegyezés + 0,41 × trigram; azonos egység kötelező; műszaki token- vagy számos szó-ütközés legfeljebb 0,68. */
export function scoreCandidate(desc: string, unit: string, type: string | null, it: Indexed): number {
  if (it._unit !== normUnit(unit)) return -1;
  const a = norm(desc); if (!a || !it._key) return -1;
  const A = techTokens(desc), B = it._tech;
  const conflict = A.some((x) => !B.includes(x)) || B.some((x) => !A.includes(x)) || digitWords(a) !== digitWords(it._key);
  const exact = a === it._key;
  let score = exact ? 1 : 0.59 * tokenScore(a, it._key) + 0.41 * trigramScore(a, it._key);
  if (type && it._type && norm(type) === it._type) score = Math.min(1, score + 0.03);
  if (conflict && !exact) score = Math.min(score, 0.68);
  return score;
}

/** Szöveghasonlóság műszakitoken-kapuval (kontextus-összevetéshez is). */
export function textSimilarity(a: string, b: string): number {
  const x = norm(a), y = norm(b); if (!x || !y) return 0;
  if (x === y) return 1;
  const A = techTokens(a), B = techTokens(b);
  const s = 0.59 * tokenScore(x, y) + 0.41 * trigramScore(x, y);
  return A.some((t) => !B.includes(t)) || B.some((t) => !A.includes(t)) || digitWords(x) !== digitWords(y) ? Math.min(s, 0.68) : s;
}

export function matchRow(index: SourceIndex, desc: string, unit: string, type: string | null, component: PriceComponent): MatchResult {
  const tokens = norm(desc).split(" ").filter((t) => t.length >= 3);
  const pool = new Set<number>(); for (const t of tokens) for (const i of index.byToken.get(t) ?? []) pool.add(i);
  const candidates: Candidate[] = [];
  for (const i of pool) { const it = index.items[i]; if (it.component !== component) continue; const s = scoreCandidate(desc, unit, type, it); if (s > 0.55) candidates.push({ item: it, score: s }); }
  candidates.sort((a, b) => b.score - a.score || SOURCE_RANK[a.item.kind] - SOURCE_RANK[b.item.kind] || a.item.id.localeCompare(b.item.id));
  const top = candidates.slice(0, 8);
  if (!candidates.length) return { category: "missing", best: null, candidates: [] };
  const best = candidates[0], second = candidates.find((c) => c.item.id !== best.item.id && c.score < best.score);
  const sameTop = candidates.filter((c) => Math.abs(c.score - best.score) < 1e-5 && SOURCE_RANK[c.item.kind] === SOURCE_RANK[best.item.kind]);
  if (best.item.unitPriceHuf == null && best.item.normHours == null) return { category: "noPrice", best, candidates: top };
  if (sameTop.length > 1 && new Set(sameTop.map((c) => `${c.item.unitPriceHuf ?? ""}|${c.item.normHours ?? ""}`)).size > 1) return { category: "ambiguous", best, candidates: top };
  if (best.score >= 0.995) return { category: "exact", best, candidates: top };
  if (best.score >= 0.925 && (!second || best.score - second.score >= 0.075)) return { category: "strong", best, candidates: top };
  if (best.score >= 0.65) return { category: "suggest", best, candidates: top };
  return { category: "missing", best: null, candidates: top };
}

export type Eligibility = { ok: true } | { ok: false; reason: string };

/** Automatikusan felhasználható-e az ár — determinisztikus, indokolt döntés. */
export function eligibility(it: PriceSourceItem, asOf: string, maxAgeDays: number, opts: { allowHistorical: boolean; allowUnapprovedTemplate: boolean }): Eligibility {
  if (SOURCE_RANK[it.kind] >= 4) return { ok: false, reason: `${SOURCE_LABEL[it.kind]} nem válhat automatikusan tényárrá.` };
  if (it.kind === "viba_historical_quote" && !opts.allowHistorical) return { ok: false, reason: "Korábbi ajánlati ár automatikus használata kikapcsolva." };
  if (it.kind === "ramon_approved_template" && !it.approvalVerified && !opts.allowUnapprovedTemplate) return { ok: false, reason: "Az ársablon jóváhagyása a CRM-ben nincs rögzítve." };
  if (it.kind === "supplier_quote" && !it.approvalVerified) return { ok: false, reason: "A beszállítói ár ellenőrzése nincs rögzítve." };
  if (!it.priceDate) return { ok: false, reason: "Az ár dátuma ismeretlen, frissessége nem igazolható." };
  if (it.validUntil && it.validUntil < asOf) return { ok: false, reason: `Az ár érvényessége lejárt (${it.validUntil}).` };
  const age = (Date.parse(asOf) - Date.parse(it.priceDate)) / 86_400_000;
  if (!Number.isFinite(age)) return { ok: false, reason: "Érvénytelen árdátum." };
  if (age < 0) return { ok: false, reason: "Az ár dátuma az értéknap utáni." };
  if (age > maxAgeDays) return { ok: false, reason: `Elavult ár (${Math.floor(age)} nap, korlát ${maxAgeDays} nap).` };
  return { ok: true };
}
