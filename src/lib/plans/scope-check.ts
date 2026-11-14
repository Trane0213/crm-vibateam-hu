/**
 * P4 — költségvetés ↔ tervrajz ↔ műszaki leírás ↔ e-mailes pontosítás eltéréslistája (specifikáció 8. fejezet).
 * Minden észrevétel strukturált: kategória, súlyosság, érintett tételsorok, bizonyíték, javasolt kérdés, hatás, állapot.
 * Gépi összevetés: a „nincs találat” nem bizonyítja a hiányt, ezért ilyenkor „tisztázandó”, nem „hiány”.
 */
import type { BudgetExtract, BudgetRow } from "@/lib/pricing/budget-extract";
import { norm } from "@/lib/pricing/normalize";
import { cableKeys, type Cabinet } from "./cabinet-bom";
import { clean, fold, pageLines, snip, type Evidence, type PlanPage } from "./plan-text";
import { normDrawingNo, type DrawingEntry, type PageIdentity } from "./sheet-identify";

export type FindingCategory = "elteres" | "hiany" | "kizaras" | "feltetelezes" | "tisztazando";
export const FINDING_LABEL: Record<FindingCategory, string> = { elteres: "Eltérés", hiany: "Hiány", kizaras: "Kizárás", feltetelezes: "Feltételezés", tisztazando: "Tisztázandó" };
export type Finding = {
  id: string; category: FindingCategory; severity: "high" | "medium" | "low"; title: string;
  rows: { key: string; name: string }[]; evidence: Evidence[]; question: string | null; impact: string; status: "open";
  source: "rule"; topic: string;
};
export type Clarification = { ref: string; emailId: string; date: string | null; from: string | null; text: string };

const rowEv = (r: BudgetRow, file: string): Evidence => ({ kind: "budget", fileName: file, ref: r.key, snippet: snip(`${r.itemNo ? `${r.itemNo} ` : ""}${r.context && r.context !== r.name ? `${r.context} › ` : ""}${r.name} — ${r.qty ?? "?"} ${r.unitRaw ?? ""}`) });
const rowRef = (r: BudgetRow) => ({ key: r.key, name: `${r.context && r.context !== r.name ? `${r.context.slice(0, 60)} › ` : ""}${r.name}`.slice(0, 200) });

const SCOPE_RULES: { cat: FindingCategory; re: RegExp; topic: string }[] = [
  { cat: "kizaras", re: /nem tartalmaz|nem targya|nem resze|nem kepezi|kivul esik|nem vallal|nem a villamos|terveink nem|kulon (szerzodes|megrendeles|tervezes)|mas kivitelezo|mas szakag|nem kell (kiepiteni|szallitani|szerelni)/, topic: "lehatarolas" },
  { cat: "feltetelezes", re: /(megrendelo|epittet|beruhazo|uzemelteto|generalkivitelezo)\S* (biztosit|szallit|vegzi|kesziti)|biztositja a (megrendelo|beruhazo|epittet)|meglevo-? ?megmarado|meglevo .{0,30}megmarad/, topic: "feltetelezes" },
  { cat: "tisztazando", re: /egyeztetni kell|egyeztetes szerint|egyeztetendo|tisztazando|kerdeses|beszallitoi gyartmanyterv szerint|kesobb kerul meghatarozasra|technologus (adatai|tervei) szerint|gepesz (adatai|tervei) szerint/, topic: "egyeztetes" },
];
const TYPICAL: { topic: string; label: string; re: RegExp; ask: boolean }[] = [
  { topic: "ideiglenes", label: "Ideiglenes villamos energiaellátás", re: /ideiglenes (villamos|energia|aram)/, ask: true },
  { topic: "funkciomegtartas", label: "Funkciómegtartó kábelezés (tűzvédelmi)", re: /funkciomegtart|\be30\b|\be90\b|\bph ?90\b/, ask: true },
  { topic: "tuzgatlo", label: "Tűzgátló lezárások", re: /tuzgatlo|tuzszakasz.{0,30}lezar/, ask: true },
  { topic: "atadasi_meres", label: "Átadási mérés / érintésvédelmi felülvizsgálat", re: /erintesvedelmi (meres|felulvizsgalat)|szabvanyossagi felulvizsgalat|meresi jegyzokonyv|atadasi meres/, ask: true },
  { topic: "foldeles", label: "Földelés / EPH", re: /foldel|\beph\b|potencialkiegyenlit/, ask: false },
  { topic: "megvalosulasi", label: "Megvalósulási dokumentáció", re: /megvalosulasi (terv|dokumentacio)/, ask: false },
];
const STOP = new Set(["elosztó", "szerint", "illetve", "valamint", "szükséges", "kell", "terv", "tervek", "kerül", "kerülnek", "rendszer", "épület", "meglévő", "megmaradó", "kiépítés", "helyiség"].map((w) => norm(w)));
const words = (s: string) => norm(s).split(" ").filter((w) => w.length >= 5 && !STOP.has(w) && !/^\d/.test(w));

