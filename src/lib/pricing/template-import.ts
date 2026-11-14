/**
 * P3 — Ramon ár- és normasablonjának importja (XLSX/CSV), tételes hibalistával.
 * A fájlban szereplő „Jóváhagyta” mező nem CRM-ben igazolt jóváhagyás (approvalVerified=false);
 * tartós, verziózott ártörzs és jóváhagyás külön (tulajdonosi döntés + migráció) után.
 */
import * as XLSX from "xlsx";
import { addr, isErr, type Scalar } from "./formula";
import { norm, normUnit, parseNumber } from "./normalize";
import type { NormHourBasis, PriceBasis, PriceSourceItem, PriceSourceKind } from "./price-sources";
import { readWorkbook } from "./workbook";

export const TEMPLATE_COLUMNS = [
  "Azonosító", "Forrás típusa", "Munkanem", "Megnevezés", "Típus / paraméter", "ME",
  "Munkadíj egységár (Ft)", "Munkadíj ár jellege", "Normaóra (óra/ME)", "Normaóra jellege",
  "Anyag egységár (Ft)", "Anyagár jellege", "Gyártó", "Cikkszám", "Szállító",
  "Ár dátuma", "Érvényes eddig", "Forrás / hivatkozás", "Jóváhagyta", "Megjegyzés",
] as const;
type Col = (typeof TEMPLATE_COLUMNS)[number];

const KIND_WORDS: [RegExp, PriceSourceKind][] = [
  [/beszallito/, "supplier_quote"], [/szerzod/, "accepted_contract"], [/tenyleges|elszamol/, "actual_cost"],
  [/korabbi|ajanlat/, "viba_historical_quote"], [/piaci/, "market_reference"], [/becsles|ai/, "ai_estimate"], [/sablon|torzs|viba|ramon/, "ramon_approved_template"],
];

export type TemplateIssue = { row: number; message: string };
export type TemplateImport = { items: PriceSourceItem[]; rowsRead: number; issues: TemplateIssue[]; sheet: string | null; fileLabel: string };

function toIsoDate(v: Scalar): string | null | "invalid" {
  if (v == null || v === "") return null;
  if (typeof v === "number") { if (v < 20000 || v > 80000) return "invalid"; const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : "invalid"; }
  const m = /^(\d{4})[.\-/ ]\s*(\d{1,2})[.\-/ ]\s*(\d{1,2})\.?$/.exec(String(v).trim());
  if (!m) return "invalid";
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return Number.isFinite(Date.parse(iso)) ? iso : "invalid";
}

export function importPriceTemplate(bytes: Uint8Array, fileName: string): TemplateImport {
  const { model } = readWorkbook(bytes, fileName);
  const want = new Map(TEMPLATE_COLUMNS.map((c) => [norm(c), c]));
  for (const sheet of model.sheets) {
    for (let r = 1; r <= Math.min(sheet.maxRow, 30); r++) {
      const cols = new Map<Col, number>();
      for (let c = 1; c <= Math.min(sheet.maxCol, 40); c++) { const v = sheet.cells.get(addr(c, r))?.v; const k = want.get(norm(v)); if (k) cols.set(k, c); }
      if (!cols.has("Megnevezés") || !cols.has("ME")) continue;
      const issues: TemplateIssue[] = [], items: PriceSourceItem[] = [];
      let rowsRead = 0;
      for (let rr = r + 1; rr <= sheet.maxRow; rr++) {
        const g = (c: Col): Scalar => { const n = cols.get(c); if (!n) return null; const v = sheet.cells.get(addr(n, rr))?.v ?? null; return isErr(v) ? null : v; };
        const s = (c: Col) => { const v = g(c); return v == null ? "" : String(v).trim(); };
        const name = s("Megnevezés"), unit = s("ME");
        if (!name && !unit && !s("Munkadíj egységár (Ft)") && !s("Anyag egységár (Ft)")) continue;
        rowsRead++;
        if (/^teszt\b/i.test(name)) { issues.push({ row: rr, message: "TESZT mintasor — kihagyva." }); continue; }
        if (!name || !unit) { issues.push({ row: rr, message: "Megnevezés és ME kötelező." }); continue; }
        const labor = parseNumber(g("Munkadíj egységár (Ft)")), hours = parseNumber(g("Normaóra (óra/ME)")), material = parseNumber(g("Anyag egységár (Ft)"));
        if ([labor, hours, material].some((x) => x != null && x < 0)) { issues.push({ row: rr, message: "Negatív ár vagy normaóra." }); continue; }
        if (labor == null && hours == null && material == null) { issues.push({ row: rr, message: "Nincs munkadíj, normaóra vagy anyagár." }); continue; }
        const date = toIsoDate(g("Ár dátuma")), valid = toIsoDate(g("Érvényes eddig"));
        if (date === "invalid" || valid === "invalid") { issues.push({ row: rr, message: "Érvénytelen dátum (ÉÉÉÉ-HH-NN vagy Excel-dátum)." }); continue; }
        if (!date) issues.push({ row: rr, message: "Nincs ár dátuma — automatikusan nem használható, csak javaslat." });
        const kindText = norm(s("Forrás típusa"));
        const kind: PriceSourceKind = kindText ? (KIND_WORDS.find(([re]) => re.test(kindText))?.[1] ?? "ramon_approved_template") : "ramon_approved_template";
        const basisOf = (text: string, def: PriceBasis): PriceBasis | "invalid" => { const t = norm(text); if (!t) return def; if (/eladas|ajanlat|dij/.test(t)) return "sell"; if (/beszerz|onkolts|koltseg/.test(t)) return "cost"; return "invalid"; };
        const lb = basisOf(s("Munkadíj ár jellege"), "sell"), mb = basisOf(s("Anyagár jellege"), "cost");
        if (lb === "invalid" || mb === "invalid") { issues.push({ row: rr, message: "Ár jellege csak „eladási” vagy „beszerzési/önköltség” lehet." }); continue; }
        const nbText = norm(s("Normaóra jellege"));
        const normBasis: NormHourBasis | null = hours == null ? null : /mert/.test(nbText) ? "measured" : /tapaszt/.test(nbText) ? "experience" : "derived_from_price";
        const id = s("Azonosító") || `${sheet.name}:${rr}`;
        const common = { name, type: s("Típus / paraméter") || null, unit: normUnit(unit), priceDate: date, validUntil: valid, approvalVerified: false, approvedBy: s("Jóváhagyta") || null,
          section: s("Munkanem") || null, manufacturer: s("Gyártó") || null, articleNo: s("Cikkszám") || null, supplier: s("Szállító") || null,
          provenance: { label: "Feltöltött ársablon (ebben a számításban, nem tárolt)", file: fileName, sheet: sheet.name, row: rr, url: null, note: [s("Forrás / hivatkozás"), s("Megjegyzés")].filter(Boolean).join("; ") || null } };
        if (labor != null || hours != null) items.push({ ...common, id: `${id}#labor`, kind, component: "labor", basis: lb, unitPriceHuf: labor, normHours: hours, normBasis });
        if (material != null) items.push({ ...common, id: `${id}#material`, kind, component: "material", basis: mb, unitPriceHuf: material });
      }
      return { items, rowsRead, issues, sheet: sheet.name, fileLabel: fileName };
    }
  }
  return { items: [], rowsRead: 0, issues: [{ row: 0, message: "Nem található „Megnevezés” és „ME” fejlécű ártábla." }], sheet: null, fileLabel: fileName };
}

