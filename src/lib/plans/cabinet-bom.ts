/**
 * P4 — elosztószekrény anyagjegyzék (BOM) a terv szövegrétegéből, determinisztikus szabályokkal.
 * Mennyiségforrás rangja: (1) a nézeti rajz / készülékjegyzék kiírt darabszáma („4db kismegszakító”),
 * (2) a szekrény-specifikáció szövege (méret, típus), (3) a kapcsolási rajz jelöléseinek gépi számlálása
 * (csak összevetésre és névleges áram szerinti bontásra). Pólusszám, kivitel vagy típus bizonyíték nélkül nem pótolható.
 */
import { clean, fold, pageLines, snip, type Evidence, type PlanFile, type PlanItem, type PlanPage } from "./plan-text";
import type { PageIdentity } from "./sheet-identify";

export type DeviceClass = "enclosure" | "main_switch" | "mcb" | "rcd" | "rcbo" | "spd" | "contactor" | "switch" | "terminal" | "busbar" | "fuse" | "relay" | "meter" | "other";
export const DEVICE_LABEL: Record<DeviceClass, string> = {
  enclosure: "Szekrénytest / elosztó", main_switch: "Főkapcsoló / betáp megszakító", mcb: "Kismegszakító", rcd: "Áram-védőkapcsoló (RCD)", rcbo: "Áramvédős kismegszakító (RCBO)",
  spd: "Túlfeszültség-levezető", contactor: "Kontaktor / mágneskapcsoló", switch: "Kapcsoló / választókapcsoló", terminal: "Sorkapocs", busbar: "Gyűjtősín / fázissín", fuse: "Biztosító / szakaszoló", relay: "Relé / időrelé", meter: "Mérő", other: "Egyéb készülék",
};

export type BomLine = {
  id: string; cabinetId: string; cls: DeviceClass; description: string; qty: number | null; unit: "db";
  rating: string | null; poles: string | null; productRef: string | null;
  basis: "explicit_list" | "enclosure_spec" | "schematic_count"; evidence: Evidence[];
  /** Árazást akadályozó bizonytalanság (sor nem árazható automatikusan). */ uncertain: string[];
  /** Nem akadályozó megjegyzés (ellenőrizendő, de bizonyítékkal alátámasztott). */ notes: string[];
  /** A kapcsolási rajz névleges áram szerinti bontásának egy eleme (szülő: összesítő sor). */
  parentId?: string | null;
};
export type SchematicCount = { cls: DeviceClass; count: number; ratings: Record<string, number>; evidence: Evidence[] };
export type Circuit = { id: string; name: string | null; cable: string | null; powerW: number | null; evidence: Evidence };
export type Cabinet = {
  id: string; title: string | null; drawingNos: string[]; pages: { fileId: string; fileName: string; page: number; docType: string }[];
  enclosure: BomLine | null; lines: BomLine[]; schematic: SchematicCount[]; circuits: Circuit[];
  productRefs: { cls: DeviceClass; poles: string | null; text: string; evidence: Evidence }[];
  reconciliation: { cls: DeviceClass; explicit: number | null; schematic: number | null; ok: boolean | null; note: string }[];
  status: "bom_complete" | "bom_partial" | "no_device_list" | "no_drawing"; gaps: string[]; questions: string[];
  ratedData: { label: string; value: string; evidence: Evidence }[];
};

const ev = (f: { fileId: string; fileName: string }, page: number, s: string, ai = false): Evidence => ({ kind: "plan", fileId: f.fileId, fileName: f.fileName, page, snippet: snip(s), aiExtracted: ai });

export function classifyDevice(text: string): DeviceClass {
  const t = fold(text);
  if (/rcbo|aramvedos kismegszakito|kombinalt.*vedokapcsolo/.test(t)) return "rcbo";
  if (/\brcd\b|\bfi\b|fi-rele|aram-?vedokapcsolo|rccb|\biid\b/.test(t)) return "rcd";
  if (/kismegszakito|\bic60|\bmcb\b/.test(t)) return "mcb";
  if (/tulfeszultseg|levezeto|\bspd\b/.test(t)) return "spd";
  if (/kontaktor|magneskapcsolo|\blc1|\bict\b/.test(t)) return "contactor";
  if (/fokapcsolo|ng125|nsx|\bins\d|terheleskapcsolo|szakaszolo kapcsolo/.test(t)) return "main_switch";
  if (/\bsbi\b|biztosito|olvado/.test(t)) return "fuse";
  if (/sorkapo?cs/.test(t)) return "terminal";
  if (/gyujtosin|fazissin|\bsin\b/.test(t)) return "busbar";
  if (/rele|idorele|lepcsohazi automata|alkonykapcsolo/.test(t)) return "relay";
  if (/fogyasztasmero|\bmero\b|almero/.test(t)) return "meter";
  if (/kapcsolo|valaszto|nyomogomb/.test(t)) return "switch";
  if (/szekreny|eloszto|tokozat/.test(t)) return "enclosure";
  return "other";
}

