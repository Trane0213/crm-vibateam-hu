/**
 * P3 — kapott költségvetés tételsorainak felismerése az eredeti szerkezet megtartásával.
 * Oszlopszerepek fejlécből (egy- és kétsoros fejléc), tételsor/fejezet/részösszeg osztályozás,
 * ár-cellák írhatósági állapota. Bizonytalan oszlopértelmezés jelölve, soha nem csendes.
 */
import { addr, isErr, numToCol, type Scalar, type SheetModel, type WorkbookEvaluator, type WorkbookModel } from "./formula";
import { isShortName, norm, normUnit, parseNumber } from "./normalize";

export type ColumnRole = "item_no" | "name" | "designation" | "type" | "note" | "qty" | "unit" | "unit_price" | "material_unit" | "labor_unit" | "total" | "material_total" | "labor_total";
export type PriceCellRole = "unit_price" | "material_unit" | "labor_unit";
export type CellState = "empty" | "zero" | "value" | "formula" | "text";

export type SheetLayout = {
  sheet: string; hidden: boolean; headerRows: number[]; dataStartRow: number;
  columns: Partial<Record<Exclude<ColumnRole, "name">, number>> & { name: number[] };
  labels: Record<number, string>; inferred: string[]; ambiguous: string[];
};
export type PriceCell = { role: PriceCellRole; col: number; address: string; state: CellState; existing: number | null; formula?: string };
export type BudgetRow = {
  key: string; sheet: string; row: number; kind: "item" | "zero_qty" | "section" | "subtotal" | "text";
  itemNo: string | null; name: string; designation: string | null; type: string | null; note: string | null;
  qty: number | null; unitRaw: string | null; unit: string; section: string; flags: string[];
  /** Rövid altétel (pl. „3x4 mm2”) esetén a megelőző leíró tétel neve — párosítási kontextus. */
  context: string | null;
  priceCells: PriceCell[]; totalCells: { role: "total" | "material_total" | "labor_total"; address: string; formula?: string }[];
};
export type BudgetExtract = { layouts: SheetLayout[]; skippedSheets: { sheet: string; reason: string }[]; rows: BudgetRow[] };

const has = (tokens: string[], ...w: string[]) => w.some((x) => tokens.includes(x));
const TOTAL_W = ["osszesen", "ossz", "osszes", "szum", "osszeg", "ertek", "total", "sum", "osszar"];

/** Fejléccímke → oszlopszerep. Sorrend számít: mennyiség → összeg → egységár → egység → szöveges szerepek. */
export function classifyHeader(label: string): ColumnRole | null {
  const n = norm(String(label).replace(/(\p{L})-\s*(\p{L})/gu, "$1$2")).replace(/\begsegar\b/g, "egysegar"); if (!n) return null;
  const t = n.split(" ");
  const material = has(t, "anyag", "anyagar", "anyagegysegar", "anyagkoltseg");
  const labor = has(t, "dij", "munkadij", "munka", "dijegysegar", "munkadijegysegar", "dijtetel");
  if (has(t, "menny", "mennyiseg", "mennyisege", "qty", "quantity")) return has(t, "egyseg", "me", "egys", "mertekegyseg") && !has(t, ...TOTAL_W) ? "unit" : "qty";
  if (has(t, ...TOTAL_W) && !has(t, "egysegar", "egysegre")) return material && !labor ? "material_total" : labor && !material ? "labor_total" : "total";
  if (has(t, "egysegar", "egysegre", "anyagegysegar", "dijegysegar", "munkadijegysegar") || (has(t, "egyseg", "ar") && (material || labor)) || (t.length <= 2 && (material || labor || has(t, "ar")))) {
    return material && !labor ? "material_unit" : labor && !material ? "labor_unit" : "unit_price";
  }
  if (n === "m e" || has(t, "me", "egys", "egyseg", "mertekegyseg", "egysege", "unit")) return "unit";
  if (has(t, "megnevezes", "megnevezese", "leiras", "description", "tetelnev")) return "name";
  if (has(t, "tervjel", "jel", "jelolese", "jeloles")) return "designation";
  if (has(t, "megjegyzes", "megjegyzesek", "eszrevetel")) return has(t, "tipus") ? "type" : "note";
  if (has(t, "tipus", "gyarto", "marka", "termek")) return "type";
  if (has(t, "ssz", "sz", "sorszam", "tetelszam", "tetel", "azonosito", "kod", "pozicio")) return "item_no";
  return null;
}

