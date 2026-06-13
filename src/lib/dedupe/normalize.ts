/** Cégnév normalizálás duplikációkereséshez: jogi forma, írásjelek, többes szóköz, kis/nagybetű. */
const LEGAL_FORMS = [
  "korlátolt felelősségű társaság",
  "zártkörűen működő részvénytársaság",
  "nyilvánosan működő részvénytársaság",
  "betéti társaság",
  "egyéni vállalkozó",
  "közkereseti társaság",
  "kft.", "kft", "k.f.t.",
  "zrt.", "zrt", "z.r.t.",
  "nyrt.", "nyrt",
  "bt.", "bt", "b.t.",
  "ev.", "ev",
  "kkt.", "kkt",
  "ltd.", "ltd", "inc.", "inc", "gmbh", "s.r.o.", "sro", "s.a.", "sa", "ag", "ab", "oy", "as",
];

export function normalizeCompanyName(input?: string | null): string {
  if (!input) return "";
  let s = String(input).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  for (const lf of LEGAL_FORMS) s = s.replace(new RegExp(`\\b${lf.replace(/[.+*?()|\\]/g, "\\$&")}\\b`, "gi"), " ");
  s = s.replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

export function normalizePhone(input?: string | null): string {
  if (!input) return "";
  let s = String(input).replace(/[^\d+]/g, "");
  if (s.startsWith("00")) s = "+" + s.slice(2);
  if (s.startsWith("06")) s = "+36" + s.slice(2);
  return s;
}

export function normalizeTaxNumber(input?: string | null): string {
  if (!input) return "";
  return String(input).replace(/[^0-9]/g, "").slice(0, 8); // HU adószám első 8 jegye = törzs
}

/** Egyszerűsített Jaro-szerű hasonlóság (Dice koefficiens bigrammokra). 0..1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const ab = bigrams(a), bb = bigrams(b);
  let inter = 0, total = 0;
  for (const [g, n] of ab) {
    total += n;
    inter += Math.min(n, bb.get(g) ?? 0);
  }
  for (const n of bb.values()) total += n;
  return total === 0 ? 0 : (2 * inter) / total;
}