const RATING_RE = /^(\d{1,4}(?:[.,]\d)?)\s?A$/;
const MA_RE = /^\d{2,3}\s?mA$/i;
const MAIN_RE = /^(NG\d{2,3}[A-Z]?|NSX\d+[A-Z]?|INS\d+|SBI-\dP)$/i;
const isLegend = (t: string) => /\bpl\.?:|tipusu|tip\./.test(fold(t));

function polesOf(t: string): string | null {
  const m = t.match(/\b([1-4])\s?P(?:\+N)?\b/) ?? t.match(/\b(I{1,3}|IV)\.?\s?s\./);
  if (!m) return null;
  const roman: Record<string, string> = { I: "1P", II: "2P", III: "3P", IV: "4P" };
  return /P/.test(m[0]) ? m[0].replace(/\s/g, "") : roman[m[1]!] ?? null;
}

/** A kapcsolási rajz oldalainak gépi jelölésszámlálása (pozíciós elemekből pontosabb). */
function schematicOf(f: { fileId: string; fileName: string }, p: PlanPage, maxX: number | null = null) {
  const lines = pageLines(p).map((l) => (maxX != null && l.items ? { ...l, items: l.items.filter((i) => i.x < maxX), text: clean(l.items.filter((i) => i.x < maxX).map((i) => i.s).join(" ")) } : l)).filter((l) => l.text);
  const counts = new Map<DeviceClass, SchematicCount>();
  const add = (cls: DeviceClass, rating: string | null, s: string) => {
    const c = counts.get(cls) ?? { cls, count: 0, ratings: {}, evidence: [] }; counts.set(cls, c);
    c.count++; if (rating) c.ratings[rating] = (c.ratings[rating] ?? 0) + 1; if (c.evidence.length < 3) c.evidence.push(ev(f, p.page, s, p.aiExtracted));
  };
  const items: (PlanItem & { line: string })[] = [];
  for (const l of lines) {
    if (isLegend(l.text) || /^aramkor\s*:|^beep/.test(fold(l.text))) continue;
    if (l.items) for (const it of l.items) items.push({ ...it, line: l.text });
    else for (const w of l.text.split(/\s+/)) items.push({ s: w, x: NaN, y: NaN, line: l.text });
  }
  const geo = items.some((i) => Number.isFinite(i.x));
  const near = (a: PlanItem, b: PlanItem, dx: number, dyMin: number, dyMax: number) => Math.abs(a.x - b.x) <= dx && a.y - b.y >= dyMin && a.y - b.y <= dyMax;
  const ma = items.filter((i) => MA_RE.test(i.s.trim()));
  const mains = items.filter((i) => MAIN_RE.test(i.s.trim()));
  const ms = items.filter((i) => i.s.trim() === "M");
  const used = new Set<PlanItem>();
  for (const m of ma) {
    const r = geo ? items.find((i) => RATING_RE.test(i.s.trim()) && !used.has(i) && near(i, m, 8, 2, 16)) : null;
    if (r) used.add(r);
    add("rcd", r ? r.s.trim().replace(/\s/g, "") : null, m.line);
  }
  for (const mn of mains) {
    const r = geo ? items.find((i) => RATING_RE.test(i.s.trim()) && !used.has(i) && near(mn, i, 16, 0, 16)) : null;
    if (r) used.add(r);
    add(/^SBI/i.test(mn.s) ? "fuse" : "main_switch", r ? r.s.trim() : null, mn.line);
  }
  for (const m of ms) {
    const r = geo ? items.find((i) => RATING_RE.test(i.s.trim()) && !used.has(i) && Math.abs(i.x - m.x) <= 10 && Math.abs(i.y - m.y) <= 14) : null;
    if (r) used.add(r);
    add("contactor", r ? r.s.trim() : null, m.line);
  }
  let unpaired = 0;
  for (const i of items) if (RATING_RE.test(i.s.trim()) && !used.has(i) && !/[x×]/i.test(i.s)) { if (!geo && ma.length > unpaired) { unpaired++; continue; } add("mcb", i.s.trim().replace(/\s/g, ""), i.line); }
  if (/tulfeszultseg/.test(fold(lines.map((l) => l.text).join(" ")))) { const l = lines.find((x) => /tulfeszultseg/.test(fold(x.text)))!; add("spd", null, l.text); }
  return { counts: [...counts.values()], geo };
}