function relatedRows(text: string, rows: BudgetRow[], max = 3) {
  const W = new Set(words(text)); if (!W.size) return [];
  return rows.map((r) => { const R = new Set(words(`${r.context ?? ""} ${r.name}`)); let hit = 0; for (const w of R) if (W.has(w)) hit++; return { r, s: R.size ? hit / Math.min(R.size, W.size) : 0, hit }; })
    .filter((x) => x.hit >= 2 && x.s >= 0.34).sort((a, b) => b.s - a.s).slice(0, max).map((x) => x.r);
}

function sentences(p: PlanPage): { text: string; page: number }[] {
  const heading = (t: string) => t.length < 90 && /\p{Lu}/u.test(t) && t === t.toUpperCase();
  const joined = pageLines(p).map((l) => (heading(l.text) ? "\u0000" : l.text)).join(" ").replace(/-\s+(?=\p{Ll})/gu, "");
  return joined.split(/\u0000/).flatMap((seg) => seg.trim().split(/(?<=[.!?;])\s+(?=[A-ZÁÉÍÓÖŐÚÜŰ„"(−–-])/u).map((t) => ({ text: clean(t), page: p.page }))).filter((s) => s.text.length >= 25 && s.text.length <= 600);
}

export function checkScope(input: {
  budget: { extract: BudgetExtract; fileName: string } | null; pages: PlanPage[]; ids: PageIdentity[]; drawings: DrawingEntry[]; cabinets: Cabinet[];
  clarifications: Clarification[]; fileNames: Map<string, string>;
}): Finding[] {
  const out: Finding[] = []; let n = 0;
  const add = (f: Omit<Finding, "id" | "status" | "source">) => { out.push({ ...f, id: `F${String(++n).padStart(3, "0")}`, status: "open", source: "rule" }); };
  const rows = input.budget ? input.budget.extract.rows.filter((r) => r.kind === "item" || r.kind === "zero_qty") : [];
  const bfile = input.budget?.fileName ?? "";
  const pageEv = (p: { fileId: string; page: number }, s: string, kind: Evidence["kind"] = "plan"): Evidence => ({ kind, fileId: p.fileId, fileName: input.fileNames.get(p.fileId) ?? null, page: p.page, snippet: snip(s) });
  const idOf = new Map(input.ids.map((i) => [`${i.fileId}:${i.page}`, i]));
  const descPages = input.pages.filter((p) => ["technical_description", "designer_statement", "cabinet_notes", "legend"].includes(idOf.get(`${p.fileId}:${p.page}`)?.docType.value ?? ""));
  const drawingPages = input.pages.filter((p) => !descPages.includes(p));
  const planText = fold(input.pages.map((p) => pageLines(p).map((l) => l.text).join("\n")).join("\n"));
  const budgetText = fold(rows.map((r) => `${r.context ?? ""} ${r.name}`).join("\n"));

  if (!input.budget) add({ category: "hiany", severity: "high", topic: "koltsegvetes", title: "Nincs kijelölt árazatlan költségvetés — tétel-összerendelés nem végezhető.", rows: [], evidence: [], question: null, impact: "Eltéréslista csak a tervek alapján, tételsorok nélkül." });
  if (!input.pages.length) add({ category: "hiany", severity: "high", topic: "terv", title: "Nincs olvasható tervdokumentáció a csomagban.", rows: [], evidence: [], question: "Kérjük a kiviteli tervdokumentációt (tervjegyzék, kapcsolási rajzok, műszaki leírás).", impact: "Műszaki ellenőrzés és szekrénykalkuláció nem végezhető." });

  // 1) Költségvetésben hivatkozott tervjel ↔ csomag
  const known = new Set(input.drawings.map((d) => d.drawingNo));
  for (const r of rows) {
    for (const m of `${r.name} ${r.context ?? ""}`.matchAll(/\b([A-ZÁÉ][A-Za-zÁ-ű]{0,4}[-_]?\d{1,3}(?:[._-]\d{1,3}){0,3})\s+(?:sz\.?\s*)?(?:terv|rajz|lap|tervlap)/g)) {
      const key = normDrawingNo(m[1]!);
      if (!known.has(key)) add({ category: "hiany", severity: "high", topic: "terv", title: `A költségvetés a(z) ${m[1]} tervre hivatkozik, de ez a terv nincs a feldolgozott csomagban.`, rows: [rowRef(r)], evidence: [rowEv(r, bfile)], question: `Kérjük a(z) ${m[1]} tervet (vagy annak érvényes revízióját).`, impact: "Az érintett tétel műszaki tartalma nem ellenőrizhető." });
    }
  }
  // 2) Szekrények: költségvetés ↔ rajz
  const cabIds = new Set(input.cabinets.filter((c) => c.status !== "no_drawing").map((c) => c.id));
  const budgetCabs = new Map<string, BudgetRow>();
  for (const r of rows) for (const m of fold(`${r.name}`).matchAll(/["„“”']?\b([a-z]{1,3}\d{0,2}(?:-\d{1,2})?)\b["„“”']?\s*(?:jelu\s+)?(?:(?:fo|al|foldszinti|emeleti|pinceszinti)\s*)?eloszto/g)) { const id = m[1]!.toUpperCase(); if (!/^(AZ|A|ES|UJ|FO|AL)$/.test(id) && !budgetCabs.has(id)) budgetCabs.set(id, r); }
  for (const [id, r] of budgetCabs) if (!cabIds.has(id)) add({ category: "hiany", severity: "high", topic: "szekreny", title: `A(z) ${id} elosztó szerepel a költségvetésben, de nincs hozzá kapcsolási/nézeti rajz.`, rows: [rowRef(r)], evidence: [rowEv(r, bfile)], question: `Kérjük a(z) ${id} elosztó kapcsolási rajzát és készülékjegyzékét.`, impact: "A szekrény ára nem számítható; bizonyítatlan teljes szekrényár nem készül." });
  if (input.budget) for (const c of input.cabinets) if (c.status !== "no_drawing" && !budgetCabs.has(c.id) && !new RegExp(`\\b${c.id.toLowerCase()}\\b`).test(budgetText))
    add({ category: "elteres", severity: "medium", topic: "szekreny", title: `A(z) ${c.id} elosztó a terven szerepel, a költségvetésben nem találtam külön tételként.`, rows: [], evidence: c.pages.slice(0, 1).map((p) => pageEv(p, c.title ?? c.id)), question: `A(z) ${c.id} elosztó gyártása/szállítása a kiírás része, vagy más tétel tartalmazza?`, impact: "Kimaradó vagy kétszer elszámolt szekrény." });
  for (const c of input.cabinets) for (const r of c.reconciliation.filter((x) => x.ok === false))
    add({ category: "elteres", severity: "medium", topic: "szekreny", title: `${c.id}: ${r.note}`, rows: budgetCabs.has(c.id) ? [rowRef(budgetCabs.get(c.id)!)] : [], evidence: c.pages.filter((p) => ["cabinet_view", "single_line"].includes(p.docType)).slice(0, 2).map((p) => pageEv(p, `${c.title ?? c.id} — ${p.docType === "cabinet_view" ? "nézeti rajz" : "kapcsolási rajz"}`)), question: null, impact: "Anyag- és szerelési költség eltérhet (kérdés a szekrény kérdéslistájában)." });
  for (const c of input.cabinets) if (budgetCabs.has(c.id) && /bekotve|beuzemel|kiprobal/.test(fold(budgetCabs.get(c.id)!.name)))
    add({ category: "feltetelezes", severity: "low", topic: "szekreny", title: `${c.id}: a költségvetési tétel a gyártást és a helyszíni bekötést/beüzemelést együtt tartalmazza.`, rows: [rowRef(budgetCabs.get(c.id)!)], evidence: [rowEv(budgetCabs.get(c.id)!, bfile)], question: null, impact: "A belső kalkulációban anyag, gyártás és helyszíni bekötés külön soron; a kiírásban egy tételként kerül árazásra — dupla elszámolás nincs." });

  // 3) Kábelek: rajz ↔ költségvetés
  const planCables = new Map<string, { type: string; cores: number; section: string; ev: Evidence; count: number }>();
  for (const p of drawingPages) for (const l of pageLines(p)) for (const k of cableKeys(l.text)) { const cur = planCables.get(k.key); if (cur) cur.count++; else planCables.set(k.key, { ...k, ev: pageEv(p, l.text), count: 1 }); }
  const budgetCables: { key: string; type: string | null; cores: number; section: string; row: BudgetRow }[] = [];
  const typeIn = (x: string) => x.match(/\b(NYY|NYM|NAYY|CYKY|YKY|NYCWY|N2XH|NHXH|H07RN-F|H05VV-F|MKH|YSLY)\b/i)?.[1]?.toUpperCase() ?? null;
  for (const r of rows) {
    const type = typeIn(r.name) ?? typeIn(r.context ?? "");
    for (const m of r.name.matchAll(/(?<![\d.,])(\d{1,2})\s*[x×]\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(mm2|mm²|²)?/g)) {
      if (!m[3] && !type) continue;
      const section = m[2]!.replace(",", ".");
      budgetCables.push({ key: type ? `${type} ${m[1]}x${section}` : `? ${m[1]}x${section}`, type, cores: Number(m[1]), section, row: r });
    }
  }
  for (const [key, pc] of planCables) {
    if (budgetCables.some((b) => b.key === key)) continue;
    const planHas = (b: { cores: number; section: string }) => [...planCables.values()].some((x) => x.cores === b.cores && x.section === b.section && x.type === pc.type);
    const sameCores = budgetCables.filter((b) => (b.type === pc.type || b.type == null) && b.cores === pc.cores && b.section !== pc.section && !planHas(b));
    const sameSection = budgetCables.filter((b) => b.cores === pc.cores && b.section === pc.section);
    if (sameSection.length) { if (sameSection.every((b) => b.type && b.type !== pc.type)) add({ category: "elteres", severity: "low", topic: "kabel", title: `Kábeltípus: a terven ${key}, a költségvetésben ${sameSection[0]!.key}.`, rows: sameSection.slice(0, 3).map((b) => rowRef(b.row)), evidence: [pc.ev, rowEv(sameSection[0]!.row, bfile)], question: `A ${pc.cores}×${pc.section} mm² kábel típusa ${pc.type} (terv) vagy ${sameSection[0]!.type} (kiírás)?`, impact: "Anyagár eltérhet." }); continue; }
    if (sameCores.length && input.budget) add({ category: "elteres", severity: "high", topic: "kabel", title: `Keresztmetszet-eltérés: a terven ${key}, a költségvetésben ${[...new Set(sameCores.map((b) => `${b.cores}×${b.section}`))].join(", ")} mm².`, rows: sameCores.slice(0, 4).map((b) => rowRef(b.row)), evidence: [pc.ev, rowEv(sameCores[0]!.row, bfile)], question: `Melyik az érvényes keresztmetszet: ${pc.cores}×${pc.section} mm² (terv) vagy ${sameCores[0]!.cores}×${sameCores[0]!.section} mm² (kiírás)?`, impact: "Kábel anyag- és szerelési költsége jelentősen eltérhet." });
    else if (input.budget) add({ category: "tisztazando", severity: "medium", topic: "kabel", title: `A terven szereplő ${key} kábelt (${pc.count} előfordulás) nem találtam a költségvetésben.`, rows: [], evidence: [pc.ev], question: `A ${key} kábel a kiírás része (melyik tételben)?`, impact: "Kimaradó tétel lehet — gépi keresés, nem bizonyított hiány." });
  }
  // 4) Lehatárolási mondatok a műszaki leírásból és az ellenőrzött e-mailes pontosításokból
  const scopeSources: { text: string; ev: Evidence }[] = [];
  for (const p of descPages) for (const s of sentences(p)) scopeSources.push({ text: s.text, ev: pageEv(p, s.text, "description") });
  for (const c of input.clarifications) for (const s of c.text.split(/(?<=[.!?;])\s+/).map(clean).filter((x) => x.length >= 20)) scopeSources.push({ text: s, ev: { kind: "email", ref: c.ref, snippet: snip(s), fileName: c.from ? `E-mail: ${c.from}${c.date ? `, ${c.date.slice(0, 10)}` : ""}` : "E-mail" } });
  const seen = new Set<string>();
  for (const src of scopeSources) {
    const f = fold(src.text);
    const rule = SCOPE_RULES.find((r) => r.re.test(f)); if (!rule) continue;
    const key = `${rule.cat}:${f.slice(0, 80)}`; if (seen.has(key)) continue; seen.add(key);
    const rel = relatedRows(src.text, rows);
    add({ category: rule.cat, severity: rule.cat === "kizaras" ? "medium" : "low", topic: rule.topic, title: snip(src.text, 200), rows: rel.map(rowRef), evidence: [src.ev, ...rel.slice(0, 2).map((r) => rowEv(r, bfile))],
      question: rule.cat === "tisztazando" ? `Kérjük pontosítani: „${snip(src.text, 140)}”` : rule.cat === "kizaras" && rel.length ? "A kizárt tartalom a felsorolt tételsorokat érinti? (gépi párosítás, ellenőrizendő)" : null,
      impact: rule.cat === "kizaras" ? "Ne kerüljön árazásra / lehatárolásba felveendő." : rule.cat === "feltetelezes" ? "Az ajánlat feltételeként rögzítendő." : "Ajánlati ár vagy tartalom változhat." });
  }
  // 5) P3 által jelölt lehetséges kizárások (szürke formázásból NEM állapítunk meg kizárást)
  for (const r of rows.filter((x) => x.flags.includes("possible_exclusion")).slice(0, 40))
    add({ category: "tisztazando", severity: "low", topic: "kizaras_jeloltek", title: `A tétel szövege opcióra/kizárásra utal: ${snip(r.name, 120)}`, rows: [rowRef(r)], evidence: [rowEv(r, bfile)], question: `„${snip(r.name, 70)}” (${r.key}) az ajánlat része — alap, opció vagy kizárt?`, impact: "Nem kap automatikus árat, amíg nem dől el." });
  // 6) Tipikus, gyakran kimaradó munkarészek
  for (const t of TYPICAL) {
    const inBudget = t.re.test(budgetText), inPlan = t.re.test(planText);
    if (inPlan && !inBudget && input.budget) add({ category: "hiany", severity: "medium", topic: t.topic, title: `${t.label}: a tervdokumentáció említi, a költségvetésben nem találtam tételt.`, rows: [], evidence: [], question: `${t.label} a kiírás része? Ha igen, melyik tételben?`, impact: "Kimaradó munkarész lehet." });
    else if (!inPlan && !inBudget && t.ask && input.budget) add({ category: "tisztazando", severity: "low", topic: t.topic, title: `${t.label}: sem a költségvetésben, sem a feldolgozott tervekben nem szerepel.`, rows: [], evidence: [], question: `${t.label} szükséges-e, és kinek a feladata?`, impact: "Ajánlati lehatárolásban rögzítendő." });
  }
  // 7) Tervjegyzék problémák (hiányzó lap, revízióütközés)
  for (const d of input.drawings) for (const i of d.issues.filter((x) => x.code !== "low_confidence"))
    add({ category: i.code === "missing_sheets" ? "hiany" : "tisztazando", severity: i.code === "missing_sheets" ? "high" : "medium", topic: "terv", title: `${d.drawingNo}: ${i.message}`, rows: [], evidence: i.evidence, question: i.code === "missing_sheets" ? `Kérjük a(z) ${d.drawingNo} terv hiányzó lapjait.` : `${d.drawingNo}: melyik revízió érvényes?`, impact: "Az érintett tervrész nem ellenőrizhető teljesen." });
  const sev = { high: 0, medium: 1, low: 2 } as const;
  return out.sort((a, b) => sev[a.severity] - sev[b.severity] || a.id.localeCompare(b.id));
}
