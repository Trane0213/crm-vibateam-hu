/**
 * P3 — Munkafüzet-képletkiértékelő (valódi újraszámolás, nem a mentett régi eredmény).
 * Támogatott: + − * / ^ & % összehasonlítások, cella/tartomány/lapközi hivatkozás, és a
 * költségvetésekben ténylegesen előforduló függvények. Ismeretlen függvény → #UNSUPPORTED, soha nem találgat.
 * Makrót, külső hivatkozást nem futtat/old fel.
 */

export type ErrorV = { error: string };
export type Scalar = number | string | boolean | null | ErrorV;
export type CellModel = { v: Scalar; f?: string };
export type SheetModel = { name: string; hidden: boolean; cells: Map<string, CellModel>; hiddenRows: Set<number>; maxRow: number; maxCol: number };
export type WorkbookModel = { sheets: SheetModel[]; names: Map<string, string> };

export const isErr = (v: unknown): v is ErrorV => typeof v === "object" && v !== null && "error" in v;
const E = (error: string): ErrorV => ({ error });

export function colToNum(s: string): number { let x = 0; for (const c of s.toUpperCase()) x = x * 26 + c.charCodeAt(0) - 64; return x; }
export function numToCol(n: number): string { let s = ""; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; }
export function splitAddr(a: string): { col: number; row: number } {
  const m = /^\$?([A-Z]{1,3})\$?(\d+)$/i.exec(a);
  if (!m) throw new Error(`Érvénytelen cím: ${a}`);
  return { col: colToNum(m[1]), row: Number(m[2]) };
}
export const addr = (col: number, row: number) => `${numToCol(col)}${row}`;

// ---------- Tokenizer ----------
type Tok = { t: "num" | "str" | "bool" | "err" | "ref" | "name" | "func" | "op" | "(" | ")" | "," ; v: string; sheet?: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = []; let i = 0;
  const s = src.replace(/^=/, "");
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\n" || c === "\r" || c === "\t") { i++; continue; }
    if (c === '"') { let j = i + 1, v = ""; while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue; } break; } v += s[j++]; } out.push({ t: "str", v }); i = j + 1; continue; }
    if (c === "#") { const m = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A)/.exec(s.slice(i)); if (!m) throw new Error("Ismeretlen hibaérték"); out.push({ t: "err", v: m[0] }); i += m[0].length; continue; }
    if ("(),".includes(c)) { out.push({ t: c as "(" | ")" | ",", v: c }); i++; continue; }
    const two = s.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { out.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>%".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (/[0-9.]/.test(c)) { const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i))!; out.push({ t: "num", v: m[0] }); i += m[0].length; continue; }
    // sheet-qualified or bare identifiers
    let sheet: string | undefined;
    if (c === "'") { let j = i + 1, v = ""; while (j < s.length) { if (s[j] === "'") { if (s[j + 1] === "'") { v += "'"; j += 2; continue; } break; } v += s[j++]; } if (s[j + 1] !== "!") throw new Error("Hibás laphivatkozás"); sheet = v; i = j + 2; }
    const m = /^[A-Za-z_\\\u00C0-\u024F][A-Za-z0-9_.\u00C0-\u024F]*/.exec(s.slice(i)) ?? (/^\$?[A-Za-z]{1,3}\$?\d+/.exec(s.slice(i)));
    const mm = /^\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?(?![A-Za-z0-9_(!])/.exec(s.slice(i));
    if (mm) { out.push({ t: "ref", v: mm[0].replace(/\$/g, "").toUpperCase(), sheet }); i += mm[0].length; continue; }
    if (!m) throw new Error(`Nem értelmezhető képletrész: ${s.slice(i, i + 12)}`);
    const word = m[0]; i += word.length;
    if (!sheet && s[i] === "!") { sheet = word; i++; const r = /^\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?/.exec(s.slice(i)); if (!r) throw new Error("Hibás laphivatkozás"); out.push({ t: "ref", v: r[0].replace(/\$/g, "").toUpperCase(), sheet }); i += r[0].length; continue; }
    if (s[i] === "(") { out.push({ t: "func", v: word.toUpperCase().replace(/^_XLFN\./, "") }); continue; }
    if (/^(TRUE|FALSE)$/i.test(word)) { out.push({ t: "bool", v: word.toUpperCase() }); continue; }
    out.push({ t: "name", v: word, sheet });
  }
  return out;
}