const CABLE_RE = /\b(NYY|NYM|NAYY|CYKY|YKY|NYCWY|N2XH|NHXH|H07RN-F|H05VV-F|MKH|MT|YSLY|JB-?Y|J-Y\(St\)Y)[-\s]?(?:-?[A-Z]{1,2}\s)?(\d{1,2})\s*[x×]\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:mm2|mm²|²|mm)?/gi;
export function cableKeys(text: string): { key: string; type: string; cores: number; section: string; raw: string }[] {
  const out: { key: string; type: string; cores: number; section: string; raw: string }[] = [];
  for (const m of text.matchAll(CABLE_RE)) {
    const type = m[1]!.toUpperCase().replace(/^JBY$/, "JB-Y"), cores = Number(m[2]), section = m[3]!.replace(",", ".");
    out.push({ key: `${type} ${cores}x${section}`, type, cores, section, raw: m[0] });
  }
  return out;
}

function circuitsOf(f: { fileId: string; fileName: string }, p: PlanPage): Circuit[] {
  const lines = pageLines(p);
  const head = lines.find((l) => /^aramkor\s*:/.test(fold(l.text)));
  if (!head) return [];
  const ids = (head.items ? head.items.slice(1).map((i) => i.s.trim()) : head.text.replace(/^Áramkör:?/i, "").trim().split(/\s+/)).filter((s) => /^[A-Z0-9]{1,4}$/.test(s));
  const idItems = head.items?.slice(1).filter((i) => /^[A-Z0-9]{1,4}$/.test(i.s.trim())) ?? [];
  const pow = lines.find((l) => /^beep/.test(fold(l.text)));
  const powItems = pow?.items?.slice(1) ?? [];
  const descLine = lines.filter((l) => l.y != null && head.y != null && l.y > head.y && l.y - head.y < 30 && cableKeys(l.text).length).sort((a, b) => a.y! - b.y!)[0];
  const out: Circuit[] = [];
  const seen = new Set<string>();
  ids.forEach((id, k) => {
    if (seen.has(id)) return; seen.add(id);
    const it = idItems[k];
    let powerW: number | null = null, cable: string | null = null, name: string | null = null;
    if (it && powItems.length) { const pw = powItems.reduce((b, x) => (Math.abs(x.x - it.x) < Math.abs(b.x - it.x) ? x : b)); if (Math.abs(pw.x - it.x) < 25) { const n = Number(pw.s.replace(/\s/g, "")); powerW = Number.isFinite(n) ? n : null; } }
    if (it && descLine?.items) {
      const cand = descLine.items.filter((x) => Math.abs(x.x - it.x) < 26);
      const cab = cand.find((x) => cableKeys(x.s).length); cable = cab ? cableKeys(cab.s)[0]!.key : null;
      const nm = cand.find((x) => !cableKeys(x.s).length); name = nm ? clean(nm.s) : null;
    }
    out.push({ id, name, cable, powerW, evidence: ev(f, p.page, head.text, p.aiExtracted) });
  });
  return out;
}

