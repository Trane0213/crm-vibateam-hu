/**
 * P3 árazás — szöveg-, mértékegység- és számnormalizálás.
 * A régi VIBA automatikus árazó (HTML) párosítási logikájának hű, tesztelt átirata;
 * böngésző- és szerverbiztos, mellékhatás nélküli.
 */

export function norm(v: unknown): string {
  return String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[×✕]/g, "x").replace(/²/g, "2").replace(/³/g, "3").replace(/[σ∑Σ]/g, " osszesen ")
    .replace(/\bopcionalis\b/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

/** Műszaki azonosító tokenek (keresztmetszet, IP-védettség, áramerősség, átmérő) — ütközésük kizárja az automatikus egyezést. */
export function techTokens(text: unknown): string[] {
  const x = String(text ?? "").toLowerCase().replace(/,/g, ".").replace(/[×✕]/g, "x").replace(/²/g, "2");
  const found = x.match(/\b\d+(?:\.\d+)?\s*x\s*\d+(?:[./]\d+)?(?:\/\d+)?(?:\s*mm2)?\b|\bip\s*\d{2}\b|\b\d+(?:\.\d+)?\s*mm2\b|\b\d+\s*a\b|\bfi\s*\d+\b/g) ?? [];
  return [...new Set(found.map((t) => t.replace(/\s/g, "")))].sort();
}

export function tokenScore(a: string, b: string): number {
  const A = new Set(a.split(" ").filter(Boolean)), B = new Set(b.split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

export function trigramScore(a: string, b: string): number {
  const grams = (s: string) => { const x = ` ${s} `, m = new Set<string>(); for (let i = 0; i < x.length - 2; i++) m.add(x.slice(i, i + 3)); return m; };
  const A = grams(a), B = grams(b);
  let inter = 0; for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
}

const UNIT_ALIASES: Record<string, string> = {
  fm: "m", m: "m", meter: "m", metre: "m", folyometer: "m", m1: "m",
  m2: "m2", nm: "m2", m3: "m3", lm: "m3",
  db: "db", darab: "db", pcs: "db",
  tetel: "tetel", tetelben: "tetel",
  klt: "klt", komplett: "klt", keszlet: "klt",
  ktg: "ktg", koltseg: "ktg",
  ora: "ora", h: "ora", mo: "ora", munkaora: "ora",
  kg: "kg", t: "t", l: "l", liter: "l",
  pld: "pld", garnitura: "gar", gar: "gar", pár: "par", par: "par", csomag: "csomag", tekercs: "tekercs",
};

/** Mértékegység kanonikus alakja. Ismeretlen egység változatlan normalizált szöveg — soha nem feltételezett átváltás. */
export function normUnit(v: unknown): string {
  const x = norm(v).replace(/\s/g, "");
  return UNIT_ALIASES[x] ?? x;
}

/** Magyar és angol számformátumok; pénznemet és egységszöveget elhagy. Nem szám → null. */
export function parseNumber(x: unknown): number | null {
  if (x == null) return null;
  if (typeof x === "number") return Number.isFinite(x) ? x : null;
  if (typeof x === "boolean") return null;
  let t = String(x).trim().replace(/[\u00a0\u202f ]/g, "").replace(/Ft|HUF|óra|db/gi, "");
  if (!t) return null;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = t.replace(",", ".");
  if (!/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Rövid, önmagában nem azonosító tételnév (pl. „3x4 mm2”, „kék”): legfeljebb egy legalább 3 betűs szó. */
export function isShortName(v: unknown): boolean {
  const words = norm(v).split(" ").filter((w) => /^[a-z]{3,}$/.test(w) && !["mm2", "mm"].includes(w));
  return words.length <= 1;
}