// ---------- Parser ----------
export type Node =
  | { k: "num"; v: number } | { k: "str"; v: string } | { k: "bool"; v: boolean } | { k: "err"; v: string }
  | { k: "ref"; sheet?: string; a: string } | { k: "range"; sheet?: string; a: string; b: string } | { k: "name"; v: string }
  | { k: "call"; fn: string; args: Node[] } | { k: "bin"; op: string; l: Node; r: Node } | { k: "neg"; e: Node } | { k: "pct"; e: Node };

export function parseFormula(src: string): Node {
  const toks = tokenize(src); let p = 0;
  const peek = () => toks[p], next = () => toks[p++];
  const isOp = (...ops: string[]) => peek()?.t === "op" && ops.includes(peek()!.v);
  function cmp(): Node { let l = concat(); while (isOp("=", "<>", "<", ">", "<=", ">=")) { const op = next().v; l = { k: "bin", op, l, r: concat() }; } return l; }
  function concat(): Node { let l = add(); while (isOp("&")) { next(); l = { k: "bin", op: "&", l, r: add() }; } return l; }
  function add(): Node { let l = mul(); while (isOp("+", "-")) { const op = next().v; l = { k: "bin", op, l, r: mul() }; } return l; }
  function mul(): Node { let l = pow(); while (isOp("*", "/")) { const op = next().v; l = { k: "bin", op, l, r: pow() }; } return l; }
  function pow(): Node { let l = unary(); while (isOp("^")) { next(); l = { k: "bin", op: "^", l, r: unary() }; } return l; }
  function unary(): Node { if (isOp("-")) { next(); return { k: "neg", e: unary() }; } if (isOp("+")) { next(); return unary(); } return postfix(); }
  function postfix(): Node { let e = primary(); while (isOp("%")) { next(); e = { k: "pct", e }; } return e; }
  function primary(): Node {
    const t = next();
    if (!t) throw new Error("Váratlan képletvég");
    switch (t.t) {
      case "num": return { k: "num", v: Number(t.v) };
      case "str": return { k: "str", v: t.v };
      case "bool": return { k: "bool", v: t.v === "TRUE" };
      case "err": return { k: "err", v: t.v };
      case "ref": { const [a, b] = t.v.split(":"); return b ? { k: "range", sheet: t.sheet, a, b } : { k: "ref", sheet: t.sheet, a }; }
      case "name": return { k: "name", v: t.v };
      case "(": { const e = cmp(); if (next()?.t !== ")") throw new Error("Hiányzó zárójel"); return e; }
      case "func": {
        if (next()?.t !== "(") throw new Error("Hiányzó zárójel");
        const args: Node[] = [];
        if (peek()?.t === ")") { next(); return { k: "call", fn: t.v, args }; }
        while (true) {
          if (peek()?.t === "," ) { args.push({ k: "str", v: "" }); next(); continue; }
          args.push(cmp());
          const n = next();
          if (n?.t === ")") break;
          if (n?.t !== ",") throw new Error("Hibás argumentumlista");
        }
        return { k: "call", fn: t.v, args };
      }
      default: throw new Error(`Váratlan elem: ${t.v}`);
    }
  }
  const node = cmp();
  if (p !== toks.length) throw new Error("Fel nem dolgozott képletrész");
  return node;
}

// ---------- Evaluator ----------
class Unsupported extends Error {}
type RangeV = { range: Scalar[]; cells: { sheet: SheetModel; row: number; col: number }[] };
type Val = Scalar | RangeV;
const isRange = (v: Val): v is RangeV => typeof v === "object" && v !== null && "range" in v;

/** Excel 15 jegyű pontossága: lebegőpontos zaj eltávolítása kerekítés előtt. */
const p15 = (x: number) => Number(x.toPrecision(15));

