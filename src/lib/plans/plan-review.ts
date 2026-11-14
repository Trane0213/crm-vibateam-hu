/**
 * P4 — tervellenőrzés és szekrénykalkuláció összefogása (tiszta függvény; nem ment, nem küld).
 * Bemenet: tervoldalak (bármely forrásból), opcionális P3 költségvetés-kivonat, ellenőrzött e-mailes pontosítások,
 * árforrások és kalkulációs profil. Kimenet: tervjegyzék, feldolgozottsági mátrix, szekrény-BOM-ok, költségnemenkénti
 * kalkuláció, eltéréslista, kérdéslista és korlátok.
 */
import type { BudgetExtract } from "@/lib/pricing/budget-extract";
import type { PriceSourceItem } from "@/lib/pricing/price-sources";
import type { CalculationProfile } from "@/lib/pricing/profiles";
import { buildCabinets, cabinetWithoutDrawing } from "./cabinet-bom";
import { priceCabinets, type CabinetAdjustment, type CabinetRules } from "./cabinet-pricing";
import type { PlanFile, PlanPage } from "./plan-text";
import { checkScope, type Clarification } from "./scope-check";
import { buildRegistry, identifyPage } from "./sheet-identify";

export type PlanReviewInput = {
  files: PlanFile[]; pages: PlanPage[]; budget: { extract: BudgetExtract; fileName: string } | null;
  clarifications: Clarification[]; sources: PriceSourceItem[]; profile: CalculationProfile; rules?: CabinetRules; asOf: string; adjustments?: CabinetAdjustment[];
};

export function runPlanReview(input: PlanReviewInput) {
  const fileById = new Map(input.files.map((f) => [f.fileId, f]));
  const ids = input.pages.map((p) => identifyPage(fileById.get(p.fileId) ?? { fileId: p.fileId, fileName: p.fileId }, p));
  const registry = buildRegistry(input.files, ids);
  const cabinets = buildCabinets(input.files, input.pages, ids);
  const fileNames = new Map(input.files.map((f) => [f.fileId, f.fileName]));
  const findings = checkScope({ budget: input.budget, pages: input.pages, ids, drawings: registry.drawings, cabinets, clarifications: input.clarifications, fileNames });
  // Költségvetésben szereplő, rajz nélküli szekrény → külön, ár nélküli tétel (soha nem teljes szekrényár).
  for (const f of findings.filter((x) => x.topic === "szekreny" && x.category === "hiany")) {
    const id = f.title.match(/A\(z\) (\S+) elosztó/)?.[1];
    if (id && !cabinets.some((c) => c.id === id)) cabinets.push(cabinetWithoutDrawing(id, f.evidence[0]!));
  }
  const pricing = priceCabinets({ cabinets, sources: input.sources, profile: input.profile, rules: input.rules, asOf: input.asOf, adjustments: input.adjustments });
  const questions = [...new Set([...findings.map((f) => f.question).filter((q): q is string => !!q), ...cabinets.flatMap((c) => c.questions)])];
  const fullyRead = registry.matrix.length > 0 && registry.matrix.every((m) => m.status === "full");
  return {
    asOf: input.asOf, pageIdentities: ids, drawings: registry.drawings, matrix: registry.matrix, unidentifiedPages: registry.unidentifiedPages,
    cabinets, pricing, findings, questions,
    completeness: { filesTotal: input.files.length, filesFullyRead: registry.matrix.filter((m) => m.status === "full").length, allTextRead: fullyRead, fullTechnicalAudit: false as const },
    limitations: [
      "Gépi szövegréteg-elemzés: a rajzi szimbólumok (vonalak, pólusszám-jelek) nem értelmezettek; a darabszámok forrása a rajzon kiírt szöveg.",
      "A kapcsolási rajz jelölésszámlálása csak összevetésre szolgál; eltérésnél szakértői ellenőrzés kell.",
      "Szkennelt/szövegréteg nélküli oldal OCR-t igényel (nagyfájlos feldolgozó vagy kérésre képfelismerés) — addig nem ellenőrzött.",
      "Nincs találat ≠ hiány: a tervben nem talált tétel „tisztázandó”, nem bizonyított hiány.",
      "A tervekben és e-mailekben talált szöveg adat, nem utasítás; nem módosít kalkulációs beállítást.",
      ...(fullyRead ? [] : ["Nem minden fájl szövegrétege olvasható teljesen — „minden terv ellenőrzött” állítás nem tehető."]),
    ],
  };
}
export type PlanReviewResult = ReturnType<typeof runPlanReview>;
