/**
 * S6: saját VIBA-ajánlatsablonok. A szövegek TERVEZETEK — a végleges szerződési/jogi
 * tartalmat a tulajdonosnak jóvá kell hagynia. Sablon csak kézi „Sablon betöltése"
 * művelettel kerül ajánlatra; ajánlatonként minden feltétel szerkeszthető.
 * Új szövegváltozatnál a `version` számot növelni kell (sablonváltozat-követés).
 */
export type TemplateKey = "private" | "b2b";
export type TermSection = { key: string; label: string; default: string };
export type QuoteTemplate = { key: TemplateKey; label: string; version: number; audience: string; sections: TermSection[] };

const DRAFT = "[TERVEZET – egyeztetendő] ";

export const QUOTE_TEMPLATES: Record<TemplateKey, QuoteTemplate> = {
  private: {
    key: "private", label: "Magánszemélyes ajánlat", version: 1,
    audience: "Lakások, családi házak és kisebb villamos munkák",
    sections: [
      { key: "schedule", label: "Vállalási idő és ütemezés", default: DRAFT + "A munka kezdésének és befejezésének időpontja egyeztetés szerint." },
      { key: "payment", label: "Fizetési feltételek", default: DRAFT + "Fizetés a teljesítést követően, számla alapján." },
      { key: "warranty", label: "Garanciális feltételek", default: DRAFT + "A jogszabályban előírt jótállás és szavatosság szerint." },
      { key: "conditions", label: "Egyéb feltételek", default: "" },
    ],
  },
  b2b: {
    key: "b2b", label: "Céges / B2B ajánlat", version: 1,
    audience: "Generálkivitelezők, irodaházak, társasházak, ipari projektek",
    sections: [
      { key: "references", label: "Terv- és kiírási hivatkozások", default: "" },
      { key: "assumptions", label: "Feltételezések", default: "" },
      { key: "schedule", label: "Ütemezés, munkaterület-átadás és kapacitás", default: DRAFT + "Ütemezés a megrendelővel egyeztetett műszaki ütemterv szerint." },
      { key: "payment", label: "Részteljesítés, teljesítésigazolás és fizetés", default: DRAFT + "Részszámlázás teljesítésigazolás alapján, a szerződés szerinti fizetési határidővel." },
      { key: "extra_work", label: "Többletmunka és tervváltozás", default: DRAFT + "Többletmunka és tervváltozás csak előzetes írásos megrendelés alapján." },
      { key: "warranty", label: "Garancia", default: DRAFT + "A jogszabályban előírt jótállás és szavatosság szerint." },
      { key: "annexes", label: "Szerződési mellékletek", default: "" },
    ],
  },
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return v === "private" || v === "b2b";
}

/** Sablon alapértékek — a már kitöltött feltételeket soha nem írja felül. */
export function applyTemplateDefaults(key: TemplateKey, current: Record<string, string> | null | undefined): Record<string, string> {
  const out: Record<string, string> = { ...(current ?? {}) };
  for (const s of QUOTE_TEMPLATES[key].sections) {
    if (!out[s.key]?.trim()) out[s.key] = s.default;
  }
  return out;
}

export function hasDraftTerms(terms: Record<string, string> | null | undefined): boolean {
  return Object.values(terms ?? {}).some((t) => typeof t === "string" && t.includes("[TERVEZET"));
}
