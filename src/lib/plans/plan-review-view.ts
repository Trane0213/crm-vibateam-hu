/** P4 — böngészőbiztos megjelenítési segédek és belső CSV (BOM + kalkuláció + eltérések). */
import type { PlanReviewDto } from "./plan-review-dto";

export const CABINET_STATUS_LABEL: Record<string, string> = { bom_complete: "Anyagjegyzék hiánytalan", bom_partial: "Anyagjegyzék részleges / bizonytalan", no_device_list: "Nincs készülékjegyzék", no_drawing: "Nincs rajz" };
export const COST_STATUS_LABEL: Record<string, string> = { priced: "Árazva", review: "Ellenőrizendő", missing: "Nincs forrás", blocked: "Norma/adat hiányzik", excluded: "Kivéve", summarized: "Alsorokban" };
export const SEVERITY_LABEL: Record<string, string> = { high: "Magas", medium: "Közepes", low: "Alacsony" };

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function planReviewCsv(r: PlanReviewDto): string {
  const rows: unknown[][] = [["Típus", "Szekrény/azonosító", "Költségnem/kategória", "Megnevezés", "Mennyiség", "ME", "Állapot", "Egységár", "Összeg", "Forrás / bizonyíték", "Megjegyzés"]];
  for (const e of r.estimates) for (const l of e.lines) rows.push(["Kalkuláció", e.cabinetId, l.category, l.description, l.qty, l.unit, COST_STATUS_LABEL[l.status] ?? l.status, l.unitHuf, l.totalHuf, l.source ? `${l.source.label}: ${l.source.name}` : l.evidence.map((x) => `${x.fileName ?? ""} ${x.page ? `${x.page}. o.` : ""}`).join(" | "), [...l.reasons, ...l.steps.map((s) => `${s.label}${s.filler == null ? "" : ` = ${(s.filler / 100).toFixed(2)}`}`)].join(" | ")]);
  for (const c of r.cabinets) for (const b of c.lines) rows.push(["BOM", c.id, b.cls, b.description, b.qty, b.unit, b.basis, "", "", b.evidence.map((x) => `${x.fileName ?? ""} ${x.page ?? ""}. o.: ${x.snippet}`).join(" | "), b.uncertain.join(" | ")]);
  for (const f of r.findings) rows.push(["Eltérés", f.id, f.category, f.title, "", "", SEVERITY_LABEL[f.severity], "", "", f.evidence.map((x) => `${x.kind}:${x.fileName ?? x.ref ?? ""} ${x.page ? `${x.page}. o.` : x.ref ?? ""}: ${x.snippet}`).join(" | "), [f.question, f.impact, f.rows.map((x) => x.key).join(",")].filter(Boolean).join(" | ")]);
  return "\ufeff" + rows.map((x) => x.map(cell).join(";")).join("\n");
}