/** Kizárás-kereséshez: ékezet nélküli kisbetűs szöveg, szótörlés nélkül (a norm() az „opcionális” szót párosításhoz elhagyja). */
const plain = (v: unknown) => String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const UNIT_RE = /^(m|m2|m3|db|tetel|klt|ktg|ora|kg|t|l|pld|gar|par|csomag|tekercs)$/;
const text = (v: Scalar) => (v == null || isErr(v) ? "" : typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const headerish = (s: string) => s.length > 0 && s.length <= 40 && !/^[-+]?\d+([.,]\d+)?$/.test(s);

function rowLabels(sheet: SheetModel, r: number): Map<number, string> {
  const m = new Map<number, string>();
  for (let c = 1; c <= Math.min(sheet.maxCol, 60); c++) { const v = sheet.cells.get(addr(c, r)); const s = v && !v.f ? text(v.v) : ""; if (s) m.set(c, s); }
  return m;
}

function layoutFrom(labels: Map<number, string>) {
  const roles = new Map<number, ColumnRole>();
  for (const [c, l] of labels) { const r = classifyHeader(l); if (r) roles.set(c, r); }
  // „M | E” rövid fejléc (mennyiség | egység) — csak egymás melletti párként értelmezve.
  for (const [c, l] of labels) if (norm(l) === "m" && norm(labels.get(c + 1)) === "e" && !roles.has(c) && ![...roles.values()].includes("qty")) { roles.set(c, "qty"); if (!roles.has(c + 1)) roles.set(c + 1, "unit"); }
  const vals = [...roles.values()];
  const score = (vals.includes("name") ? 2 : 0) + (vals.includes("qty") ? 2 : 0) + (vals.includes("unit") ? 1 : 0) + (vals.some((v) => v.endsWith("unit") || v === "unit_price") ? 2 : 0) + (vals.some((v) => v.endsWith("total")) ? 1 : 0);
  return { roles, score };
}

/** Legjobb fejlécsor (opcionális második fejlécsorral) a lap első 60 sorában. */
function findHeader(sheet: SheetModel) {
  let best: { rows: number[]; labels: Map<number, string>; roles: Map<number, ColumnRole>; score: number } | null = null;
  for (let r = 1; r <= Math.min(sheet.maxRow, 60); r++) {
    const top = rowLabels(sheet, r); if (top.size < 2) continue;
    const sub = rowLabels(sheet, r + 1);
    const subHeader = sub.size >= 2 && [...sub.values()].filter(headerish).length >= Math.max(2, sub.size * 0.8) && [...sub.values()].some((s) => classifyHeader(s));
    const candidates: { rows: number[]; labels: Map<number, string> }[] = [{ rows: [r], labels: top }];
    if (subHeader) {
      const merged = new Map<number, string>(); let group = "";
      const maxC = Math.max(...top.keys(), ...sub.keys());
      for (let c = 1; c <= maxC; c++) {
        if (top.has(c)) group = top.get(c)!; else if (!sub.has(c)) group = "";
        const s = sub.get(c);
        if (top.has(c) && s) merged.set(c, `${top.get(c)} ${s}`); else if (s) merged.set(c, group ? `${group} ${s}` : s); else if (top.has(c)) merged.set(c, top.get(c)!);
      }
      candidates.push({ rows: [r, r + 1], labels: merged });
    }
    for (const cnd of candidates) {
      const { roles, score } = layoutFrom(cnd.labels);
      if (!roles.size || ![...roles.values()].includes("qty")) continue;
      if (!best || score > best.score || (score === best.score && cnd.rows.length > best.rows.length && best.rows[0] === cnd.rows[0])) best = { ...cnd, roles, score };
    }
  }
  return best;
}

function cellState(sheet: SheetModel, a: string): { state: CellState; existing: number | null; formula?: string } {
  const c = sheet.cells.get(a);
  if (!c) return { state: "empty", existing: null };
  if (c.f) return { state: "formula", existing: typeof c.v === "number" ? c.v : null, formula: c.f };
  if (c.v == null || c.v === "") return { state: "empty", existing: null };
  if (typeof c.v === "number") return c.v === 0 ? { state: "zero", existing: 0 } : { state: "value", existing: c.v };
  return String(c.v).trim() === "" ? { state: "empty", existing: null } : { state: "text", existing: null };
}

const EXCLUSION = /\b(nem vallalt|nem vallaljuk|nem resze|nem tartalmazza|kizar|kizarva|nem kell|meglevo marad|elvegzett|elkeszult|opcio|opcionalis|alternativ|beruhazo biztositja|megrendelo biztositja|epitteto biztositja|mas szakag|nem arazando)\b/;
const SUBTOTAL = /^(mind ?osszesen|osszesen|netto osszesen|brutto|afa|resz ?osszeg|subtotal|total|fejezet osszesen|munkanem osszesen)\b|\bosszesen\s*:?$/;

export function extractBudget(model: WorkbookModel, ev: WorkbookEvaluator): BudgetExtract {
  const layouts: SheetLayout[] = [], skippedSheets: BudgetExtract["skippedSheets"] = [], rows: BudgetRow[] = [];
  for (const sheet of model.sheets) {
    const h = findHeader(sheet);
    if (!h || h.score < 4) { skippedSheets.push({ sheet: sheet.name, reason: "Nem található mennyiséget és megnevezést/árat tartalmazó tételfejléc (összesítő, borító vagy egyéb lap)." }); continue; }
    const cols: SheetLayout["columns"] = { name: [] };
    const ambiguous: string[] = [], inferred: string[] = [];
    const byRole = new Map<ColumnRole, number[]>();
    for (const [c, r] of [...h.roles.entries()].sort((a, b) => a[0] - b[0])) byRole.set(r, [...(byRole.get(r) ?? []), c]);
    cols.name = byRole.get("name") ?? [];
    const qtyCols = byRole.get("qty") ?? [];
    if (qtyCols.length > 1) {
      const totalQty = qtyCols.filter((c) => /\b(ossz|osszes|osszesen|szum)\b/.test(norm(h.labels.get(c))));
      if (totalQty.length === 1) cols.qty = totalQty[0]; else { cols.qty = qtyCols[qtyCols.length - 1]; ambiguous.push(`Több mennyiség-oszlop (${qtyCols.map(numToCol).join(", ")}); a ${numToCol(cols.qty)} oszlop használt — ellenőrizendő.`); }
    } else cols.qty = qtyCols[0];
    for (const role of ["item_no", "designation", "type", "note", "unit", "unit_price", "material_unit", "labor_unit", "total", "material_total", "labor_total"] as const) {
      const list = byRole.get(role) ?? []; if (!list.length) continue;
      if (role === "item_no" || role === "note" || role === "type" || role === "designation") { cols[role] = list[0]; continue; }
      if (list.length > 1) ambiguous.push(`Több „${role}” oszlop (${list.map(numToCol).join(", ")}); ár nem írható automatikusan, kézi oszlopkijelölés szükséges.`);
      cols[role] = list[0];
    }
    const dataStart = h.rows[h.rows.length - 1] + 1;
    const sample: number[] = []; for (let r = dataStart; r <= Math.min(sheet.maxRow, dataStart + 80); r++) sample.push(r);
    const qtyNum = (r: number) => (cols.qty ? parseNumber(ev.value(sheet, addr(cols.qty, r))) : null);
    // Fejléc nélküli mértékegység-oszlop (pl. üres ME-fejléc): a mennyiség melletti oszlop, ha értékei egységek.
    if (!cols.unit && cols.qty) {
      for (const c of [cols.qty + 1, cols.qty - 1]) {
        if (c < 1 || [...h.roles.keys()].includes(c)) continue;
        const vals = sample.filter((r) => qtyNum(r) != null).map((r) => text(sheet.cells.get(addr(c, r))?.v ?? null)).filter(Boolean);
        const known = vals.filter((v) => UNIT_RE.test(normUnit(v)));
        if (vals.length >= 3 && known.length / vals.length >= 0.7) { cols.unit = c; inferred.push(`Mértékegység-oszlop fejléc nélkül: ${numToCol(c)} (értékei alapján).`); break; }
      }
    }
    // Fejléchez képest felcserélt mennyiség/egység oszlop (valós mintában előfordult): értékek alapján, jelölve.
    if (cols.qty && cols.unit) {
      const qv = sample.map((r) => sheet.cells.get(addr(cols.qty!, r))?.v ?? null).filter((v) => v != null && v !== "");
      const uv = sample.map((r) => sheet.cells.get(addr(cols.unit!, r))?.v ?? null).filter((v) => v != null && v !== "");
      const qUnits = qv.filter((v) => typeof v === "string" && UNIT_RE.test(normUnit(v))).length, uNums = uv.filter((v) => typeof v === "number").length;
      if (qv.length >= 3 && qUnits / qv.length >= 0.7 && uNums / Math.max(1, uv.length) >= 0.7) {
        const q = cols.qty; cols.qty = cols.unit; cols.unit = q;
        inferred.push(`A mennyiség (${numToCol(cols.qty)}) és a mértékegység (${numToCol(cols.unit)}) oszlop a fejléchez képest felcserélve szerepel — az értékek alapján használva, ellenőrizendő.`);
      }
    }
    if (!cols.name.length && cols.qty) {
      let bestC = 0, bestLen = 0;
      const secondaryNo = (byRole.get("item_no") ?? []).slice(1);
      for (let c = 1; c < cols.qty; c++) {
        if ([...h.roles.keys()].includes(c) && !secondaryNo.includes(c)) continue;
        const len = sample.reduce((a, r) => a + text(sheet.cells.get(addr(c, r))?.v ?? null).length, 0);
        if (len > bestLen) { bestLen = len; bestC = c; }
      }
      if (bestC) { cols.name = [bestC]; inferred.push(`Megnevezés-oszlop fejléc nélkül: ${numToCol(bestC)} (leghosszabb szövegek alapján).`); }
    }
    if (!cols.name.length || !cols.qty) { skippedSheets.push({ sheet: sheet.name, reason: "Megnevezés vagy mennyiség oszlop nem azonosítható." }); continue; }
    const labels: Record<number, string> = {}; for (const [c, l] of h.labels) labels[c] = l;
    const layout: SheetLayout = { sheet: sheet.name, hidden: sheet.hidden, headerRows: h.rows, dataStartRow: dataStart, columns: cols, labels, inferred, ambiguous };
    layouts.push(layout);

    let section = "", lastDescriptive: string | null = null;
    for (let r = dataStart; r <= sheet.maxRow; r++) {
      const nameText = cols.name.map((c) => text(ev.value(sheet, addr(c, r)))).filter(Boolean).join(" · ");
      const get = (c?: number) => (c ? text(ev.value(sheet, addr(c, r))) || null : null);
      const qtyRaw = ev.value(sheet, addr(cols.qty, r));
      const qty = parseNumber(qtyRaw);
      const unitRaw = get(cols.unit);
      const itemNo = get(cols.item_no);
      if (!nameText && qty == null && !itemNo) continue;
      const flags: string[] = [];
      const n = norm(nameText);
      let kind: BudgetRow["kind"];
      if (qty == null) {
        if (SUBTOTAL.test(n)) kind = "subtotal";
        else if (nameText && (itemNo || /^\d+(\.\d+)*\.?\s/.test(nameText) || nameText === nameText.toUpperCase() || nameText.length <= 60)) { kind = "section"; section = nameText.slice(0, 160); lastDescriptive = null; }
        else kind = "text";
      } else if (SUBTOTAL.test(n) && !unitRaw) kind = "subtotal";
      else kind = qty === 0 ? "zero_qty" : "item";
      if (qty != null && qty < 0) flags.push("negative_qty");
      if (kind === "item" || kind === "zero_qty") {
        if (!nameText) flags.push("no_name");
        if (!unitRaw) flags.push("no_unit");
        if (EXCLUSION.test(`${plain(nameText)} ${plain(get(cols.note))} ${plain(get(cols.type))}`)) flags.push("possible_exclusion");
        if (sheet.hiddenRows.has(r)) flags.push("hidden_row");
        if (qtyRaw && typeof qtyRaw === "object") flags.push("qty_error");
      }
      let context: string | null = null;
      if (nameText && (kind === "item" || kind === "zero_qty" || kind === "text")) { if (isShortName(nameText)) context = lastDescriptive; else lastDescriptive = nameText; }
      const priceCells: PriceCell[] = (["unit_price", "material_unit", "labor_unit"] as const).filter((role) => cols[role]).map((role) => { const a = addr(cols[role]!, r); return { role, col: cols[role]!, address: a, ...cellState(sheet, a) }; });
      const totalCells = (["total", "material_total", "labor_total"] as const).filter((role) => cols[role]).map((role) => { const a = addr(cols[role]!, r); return { role, address: a, formula: sheet.cells.get(a)?.f }; });
      rows.push({ key: `${sheet.name}!${r}`, sheet: sheet.name, row: r, kind, itemNo, name: nameText, designation: get(cols.designation), type: get(cols.type), note: get(cols.note),
        qty, unitRaw, unit: normUnit(unitRaw), section, flags, context, priceCells, totalCells });
    }
  }
  return { layouts, skippedSheets, rows };
}
