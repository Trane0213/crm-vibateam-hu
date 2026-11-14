/** P4 izolált tesztkészlet: kitalált (TESZT) elosztótervek pozíciós szövegréteggel, a valós VIBA-tervek szerkezetét követve. */
import type { PlanFile, PlanItem, PlanPage } from "../plan-text";
import type { PriceSourceItem } from "@/lib/pricing/price-sources";

export type CircuitSpec = { id: string; rating: number; name: string; cable: string; power: number; rcd?: { rating: number } };
export type CabinetSpec = {
  fileId: string; fileName: string; drawingNo: string; cabinetId: string; title: string; date?: string; sheetTotal?: number; legendPoles?: ("1P" | "3P")[];
  enclosure: string; explicit: string[]; circuits: CircuitSpec[]; contactors?: number; mainSwitch?: boolean; spd?: boolean; dropSheet?: number;
};

const T = (s: string, x: number, y: number): PlanItem => ({ s, x, y });
const titleBlock = (c: CabinetSpec, sheet: number | null) => [T(c.drawingNo, 1118, 37), T(`${c.cabinetId} JELŰ ELOSZTÓ TERVE`, 907, 15), ...(sheet ? [T(`${sheet}.LAP`, 1111, 15)] : [])];

export function cabinetPlan(c: CabinetSpec): { file: PlanFile; pages: PlanPage[] } {
  const total = c.sheetTotal ?? 3;
  const page = (n: number, items: PlanItem[]): PlanPage => ({ fileId: c.fileId, page: n, source: "text_layer", aiExtracted: false, width: 1191, height: 842, items, text: "" });
  const cover = page(1, [
    T("Tápfeszültség:", 98, 726), T("3+N, 50Hz, 400/230V", 183, 726), T("Beépített teljesítmény:", 98, 682), T(`${(c.circuits.reduce((a, x) => a + x.power, 0) / 1000).toFixed(1).replace(".", ",")}kW`, 247, 682),
    T("- Az elosztó kialakítása az MSZ EN 61439 szerint történjen.", 98, 639), T("- Az elosztóberendezés zárlatszilárdsága: min. 10kA eff./1mp.", 98, 607),
    T(`Jelen terv ${total} lapból áll.`, 98, 507), T("TESZT projekt — kitalált adat", 700, 130), T(`${c.cabinetId} jelű elosztó terve`, 709, 44), T(c.drawingNo, 1107, 44), T(c.date ?? "2026. 10. 01.", 993, 41),
  ]);
  const sld: PlanItem[] = [...titleBlock(c, 2), T("Áramkör:", 230, 245), T("Beép. telj. (W):", 210, 226)];
  if (c.mainSwitch !== false) sld.push(T("NG125N", 132, 696), T("63A", 140, 688));
  if (c.spd !== false) sld.push(T("Túlfeszültség", 268, 547), T("levezető", 276, 538));
  c.circuits.forEach((k, i) => {
    const x = 300 + i * 42;
    sld.push(T(`${k.rating}A`, x, 536), T(k.id, x, 245), T(String(k.power), x - 4, 226), T(k.name, x - 6, 262), T(k.cable, x + 10, 262));
    if (k.rcd) sld.push(T(`${k.rcd.rating}A`, x + 3, 617), T("30mA", x, 609), T("ΔI", x + 4, 597));
  });
  for (let i = 0; i < (c.contactors ?? 0); i++) sld.push(T("M", 900 + i * 40, 605), T("25A", 903 + i * 40, 594));
  const poles = c.legendPoles ?? ["1P"];
  poles.forEach((p, i) => sld.push(T(`Pl.: TESZT gy. Minta típusú kismegszakító, min. 6kA, ${p}, C`, 385, 125 - i * 40)));
  sld.push(T("Pl.: TESZT gy. Minta típusú áram-védőkapcsoló (RCCB), IV.s., 30mA", 703, 125));
  const view = page(3, [...titleBlock(c, 3), T(`${c.cabinetId} JELŰ ELOSZTÓ NÉZETI RAJZA`, 736, 790), T(c.enclosure, 670, 772), ...c.explicit.map((t, i) => T(t, 752, 650 - i * 15)), T("800", 680, 498)]);
  const pages = [cover, page(2, sld), view].filter((p) => p.page !== c.dropSheet);
  return { file: { fileId: c.fileId, fileName: c.fileName, path: null, origin: "fixture", pageCount: pages.length, status: "read" }, pages };
}