function explicitLines(cabinetId: string, f: { fileId: string; fileName: string }, p: PlanPage, start: number): { lines: BomLine[]; enclosure: BomLine | null; listX: number | null } {
  const lines = pageLines(p);
  const out: BomLine[] = []; let enclosure: BomLine | null = null; let n = start;
  const dbItems = lines.flatMap((l) => (l.items ?? []).filter((i) => /(?:^|\s)\d{1,3}\s*db\b/i.test(i.s)));
  const listX = dbItems.length ? Math.min(...dbItems.map((i) => i.x)) - 20 : null;
  const view = /nezeti rajz/.test(fold(lines.map((x) => x.text).join(" ")));
  lines.forEach((l, idx) => {
    const t = l.text;
    if (!enclosure && /(eloszto|szekreny|tokozat)/.test(fold(t)) && /\d{3,4}\s*[x×]\s*\d{3,4}/.test(t)) {
      const desc = [t, ...lines.slice(idx + 1, idx + 4).map((x) => x.text).filter((x) => !/\d+\s*db\b/i.test(x) && !/^\d{3,4}$/.test(x) && x.length > 12)].join(" ");
      const man = t.match(/([A-ZÁÉ][A-Za-zÁ-ű]+)\s+gy\./)?.[1] ?? null;
      enclosure = { id: `${cabinetId}-ENC`, cabinetId, cls: "enclosure", description: clean(desc), qty: 1, unit: "db", rating: null, poles: null, productRef: man ? clean(t) : null,
        basis: "enclosure_spec", evidence: [ev(f, p.page, desc, p.aiExtracted)], uncertain: [], notes: /végleges|beszállítói gyártmányterv/i.test(desc) ? ["A végleges méret/elrendezés beszállítói gyártmányterv szerint — ár a rajzi méretre szól."] : [] };
      return;
    }
    const listText = listX != null && l.items ? clean(l.items.filter((i) => i.x >= listX).map((i) => i.s).join(" ")) : listX == null ? t : "";
    const parts = listText.split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/(?:^|\s)(\d{1,3})\s*db\s+(.+)$/i);
      if (m) {
        const cls = classifyDevice(m[2]!);
        out.push({ id: `${cabinetId}-${++n}`, cabinetId, cls, description: clean(m[2]!), qty: Number(m[1]), unit: "db", rating: m[2]!.match(/\b\d{1,4}\s?A\b/)?.[0]?.replace(/\s/g, "") ?? null,
          poles: polesOf(m[2]!), productRef: null, basis: "explicit_list", evidence: [ev(f, p.page, t, p.aiExtracted)], uncertain: cls === "other" ? ["Ismeretlen készüléktípus — szakértői besorolás szükséges."] : [], notes: [] });
      } else if (view && listX != null && /(tulfeszultseg|sorkapo?cs|gyujtosin|kapcsolo|rele)/.test(fold(part)) && !/\d{3,4}/.test(part) && part.length < 60) {
        const cls = classifyDevice(part);
        out.push({ id: `${cabinetId}-${++n}`, cabinetId, cls, description: clean(part), qty: null, unit: "db", rating: null, poles: polesOf(part), productRef: null,
          basis: "explicit_list", evidence: [ev(f, p.page, t, p.aiExtracted)], uncertain: ["A rajz nem írja ki a darabszámot."], notes: [] });
      }
    }
  });
  return { lines: out, enclosure, listX };
}