/** Üres, kitölthető ársablon (Ramon) — két jól jelölt TESZT mintasorral és útmutatóval. */
export function buildPriceTemplateWorkbook(): Uint8Array {
  const wb = XLSX.utils.book_new();
  const rows: (string | number)[][] = [[...TEMPLATE_COLUMNS],
    ["MINTA-1", "VIBA sablon", "Erősáram", "TESZT – Dugaszolóaljzat 1x16A IP44, falon kívüli (törölhető mintasor)", "Schneider", "db", 1800, "eladási", "", "", 1200, "beszerzési", "Schneider", "TESZT-001", "TESZT szállító", "2026-11-01", "2027-03-31", "TESZT", "", "Mintasor"],
    ["MINTA-2", "VIBA sablon", "Kábelezés", "TESZT – NYM-J 3x2,5 mm2 kábel védőcsőben (törölhető mintasor)", "", "m", "", "eladási", 0.12, "tapasztalati", 380, "beszerzési", "", "", "", "2026-11-01", "", "TESZT", "", "Normaórás minta"]];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = TEMPLATE_COLUMNS.map((c) => ({ wch: c === "Megnevezés" ? 60 : Math.max(12, c.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Ártábla");
  const help = XLSX.utils.aoa_to_sheet([
    ["VIBA ár- és normasablon — kitöltési útmutató"], [""],
    ["Kötelező: Megnevezés, ME, és legalább egy: Munkadíj egységár / Normaóra / Anyag egységár."],
    ["Ár dátuma nélkül a tétel csak javaslat, automatikusan nem kerül az ajánlatba. Elavultnak számít a profil szerinti korlátnál régebbi ár."],
    ["Munkadíj ár jellege: „eladási” (ajánlati díj) vagy „önköltség”. Anyagár jellege: „beszerzési” (alapértelmezés) vagy „eladási”."],
    ["Normaóra jellege: mért / tapasztalati / visszaszámolt. A korábbi árból visszaszámolt norma nem igazolt műszaki norma."],
    ["Forrás típusa: VIBA sablon / beszállítói ajánlat / szerződés / tényleges költség / korábbi ajánlat / piaci / becslés. Piaci ár és becslés soha nem válik automatikusan tényárrá."],
    ["A „Jóváhagyta” mező a fájlban tájékoztató; CRM-ben rögzített jóváhagyás nélkül a sablon „jóváhagyás nem rögzített” jelölést kap."],
    ["A TESZT kezdetű mintasorokat az import kihagyja."],
  ]);
  help["!cols"] = [{ wch: 140 }];
  XLSX.utils.book_append_sheet(wb, help, "Útmutató");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}
