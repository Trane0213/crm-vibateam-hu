/** P6 — belső kalkulációs CSV (csak CRM-nézet; ügyfélnek nem kerül ki: önköltséget, forrást és nyomvonalat tartalmaz). */
import { MODE_LABEL, PROFILE_LABEL, QTY_LABEL, SOURCE_LABEL, STATUS_LABEL, type CalcResult } from "./calc-model";

const cell = (v: unknown) => { const s = v == null ? "" : String(v); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export function calcCsv(r: CalcResult): string {
  const head = ["Munkarész", "Megnevezés", "Mennyiség", "Egység", "Mennyiség státusza", "Státusz", "Anyag egységár", "Anyag forrása", "Munkadíj egységár", "Munkadíj forrása", "Sorösszeg (nettó Ft)", "Hiányok", "Számítás"];
  const rows = r.lines.map((l) => [l.section, l.name, l.qty, l.unit, QTY_LABEL[l.qtyStatus], STATUS_LABEL[l.status],
    l.material ? l.material.unitFiller / 100 : "", l.material ? `${SOURCE_LABEL[l.material.source]}: ${l.material.note}` : "",
    l.labor ? l.labor.unitFiller / 100 : "", l.labor ? `${SOURCE_LABEL[l.labor.source]}: ${l.labor.note}` : "", l.totalHuf, l.issues.join(" | "), l.trace.join(" | ")]);
  const meta = [[`VIBA BELSŐ KALKULÁCIÓ – ${PROFILE_LABEL[r.profile]} – ${MODE_LABEL[r.mode]} – azonosító ${r.calcId}`], [`Nettó ${r.totals.netHuf} Ft (anyag ${r.totals.materialHuf}, munkadíj ${r.totals.laborHuf}); nem árazható sor: ${r.totals.openLines}`]];
  return "\uFEFF" + [...meta, head, ...rows].map((row) => row.map(cell).join(";")).join("\n");
}