export function buildCabinets(files: PlanFile[], pages: PlanPage[], ids: PageIdentity[]): Cabinet[] {
  const fileById = new Map(files.map((f) => [f.fileId, f]));
  const byId = new Map<string, PageIdentity[]>();
  for (const p of ids) for (const c of p.cabinetIds) { if (p.docType.value === "technical_description" || p.docType.value === "budget_sheet") continue; byId.set(c.id, [...(byId.get(c.id) ?? []), p]); }
  const cabinets: Cabinet[] = [];
  for (const [id, pids] of byId) {
    const cab: Cabinet = { id, title: pids.find((p) => p.title)?.title?.value ?? null, drawingNos: [...new Set(pids.map((p) => p.drawingNo?.value).filter((x): x is string => !!x))],
      pages: pids.map((p) => ({ fileId: p.fileId, fileName: p.fileName, page: p.page, docType: p.docType.value })), enclosure: null, lines: [], schematic: [], circuits: [], productRefs: [], reconciliation: [],
      status: "no_device_list", gaps: [], questions: [], ratedData: [] };
    const sch = new Map<DeviceClass, SchematicCount>();
    let geoAll = true;
    for (const pid of pids) {
      const page = pages.find((p) => p.fileId === pid.fileId && p.page === pid.page)!; const f = fileById.get(pid.fileId) ?? { fileId: pid.fileId, fileName: pid.fileName };
      const lines = pageLines(page);
      for (const l of lines) {
        const t = fold(l.text);
        if (isLegend(l.text)) for (const seg of l.text.split(/(?=Pl\.:)/)) { if (!/Pl\.:/.test(seg)) continue; const cls = classifyDevice(seg); if (cls !== "other") cab.productRefs.push({ cls, poles: polesOf(seg), text: clean(seg).slice(0, 200), evidence: ev(f, pid.page, seg, page.aiExtracted) }); }
        const rd = l.text.match(/^(Tápfeszültség|Érintésvédelem|Beépített teljesítmény|Egyidejű teljesítmény|Névleges áram|Zárlatszilárdság)[^:]*:\s*(.+)$/i) ?? (/zarlatszilardsag/.test(t) ? [l.text, "Zárlatszilárdság", l.text] : null);
        if (rd && cab.ratedData.length < 8 && !cab.ratedData.some((x) => x.label === rd[1])) cab.ratedData.push({ label: rd[1]!, value: clean(rd[2]!).slice(0, 120), evidence: ev(f, pid.page, l.text, page.aiExtracted) });
      }
      let schematicMaxX: number | null = null, isSchematic = pid.docType.value === "single_line";
      if (pid.docType.value === "cabinet_view") {
        const ex = explicitLines(id, f, page, cab.lines.length);
        cab.lines.push(...ex.lines); if (ex.enclosure && !cab.enclosure) cab.enclosure = ex.enclosure;
        // Közös lap: bal oldali kapcsolási rajz + jobb oldali készüléklista.
        if (ex.listX != null && lines.some((l) => /^aramkor\s*:/.test(fold(l.text)))) { isSchematic = true; schematicMaxX = ex.listX; }
      }
      if (isSchematic) {
        const s = schematicOf(f, page, schematicMaxX); geoAll = geoAll && s.geo;
        for (const c of s.counts) { const cur = sch.get(c.cls) ?? { cls: c.cls, count: 0, ratings: {}, evidence: [] }; cur.count += c.count; for (const [r, k] of Object.entries(c.ratings)) cur.ratings[r] = (cur.ratings[r] ?? 0) + k; cur.evidence.push(...c.evidence.slice(0, 2)); sch.set(c.cls, cur); }
        cab.circuits.push(...circuitsOf(f, page));
      }
    }
    cab.schematic = [...sch.values()];
    // Összevetés: kiírt darabszám ↔ rajzi jelölésszám.
    for (const cls of ["mcb", "rcd", "contactor", "spd"] as DeviceClass[]) {
      const explicit = cab.lines.filter((l) => l.cls === cls && l.qty != null).reduce((a, l) => a + l.qty!, 0);
      const hasExplicit = cab.lines.some((l) => l.cls === cls && l.qty != null);
      const s = sch.get(cls)?.count ?? null;
      if (!hasExplicit && s == null) continue;
      const ok = hasExplicit && s != null ? explicit === s : null;
      cab.reconciliation.push({ cls, explicit: hasExplicit ? explicit : null, schematic: s, ok,
        note: ok === true ? "A nézeti rajz darabszáma egyezik a kapcsolási rajz jelöléseivel." : ok === false ? `Eltérés: nézeti rajz ${explicit} db, kapcsolási rajz gépi jelölésszáma ${s} db — szakértői ellenőrzés szükséges.` : hasExplicit ? "Csak a nézeti rajz darabszáma érhető el." : `Csak kapcsolási rajzi gépi jelölésszám (${s} db${geoAll ? "" : ", pozíció nélküli szövegből"}); nincs kiírt darabszám.` });
    }
    // Névleges áram szerinti bontás, ha a rajzi összeg egyezik a kiírttal.
    for (const cls of ["mcb", "rcd"] as DeviceClass[]) {
      const parents = cab.lines.filter((l) => l.cls === cls && l.qty != null && !l.rating);
      const s = sch.get(cls); const rec = cab.reconciliation.find((r) => r.cls === cls);
      const refs = cab.productRefs.filter((r) => r.cls === cls);
      const poleSet = [...new Set(refs.map((r) => r.poles).filter(Boolean))];
      for (const pl of parents) {
        if (!pl.poles && poleSet.length > 1) pl.uncertain.push(`Pólusszám nem állapítható meg a szövegrétegből (a jelmagyarázatban ${poleSet.join(" és ")} is szerepel).`);
        if (!pl.poles && poleSet.length === 1) { pl.poles = poleSet[0]!; pl.notes.push("Pólusszám a jelmagyarázatból (egyetlen változat) — ellenőrizendő."); }
        if (refs[0] && !pl.productRef) pl.productRef = refs[0].text;
        if (!pl.rating) { if (rec?.ok) pl.notes.push("Névleges áram bontása a kapcsolási rajzból (lásd alsorok)."); else pl.uncertain.push("Névleges áram szerinti bontás nem igazolt (darabszám-eltérés vagy nincs kapcsolási rajz)."); }
      }
      if (s && rec?.ok && parents.length) {
        const total = parents.reduce((a, l) => a + l.qty!, 0);
        if (total === s.count) for (const [rating, k] of Object.entries(s.ratings).sort((a, b) => parseFloat(a[0]) - parseFloat(b[0])))
          cab.lines.push({ id: `${id}-${cls}-${rating}`, cabinetId: id, cls, description: `${DEVICE_LABEL[cls]} ${rating}`, qty: k, unit: "db", rating, poles: parents[0]!.poles, productRef: parents[0]!.productRef,
            basis: "schematic_count", evidence: s.evidence.slice(0, 2), uncertain: parents[0]!.poles ? [] : ["Pólusszám nem igazolt."], notes: ["Darabszám a kapcsolási rajz jelöléseiből; összege egyezik a nézeti rajzzal."], parentId: "rating_breakdown" });
      }
    }
    if (!cab.enclosure) { cab.gaps.push("A szekrénytest mérete/típusa nem található a terven."); cab.questions.push(`Kérjük a(z) ${id} elosztó szekrénytestének típusát és méretét (vagy nézeti rajzát).`); }
    if (!cab.lines.length && !cab.schematic.length) { cab.status = "no_device_list"; cab.gaps.push("Nincs készülékjegyzék vagy kapcsolási rajzi készülékjelölés."); cab.questions.push(`Kérjük a(z) ${id} elosztó kapcsolási rajzát és készülékjegyzékét.`); }
    else {
      const broken = new Set(cab.lines.filter((l) => l.parentId === "rating_breakdown").map((l) => l.cls));
      const priced = cab.lines.filter((l) => !(broken.has(l.cls) && l.parentId !== "rating_breakdown" && !l.rating));
      const anyUnc = priced.some((l) => l.qty == null || l.uncertain.length) || cab.reconciliation.some((r) => r.ok === false) || !cab.enclosure || !cab.lines.length;
      cab.status = anyUnc ? "bom_partial" : "bom_complete";
      if (!cab.lines.length) { cab.gaps.push("Csak kapcsolási rajzi gépi számlálás érhető el, kiírt darabszám (nézeti rajz/készülékjegyzék) nincs."); cab.questions.push(`Kérjük a(z) ${id} elosztó nézeti rajzát vagy készülékjegyzékét darabszámokkal.`); }
      for (const r of cab.reconciliation.filter((x) => x.ok === false)) cab.questions.push(`${id}: ${DEVICE_LABEL[r.cls]} darabszáma a nézeti rajzon ${r.explicit}, a kapcsolási rajzon ${r.schematic}. Melyik az érvényes?`);
      if (cab.lines.some((l) => l.uncertain.some((u) => u.startsWith("Pólusszám nem állapítható")))) cab.questions.push(`${id}: kérjük a kismegszakítók/RCD-k pólusszám szerinti darabszámát (1P/3P, 2P/4P).`);
      if (cab.lines.some((l) => l.qty == null)) cab.questions.push(`${id}: a(z) ${cab.lines.filter((l) => l.qty == null).map((l) => l.description).join(", ")} darabszáma nincs a rajzon.`);
    }
    cabinets.push(cab);
  }
  return cabinets.sort((a, b) => a.id.localeCompare(b.id, "hu", { numeric: true }));
}

/** Költségvetésben szereplő, de terv nélküli szekrény — soha nem kap bizonyítatlan teljes árat. */
export function cabinetWithoutDrawing(id: string, budgetEvidence: Evidence): Cabinet {
  return { id, title: null, drawingNos: [], pages: [], enclosure: null, lines: [], schematic: [], circuits: [], productRefs: [], reconciliation: [], ratedData: [],
    status: "no_drawing", gaps: ["A költségvetésben szerepel, de a csomagban nincs hozzá kapcsolási/nézeti rajz."], questions: [`Kérjük a(z) ${id} elosztó kapcsolási rajzát és készülékjegyzékét; addig a szekrény ára nem számítható.`] };
}