const circuits = (n: number, rating: number, cable = "NYY 3×1,5²", rcdEvery = 0): CircuitSpec[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i + 1), rating, name: `Fogyasztó ${i + 1}`, cable, power: 500 + i * 10, ...(rcdEvery && i % rcdEvery === 0 ? { rcd: { rating: 40 } } : {}) }));

/** Öt különböző, hiánytalan TESZT elosztó (nézeti rajz darabszám = kapcsolási rajz jelölésszám). */
export const FIVE_CABINETS: CabinetSpec[] = [
  { fileId: "t-fe", fileName: "T-5_FE_foeloszto.pdf", drawingNo: "T-5", cabinetId: "FE", title: "FE jelű főelosztó", enclosure: "TESZT gy. Fali elosztó, 1200×600×200mm méretű, IP31", explicit: ["1db főkapcsoló 63A 3P", "1db túlfeszültség levezető 1+2 típ. 4P", "2db RCD 40A 4P 30mA", "10db kismegszakító"], circuits: [...circuits(6, 16, "NYY 3×2,5²", 3), ...circuits(4, 10)].map((x, i) => ({ ...x, id: String(i + 1) })) },
  { fileId: "t-e1", fileName: "T-6_E1_eloszto.pdf", drawingNo: "T-6", cabinetId: "E1", title: "E1 jelű elosztó", enclosure: "TESZT gy. Műanyag elosztó, 750×426×151mm méretű, 4 soros", explicit: ["1db főkapcsoló 40A 3P", "1db túlfeszültség levezető 2 típ. 4P", "1db RCD 40A 4P 30mA", "6db kismegszakító"], circuits: circuits(6, 16, "NYY 3×2,5²", 6) },
  { fileId: "t-ale2", fileName: "T-7_ALE-2_gepeszeti.pdf", drawingNo: "T-7", cabinetId: "ALE-2", title: "ALE-2 jelű elosztó", enclosure: "TESZT gy. Acél elosztó, 1000×800×250mm méretű, IP54", explicit: ["1db főkapcsoló 63A 3P", "1db túlfeszültség levezető 2 típ. 4P", "2db kontaktor 25A 3P", "8db kismegszakító"], circuits: [...circuits(5, 20, "NYY 5×2,5²"), ...circuits(3, 6)].map((x, i) => ({ ...x, id: String(i + 1) })), contactors: 2, legendPoles: ["3P"] },
  { fileId: "t-kt", fileName: "T-8_KT_konyha.pdf", drawingNo: "T-8", cabinetId: "KT", title: "KT jelű elosztó", enclosure: "TESZT gy. Süllyesztett elosztó, 600×400×120mm méretű, 3 soros", explicit: ["1db főkapcsoló 40A 3P", "1db túlfeszültség levezető 2 típ. 4P", "1db RCD 40A 4P 30mA", "5db kismegszakító"], circuits: circuits(5, 16, "NYY 3×2,5²", 5) },
  { fileId: "t-ve", fileName: "T-9_VE_vilagitas.pdf", drawingNo: "T-9", cabinetId: "VE", title: "VE jelű elosztó", enclosure: "TESZT gy. Fali elosztó, 800×600×200mm méretű, IP43", explicit: ["1db főkapcsoló 32A 3P", "1db túlfeszültség levezető 2 típ. 4P", "1db RCD 40A 4P 30mA", "1db kontaktor 25A 3P", "9db kismegszakító"], circuits: circuits(9, 10, "NYY 3×1,5²", 9), contactors: 1 },
];

/** Beszállítói (TESZT) anyagárak minden szükséges készülékhez; nettó beszerzési ár (cost). */
export function materialSources(names: Record<string, number>, priceDate = "2026-10-15"): PriceSourceItem[] {
  return Object.entries(names).map(([name, unitPriceHuf], i) => ({ id: `sup-${i}`, kind: "supplier_quote", component: "material", basis: "cost", name, unit: "db", unitPriceHuf, priceDate, approvalVerified: true, provenance: { label: "TESZT beszállítói ajánlat", file: "TESZT.pdf", row: i + 1 } }));
}
export const TEST_RULES = { assemblyHoursPerDevice: { mcb: 0.25, rcd: 0.5, main_switch: 0.5, spd: 0.5, contactor: 0.75 }, enclosureAssemblyHours: 2, testDocHoursPerCabinet: 1.5, siteMountHoursPerCabinet: 3, siteFeederHoursPerCabinet: 1.5, siteOutgoingHoursPerCircuit: 0.3, siteMeasurementHoursPerCabinet: 2, approval: "user_assumption" as const };
