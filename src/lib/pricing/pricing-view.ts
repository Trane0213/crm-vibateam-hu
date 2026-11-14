/** P3 — árazási eredmény megjelenítési segédei (böngészőbiztos, adatot nem módosít). */
import type { LineStatus } from "./engine";
import type { LineDto } from "./pricing-dto";

export type StatusFilter = "all" | "priced" | "review" | "missing" | "other";
export const STATUS_FILTERS: Record<StatusFilter, LineStatus[]> = {
  all: ["priced", "review", "missing", "blocked", "zero_qty", "excluded", "excluded_review", "existing_price"],
  priced: ["priced"], review: ["review", "blocked", "excluded_review"], missing: ["missing"], other: ["zero_qty", "excluded", "existing_price"],
};
export const LINE_STATUS_LABEL: Record<LineStatus | StatusFilter, string> = {
  all: "Mind", priced: "Árazva", review: "Ellenőrizendő", missing: "Nincs forrás", other: "0 menny./meglévő/kizárt",
  blocked: "Hiányzó paraméter", zero_qty: "0 mennyiség", excluded: "Kizárva", excluded_review: "Lehetséges kizárás", existing_price: "Meglévő ár",
};

const cell = (v: unknown) => { const t = String(v ?? ""); return /[;\n\r"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

/** Belső ellenőrzési lista (forrás, alapár, lépések) — BELSŐ, nem ügyfélnek. */
export function pricingCsv(lines: LineDto[]): string {
  const head = ["Lap", "Sor", "Tételszám", "Megnevezés", "Mennyiség", "ME", "Állapot", "Anyag egységár", "Anyag forrás", "Munkadíj egységár", "Munkadíj forrás", "Egységár összesen", "Sorösszeg", "Számítási lépések", "Megjegyzés"];
  const src = (c: LineDto["material"]) => (c?.source ? `${c.source.label}: ${c.source.name.slice(0, 80)}${c.source.file ? ` (${c.source.file}${c.source.row ? ` #${c.source.row}` : ""})` : ""}${c.source.date ? ` ${c.source.date}` : ""}` : "");
  const steps = (l: LineDto) => (["material", "labor"] as const).flatMap((k) => (l[k]?.steps ?? []).map((s) => `${k === "material" ? "A" : "D"}: ${s.label}${s.huf != null ? ` = ${s.huf}` : ""}`)).join(" | ");
  const rows = lines.map((l) => [l.sheet, l.row, l.itemNo, l.name, l.qty, l.unit, LINE_STATUS_LABEL[l.status], l.material?.unitHuf, src(l.material), l.labor?.unitHuf, src(l.labor), l.unitSellHuf, l.lineTotalHuf, steps(l), l.reasons.join(" | ")]);
  return "\ufeff" + [head, ...rows].map((r) => r.map(cell).join(";")).join("\r\n");
}