function toNum(v: Scalar): number | ErrorV {
  if (isErr(v)) return v;
  if (v === null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  const t = v.trim(); if (t !== "" && Number.isFinite(Number(t))) return Number(t);
  return E("#VALUE!");
}
function toStr(v: Scalar): string { if (v === null) return ""; if (typeof v === "boolean") return v ? "TRUE" : "FALSE"; if (typeof v === "number") return String(p15(v)); return String(v); }
function toBool(v: Scalar): boolean | ErrorV { if (isErr(v)) return v; if (typeof v === "boolean") return v; if (v === null) return false; if (typeof v === "number") return v !== 0; const u = v.toUpperCase(); if (u === "TRUE") return true; if (u === "FALSE") return false; return E("#VALUE!"); }

function compare(a: Scalar, b: Scalar): number {
  const rank = (x: Scalar) => (typeof x === "number" ? 0 : typeof x === "string" ? 1 : 2);
  if (a === null) a = typeof b === "string" ? "" : typeof b === "boolean" ? false : 0;
  if (b === null) b = typeof a === "string" ? "" : typeof a === "boolean" ? false : 0;
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (typeof a === "string") { const x = a.toLowerCase(), y = String(b).toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
  const x = Number(a), y = Number(b); return x < y ? -1 : x > y ? 1 : 0;
}

function roundDigits(x: number, d: number, mode: "half" | "up" | "down"): number {
  const f = Math.pow(10, Math.trunc(d)), v = p15(Math.abs(x) * f), s = x < 0 ? -1 : 1;
  const r = mode === "half" ? Math.floor(v + 0.5) : mode === "up" ? Math.ceil(v) : Math.floor(v);
  return p15((s * r) / f);
}

export type EvalStats = { evaluated: number; unsupported: Map<string, number>; errors: number; cycles: number };

export class WorkbookEvaluator {
  private memo = new Map<string, Scalar>();
  private active = new Set<string>();
  private parsed = new Map<string, Node | Error>();
  private sheetsByName = new Map<string, SheetModel>();
  readonly stats: EvalStats = { evaluated: 0, unsupported: new Map(), errors: 0, cycles: 0 };
  constructor(private model: WorkbookModel, private overrides: Map<string, Scalar> = new Map()) {
    for (const s of model.sheets) this.sheetsByName.set(s.name.toLowerCase(), s);
  }
  sheet(name: string): SheetModel | undefined { return this.sheetsByName.get(name.toLowerCase()); }

  /** Egy cella aktuális (felülírásokkal és újraszámolással kapott) értéke. */
  value(sheet: SheetModel, a: string): Scalar {
    const key = `${sheet.name}!${a}`;
    if (this.overrides.has(key)) return this.overrides.get(key)!;
    const cell = sheet.cells.get(a);
    if (!cell) return null;
    if (!cell.f) return cell.v;
    if (this.memo.has(key)) return this.memo.get(key)!;
    if (this.active.has(key)) { this.stats.cycles++; return E("#CYCLE"); }
    this.active.add(key);
    let out: Scalar;
    try {
      let node = this.parsed.get(cell.f);
      if (!node) { try { node = parseFormula(cell.f); } catch (e) { node = e as Error; } this.parsed.set(cell.f, node); }
      if (node instanceof Error) throw new Unsupported("PARSE");
      const v = this.ev(node, sheet);
      out = isRange(v) ? (v.range.length === 1 ? v.range[0] : E("#VALUE!")) : v;
      if (out === null) out = 0;
    } catch (e) {
      if (e instanceof Unsupported) { this.stats.unsupported.set(e.message, (this.stats.unsupported.get(e.message) ?? 0) + 1); out = E(`#UNSUPPORTED:${e.message}`); }
      else throw e;
    }
    this.active.delete(key);
    this.memo.set(key, out); this.stats.evaluated++;
    if (isErr(out)) this.stats.errors++;
    return out;
  }

  private resolveSheet(cur: SheetModel, name?: string): SheetModel {
    if (!name) return cur;
    const s = this.sheet(name);
    if (!s) throw new Unsupported("EXTERNAL_OR_MISSING_SHEET");
    return s;
  }

  private rangeOf(cur: SheetModel, sheetName: string | undefined, a: string, b: string): RangeV {
    const s = this.resolveSheet(cur, sheetName), A = splitAddr(a), B = splitAddr(b);
    const r1 = Math.min(A.row, B.row), r2 = Math.max(A.row, B.row), c1 = Math.min(A.col, B.col), c2 = Math.max(A.col, B.col);
    if ((r2 - r1 + 1) * (c2 - c1 + 1) > 500_000) throw new Unsupported("RANGE_TOO_LARGE");
    const range: Scalar[] = [], cells: RangeV["cells"] = [];
    const rEnd = Math.min(r2, s.maxRow), cEnd = Math.min(c2, s.maxCol);
    for (let r = r1; r <= rEnd; r++) for (let c = c1; c <= cEnd; c++) { range.push(this.value(s, addr(c, r))); cells.push({ sheet: s, row: r, col: c }); }
    return { range, cells };
  }

  private scalar(v: Val): Scalar { return isRange(v) ? (v.range.length === 1 ? v.range[0] : E("#VALUE!")) : v; }

  private ev(n: Node, cur: SheetModel): Val {
    switch (n.k) {
      case "num": return n.v;
      case "str": return n.v;
      case "bool": return n.v;
      case "err": return E(n.v);
      case "ref": { const s = this.resolveSheet(cur, n.sheet); return this.value(s, n.a); }
      case "range": return this.rangeOf(cur, n.sheet, n.a, n.b);
      case "name": {
        const target = this.model.names.get(n.v.toLowerCase());
        if (!target) throw new Unsupported("NAME");
        return this.ev(parseFormula(target), cur);
      }
      case "neg": { const x = toNum(this.scalar(this.ev(n.e, cur))); return isErr(x) ? x : -x; }
      case "pct": { const x = toNum(this.scalar(this.ev(n.e, cur))); return isErr(x) ? x : x / 100; }
      case "bin": {
        const l = this.scalar(this.ev(n.l, cur)), r = this.scalar(this.ev(n.r, cur));
        if (isErr(l)) return l; if (isErr(r)) return r;
        if (n.op === "&") return toStr(l) + toStr(r);
        if (["=", "<>", "<", ">", "<=", ">="].includes(n.op)) {
          const c = compare(l, r);
          return n.op === "=" ? c === 0 : n.op === "<>" ? c !== 0 : n.op === "<" ? c < 0 : n.op === ">" ? c > 0 : n.op === "<=" ? c <= 0 : c >= 0;
        }
        const x = toNum(l), y = toNum(r);
        if (isErr(x)) return x; if (isErr(y)) return y;
        switch (n.op) {
          case "+": return x + y; case "-": return x - y; case "*": return x * y;
          case "/": return y === 0 ? E("#DIV/0!") : x / y;
          case "^": return Math.pow(x, y);
        }
        throw new Unsupported(`OP_${n.op}`);
      }
      case "call": return this.call(n.fn, n.args, cur);
    }
  }

  /** Számok gyűjtése Excel-szabállyal: tartományban szöveg/logikai kimarad, közvetlen argumentumban konvertál. */
  private numbers(args: Node[], cur: SheetModel, skip?: (c: RangeV["cells"][number]) => boolean): number[] | ErrorV {
    const out: number[] = [];
    for (const a of args) {
      const v = this.ev(a, cur);
      if (isRange(v)) {
        for (let i = 0; i < v.range.length; i++) {
          if (skip && skip(v.cells[i])) continue;
          const x = v.range[i]; if (isErr(x)) return x; if (typeof x === "number") out.push(x);
        }
      } else { if (v === null) continue; const x = toNum(v); if (isErr(x)) return x; out.push(x); }
    }
    return out;
  }

  private call(fn: string, args: Node[], cur: SheetModel): Val {
    const arg = (i: number) => (args[i] ? this.scalar(this.ev(args[i], cur)) : null);
    const num = (i: number) => toNum(arg(i));
    const agg = (vals: number[] | ErrorV, f: (x: number[]) => Scalar) => (isErr(vals) ? vals : f(vals));
    const sum = (x: number[]) => x.reduce((a, b) => a + b, 0);
    switch (fn) {
      case "SUM": return agg(this.numbers(args, cur), sum);
      case "PRODUCT": return agg(this.numbers(args, cur), (x) => x.reduce((a, b) => a * b, 1));
      case "MIN": return agg(this.numbers(args, cur), (x) => (x.length ? Math.min(...x) : 0));
      case "MAX": return agg(this.numbers(args, cur), (x) => (x.length ? Math.max(...x) : 0));
      case "AVERAGE": return agg(this.numbers(args, cur), (x) => (x.length ? sum(x) / x.length : E("#DIV/0!")));
      case "COUNT": return agg(this.numbers(args, cur), (x) => x.length);
      case "SUBTOTAL": {
        const code = num(0); if (isErr(code)) return code;
        const base = code > 100 ? code - 100 : code;
        // Excel: a tartományban lévő további SUBTOTAL-képletek kimaradnak; 101–111 a rejtett sorokat is kihagyja.
        const skip = (c: RangeV["cells"][number]) => /SUBTOTAL\s*\(/i.test(c.sheet.cells.get(addr(c.col, c.row))?.f ?? "") || (code > 100 && c.sheet.hiddenRows.has(c.row));
        const vals = this.numbers(args.slice(1), cur, skip);
        if (isErr(vals)) return vals;
        if (base === 9) return sum(vals);
        if (base === 1) return vals.length ? sum(vals) / vals.length : E("#DIV/0!");
        if (base === 2) return vals.length;
        if (base === 4) return vals.length ? Math.max(...vals) : 0;
        if (base === 5) return vals.length ? Math.min(...vals) : 0;
        throw new Unsupported(`SUBTOTAL_${code}`);
      }
      case "ROUND": case "ROUNDUP": case "ROUNDDOWN": {
        const x = num(0), d = args.length > 1 ? num(1) : 0; if (isErr(x)) return x; if (isErr(d)) return d;
        return roundDigits(x, d, fn === "ROUND" ? "half" : fn === "ROUNDUP" ? "up" : "down");
      }
      case "INT": { const x = num(0); return isErr(x) ? x : Math.floor(x); }
      case "ABS": { const x = num(0); return isErr(x) ? x : Math.abs(x); }
      case "IF": { const c = toBool(arg(0)); if (isErr(c)) return c; return c ? (args[1] ? this.ev(args[1], cur) : true) : (args[2] ? this.ev(args[2], cur) : false); }
      case "IFERROR": { const v = arg(0); return isErr(v) ? arg(1) : v; }
      case "ISERROR": return isErr(arg(0));
      case "ISNUMBER": return typeof arg(0) === "number";
      case "ISBLANK": return arg(0) === null;
      case "AND": case "OR": {
        let acc = fn === "AND";
        for (const a of args) { const v = this.ev(a, cur); const list = isRange(v) ? v.range.filter((x) => typeof x === "boolean" || typeof x === "number") : [v]; for (const x of list) { const b = toBool(x); if (isErr(b)) return b; acc = fn === "AND" ? acc && b : acc || b; } }
        return acc;
      }
      case "NOT": { const b = toBool(arg(0)); return isErr(b) ? b : !b; }
      case "TRUE": return true;
      case "FALSE": return false;
      case "N": { const v = arg(0); return typeof v === "number" ? v : v === true ? 1 : 0; }
      case "VALUE": { const v = arg(0); return typeof v === "number" ? v : toNum(String(v ?? "")); }
      case "CONCATENATE": { let s = ""; for (let i = 0; i < args.length; i++) { const v = arg(i); if (isErr(v)) return v; s += toStr(v); } return s; }
      case "SUMPRODUCT": {
        const ranges = args.map((a) => this.ev(a, cur));
        if (!ranges.every(isRange)) throw new Unsupported("SUMPRODUCT_SCALAR");
        const len = (ranges[0] as RangeV).range.length;
        if (ranges.some((r) => (r as RangeV).range.length !== len)) return E("#VALUE!");
        let t = 0; for (let i = 0; i < len; i++) { let p = 1; for (const r of ranges as RangeV[]) { const x = r.range[i]; if (isErr(x)) return x; p *= typeof x === "number" ? x : 0; } t += p; }
        return t;
      }
      case "SUMIF": {
        const crit = this.ev(args[0], cur), cond = arg(1), sumR = args[2] ? this.ev(args[2], cur) : crit;
        if (!isRange(crit) || !isRange(sumR)) throw new Unsupported("SUMIF_SCALAR");
        const m = /^(<=|>=|<>|<|>|=)?(.*)$/s.exec(toStr(cond))!; const op = m[1] ?? "=", rhsRaw = m[2];
        if (/[*?]/.test(rhsRaw)) throw new Unsupported("SUMIF_WILDCARD");
        const rhs: Scalar = rhsRaw !== "" && Number.isFinite(Number(rhsRaw)) ? Number(rhsRaw) : rhsRaw;
        let t = 0;
        for (let i = 0; i < crit.range.length; i++) {
          const x = crit.range[i]; if (isErr(x)) continue;
          const c = compare(x ?? (typeof rhs === "number" ? null : ""), rhs);
          const ok = op === "=" ? c === 0 : op === "<>" ? c !== 0 : op === "<" ? c < 0 : op === ">" ? c > 0 : op === "<=" ? c <= 0 : c >= 0;
          const y = sumR.range[i]; if (ok && typeof y === "number") t += y;
        }
        return t;
      }
      default: throw new Unsupported(fn);
    }
  }
}
