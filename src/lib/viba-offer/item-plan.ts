/**
 * P6 — kalkuláció → meglévő `quote_items` sorok (name, quantity, unit, unit_price, section) és lehatárolási szöveg.
 * Soha nem ír felül és nem töröl meglévő tételt: azonos tétel kimarad (ismételt futtatás biztonságos), azonos névvel,
 * de eltérő tartalommal szereplő tétel ütközésként jelenik meg. Az írás a meglévő tételmentési úton, a felhasználó
 * gombnyomására történik (RLS: `can_access_quote`); a DB-trigger számolja az ajánlat összegét.
 */
import { internalLeaks } from "@/lib/quote-package/package-model";
import { WRITABLE, blockingIssues, type CalcResult, type LineResult } from "./calc-model";

export type ItemRow = { section: string; name: string; quantity: number; unit: string; unit_price: number };
export type ExistingItem = { id?: string; section?: string | null; name: string | null; quantity: number | null; unit: string | null; unit_price: number | null };
export type PlanOptions = { split: boolean; acknowledgedReview: string[]; acceptPartial: boolean; locked: boolean };
export type PlannedRow = ItemRow & { lineId: string; part: "material" | "labor" | "combined" };
export type ItemPlan = {
  rows: PlannedRow[]; duplicates: PlannedRow[]; conflicts: (PlannedRow & { existing: ExistingItem })[];
  skipped: { lineId: string; name: string; reason: string }[]; blockers: string[]; netHuf: number; canWrite: boolean;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
const num = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);

function rowsFor(l: LineResult, split: boolean): PlannedRow[] {
  const suffix = l.qtyStatus === "estimated" ? " (becsült mennyiség)" : "";
  const base = { lineId: l.id, section: l.section, quantity: l.qty ?? 0, unit: l.unit };
  const m = l.material?.unitFiller ?? 0, w = l.labor?.unitFiller ?? 0;
  if (!split || !m || !w) return [{ ...base, part: m && !w ? "material" : !m && w ? "labor" : "combined", name: `${l.name}${m && w ? " (anyag + munkadíj)" : m ? " – anyag" : " – munkadíj"}${suffix}`, unit_price: (m + w) / 100 }];
  return [
    { ...base, part: "material", name: `${l.name} – anyag${suffix}`, unit_price: m / 100 },
    { ...base, part: "labor", name: `${l.name} – munkadíj${suffix}`, unit_price: w / 100 },
  ];
}

export function planQuoteItems(r: CalcResult, existing: ExistingItem[], o: PlanOptions): ItemPlan {
  const blockers: string[] = [];
  if (o.locked) blockers.push("Kiküldött (zárolt) ajánlat — a tételek nem módosíthatók, készíts új verziót.");
  for (const b of blockingIssues(r)) blockers.push(b.text);
  const skipped: ItemPlan["skipped"] = [];
  const candidates: PlannedRow[] = [];
  for (const l of r.lines) {
    if (!WRITABLE.includes(l.status)) { if (l.status !== "zero_qty" && l.status !== "excluded_mode") skipped.push({ lineId: l.id, name: l.name, reason: l.issues[0] ?? l.status }); continue; }
    if (l.status === "review" && !o.acknowledgedReview.includes(l.id)) { skipped.push({ lineId: l.id, name: l.name, reason: "Nem igazolt referenciadíj — nincs tudomásul véve" }); continue; }
    const rows = rowsFor(l, o.split);
    const leak = rows.flatMap((x) => internalLeaks(`${x.section} ${x.name}`));
    if (leak.length) { skipped.push({ lineId: l.id, name: l.name, reason: `Ügyfélnek szánt megnevezésben belső kifejezés: ${leak.join(", ")}` }); continue; }
    candidates.push(...rows);
  }
  const open = r.lines.filter((l) => ["missing_price", "unknown_qty", "blocked"].includes(l.status)).length + skipped.filter((s) => r.lines.find((l) => l.id === s.lineId)?.status === "review").length;
  if (open > 0 && !o.acceptPartial) blockers.push(`${open} sor nem kerülhet az ajánlatba (hiányzó ár/mennyiség vagy nem nyugtázott referencia) — a hiányos tételsort kifejezetten tudomásul kell venni.`);
  const ex = existing.map((e) => ({ e, key: `${norm(e.section)}|${norm(e.name)}` }));
  const rows: PlannedRow[] = [], duplicates: PlannedRow[] = [], conflicts: ItemPlan["conflicts"] = [];
  for (const c of candidates) {
    const same = ex.filter((x) => x.key === `${norm(c.section)}|${norm(c.name)}`);
    if (!same.length) { rows.push(c); continue; }
    const identical = same.find((x) => num(x.e.quantity) === num(c.quantity) && num(x.e.unit_price) === num(c.unit_price) && norm(x.e.unit) === norm(c.unit));
    if (identical) duplicates.push(c); else conflicts.push({ ...c, existing: same[0]!.e });
  }
  if (!candidates.length) blockers.push("Nincs az ajánlatba írható tétel.");
  const netHuf = rows.reduce((a, x) => a + Math.round(x.quantity * x.unit_price * 100), 0) / 100;
  return { rows, duplicates, conflicts, skipped, blockers, netHuf, canWrite: blockers.length === 0 && rows.length > 0 };
}

/** Ügyfélnek szánt lehatárolás a meglévő „Műszaki lehatárolás” és „Kizárások” mezőkhöz (a PDF ezeket nyomtatja). */
export function scopeTexts(r: CalcResult): { technicalScope: string; exclusions: string; leaks: string[] } {
  const list = (t: string, a: string[]) => (a.length ? `${t}\n${a.map((x) => `– ${x}`).join("\n")}` : "");
  const technicalScope = [list("Vállalt munkák:", r.scope.included), list("Feltételek:", r.scope.conditional), list("Pontosítandó kérdések:", r.scope.questions)].filter(Boolean).join("\n\n");
  const exclusions = r.scope.excluded.map((x) => `– ${x}`).join("\n");
  return { technicalScope, exclusions, leaks: internalLeaks(`${technicalScope}\n${exclusions}`) };
}

/** A már kitöltött mezőt nem írja felül: üresbe beír, egyébként a még nem szereplő blokkot hozzáfűzi. */
export function mergeText(current: string, add: string): string {
  const c = current.trim(), a = add.trim();
  if (!a) return current;
  if (!c) return a;
  return c.includes(a) ? current : `${c}\n\n${a}`;
}
