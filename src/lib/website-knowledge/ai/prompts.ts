/**
 * Kliens-safe prompt konstansok. Nem tartalmaz szervergyakori importokat.
 * Magyar promptok — a céloldalak (vibateam.hu) is magyarul íródnak.
 */

export const SUMMARY_SYSTEM_PROMPT = `Te egy webhely-elemző asszisztens vagy.
A cél: egy céloldal tartalmából adj rövid, tömör összefoglalót magyarul, és
strukturált metaadatokat JSON-ban. Ne találj ki tényeket — csak a megadott
szövegre támaszkodj.`;

export function buildSummaryUserPrompt(input: {
  url: string;
  title: string | null;
  text: string;
}): string {
  const clipped = input.text.slice(0, 12_000);
  return [
    `URL: ${input.url}`,
    `Cím: ${input.title ?? "(nincs)"}`,
    "",
    "Oldal szöveg:",
    clipped,
    "",
    `Válaszolj EXACTLY egyetlen JSON objektummal, magyarázat vagy code fence nélkül. Séma:`,
    `{`,
    `  "summary": "3-5 mondatos magyar összefoglaló",`,
    `  "topic": "az oldal fő témája 1-3 szóban",`,
    `  "audience": "kinek szól (pl. 'kkv marketing vezetők')",`,
    `  "key_points": ["max 5 kulcspont, tömören"],`,
    `  "tone": "hangnem (pl. professzionális, edukatív, értékesítő)"`,
    `}`,
  ].join("\n");
}

export const ENTITY_SYSTEM_PROMPT = `Te egy entity-kinyerő asszisztens vagy.
A cél: egy céloldal szövegéből azonosítsd a legfontosabb entitásokat
(szolgáltatás, termék, személy, cég, helyszín, téma, technológia). Csak
olyat sorolj fel, ami ténylegesen szerepel a szövegben.`;

export function buildEntityUserPrompt(input: {
  url: string;
  title: string | null;
  text: string;
}): string {
  const clipped = input.text.slice(0, 12_000);
  return [
    `URL: ${input.url}`,
    `Cím: ${input.title ?? "(nincs)"}`,
    "",
    "Oldal szöveg:",
    clipped,
    "",
    `Válaszolj EXACTLY egyetlen JSON objektummal, magyarázat vagy code fence nélkül. Séma:`,
    `{`,
    `  "entities": [`,
    `    {`,
    `      "kind": "service|product|person|company|location|topic|technology",`,
    `      "name": "eredeti névformátumban",`,
    `      "role": "primary|secondary|mentioned",`,
    `      "confidence": 0.0-1.0 közötti szám,`,
    `      "evidence": "rövid idézet az oldalról"`,
    `    }`,
    `  ]`,
    `}`,
    "",
    "Max 15 entitás. Ha semmi releváns entitás nincs, üres tömböt adj vissza.",
  ].join("\n");
}