/**
 * P5 — ügyfélnek szánt ajánlatcsomag összeállítása (tiszta, mellékhatás nélküli modell).
 * Bemenet: a P3 árazás és a P4 tervellenőrzés tényei + a MENTETT ajánlat adatai. Kimenet: tartalmi kapuk
 * (specifikáció 13. fejezet), lehatárolás (vállalt / nem vállalt / feltételes / kérdés), belső hiányjegyzék,
 * kísérőlevél-tervezet és összevethető pillanatkép (változatok/diff). Nem ír, nem küld, nem hagy jóvá.
 */
import type { LineStatus } from "@/lib/pricing/engine";
import type { FindingCategory } from "@/lib/plans/scope-check";

export type PackageMode = "subcontractor_labor" | "full_construction";
export const OPEN_LINE_STATUSES: readonly LineStatus[] = ["missing", "review", "blocked", "excluded_review"];
export const LINE_STATUS_HU: Record<LineStatus, string> = {
  priced: "Árazva", review: "Ellenőrizendő", missing: "Nincs forrás", blocked: "Hiányzó paraméter", zero_qty: "0 mennyiség",
  excluded: "Kizárva", excluded_review: "Lehetséges kizárás", existing_price: "Meglévő ár",
};

export type PkgLine = { key: string; sheet: string; row: number; name: string; section: string; status: LineStatus; lineTotalHuf: number | null; sourced: boolean };
export type PkgFinding = { id: string; category: FindingCategory; severity: "high" | "medium" | "low"; title: string; question: string | null; topic: string };
export type PkgCabinet = { id: string; status: "bom_complete" | "bom_partial" | "no_device_list" | "no_drawing"; mismatch: boolean; priceComplete: boolean; pricedHuf: number; blockReasons: string[] };
export type PkgFile = { fileName: string; full: boolean; label: string; reasons: string[] };
export type PricingFacts = {
  sourceFile: { name: string; sha256: string };
  totals: { netHuf: number; materialHuf: number; laborHuf: number; existingHuf: number; lines: number; byStatus: Record<LineStatus, number> };
  lines: PkgLine[]; blockers: string[];
  export: { status: "verified"; fileName: string; bytes: number; writtenCells: number } | { status: "blocked" | "not_requested"; reasons: string[] };
};
export type ReviewFacts = { findings: PkgFinding[]; questions: string[]; cabinets: PkgCabinet[]; files: PkgFile[]; allTextRead: boolean };
export type PackageQuote = {
  id: string; title: string | null; version: number | null; alternativeKey: string; kind: string | null; validUntil: string | null;
  technicalScope: string | null; exclusions: string | null; savedNetHuf: number | null; locked: boolean; contactName: string | null;
};
export type ComposeInput = {
  quote: PackageQuote; mode: PackageMode; asOf: string; budgetDocName: string | null; scopeFileName: string;
  pricing: PricingFacts | null; pricingError: string | null; review: ReviewFacts | null; reviewError: string | null;
};

export type ScopeItem = { text: string; ref: string | null };
export type ScopeSections = { included: ScopeItem[]; excluded: ScopeItem[]; conditional: ScopeItem[]; questions: ScopeItem[] };
export const SCOPE_SECTION_LABEL: Record<keyof ScopeSections, string> = { included: "Vállalt munkarészek", excluded: "Nem vállalt munkarészek", conditional: "Feltételek és fenntartások", questions: "Tisztázandó kérdések" };
export type Gate = { key: string; label: string; ok: boolean; blocking: boolean; hint?: string; needsAck?: boolean };
export type MissingItem = { kind: "line" | "file" | "cabinet" | "finding" | "export" | "pricing" | "review"; text: string; ref: string | null };
export type CoverLetter = { subject: string; body: string };
export type QuotePackageCore = {
  status: "ready" | "incomplete"; offerNetHuf: number | null; gates: Gate[]; scope: ScopeSections; missing: MissingItem[]; coverLetter: CoverLetter;
  internal: { materialHuf: number; laborHuf: number; existingHuf: number; byStatus: Record<string, number>; cabinets: { id: string; priceComplete: boolean; pricedHuf: number }[]; findings: Record<"high" | "medium" | "low", number> } | null;
};

const lines = (s: string | null | undefined, max = 20) => (s ?? "").split(/\r?\n/).map((x) => x.replace(/^[\s•\-–*]+/, "").trim()).filter((x) => x.length >= 3).slice(0, max);
const huf = (n: number) => `${new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 }).format(n)} Ft`;
const uniq = (a: ScopeItem[]) => { const seen = new Set<string>(); return a.filter((x) => { const k = x.text.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }); };

/** Ügyfélnek szánt szövegben tiltott belső fogalmak (önköltség, fedezet, forrás, norma, tartalék…). */
export const INTERNAL_TERMS = /(önköltség|beszerzési ár|fedezet|árrés|normaór|árforrás|ársablon|tartalék|VIBA_BELSO|belső kalkuláció|belső ellenőrz|egyezési pontszám|kv\s?11026)/i;
export function internalLeaks(text: string): string[] {
  const out = new Set<string>(); const re = new RegExp(INTERNAL_TERMS.source, "gi");
  for (const m of text.matchAll(re)) out.add(m[1]!.toLowerCase());
  return [...out];
}

/** Ajánlati nettó = árazott + (változatlanul hagyott) meglévő árak — az Excel teljes nettója. */
export const offerNet = (p: PricingFacts | null) => (p ? Math.round(p.totals.netHuf + p.totals.existingHuf) : null);

export function scopeSections(i: ComposeInput): ScopeSections {
  const s: ScopeSections = { included: [], excluded: [], conditional: [], questions: [] };
  const p = i.pricing, r = i.review;
  if (p && i.budgetDocName) {
    const priced = p.lines.filter((l) => l.status === "priced" || l.status === "existing_price");
    s.included.push({ text: `Az Önök által megküldött „${i.budgetDocName}” költségvetés tételei, a költségvetés eredeti szerkezetében és mennyiségeivel árazva (${priced.length} tételsor).`, ref: p.sourceFile.sha256.slice(0, 12) });
    s.included.push({ text: i.mode === "subcontractor_labor" ? "Az árazott tételek munkadíja (a tételek szerinti szerelés, bekötés, munkavégzés)." : "Az árazott tételek anyag- és munkadíja.", ref: i.mode });
    const bySection = new Map<string, { n: number; sheet: string }>();
    for (const l of priced) { const k = (l.section || l.sheet).trim(); const cur = bySection.get(k); if (cur) cur.n++; else bySection.set(k, { n: 1, sheet: l.sheet }); }
    for (const [k, v] of [...bySection].slice(0, 25)) s.included.push({ text: `${k}: ${v.n} tétel`, ref: v.sheet });
    if (i.mode === "subcontractor_labor") s.excluded.push({ text: "Anyagok beszerzése, szállítása és költsége (munkadíjas ajánlat).", ref: i.mode });
    const zero = p.lines.filter((l) => l.status === "zero_qty").length;
    if (zero) s.excluded.push({ text: `A költségvetés 0 mennyiségű sorai (${zero} db) nem részei az ajánlati árnak.`, ref: "zero_qty" });
    for (const l of p.lines.filter((x) => x.status === "excluded").slice(0, 40)) s.excluded.push({ text: l.name, ref: l.key });
  }
  for (const t of lines(i.quote.technicalScope)) s.included.push({ text: t, ref: "quotes.technical_scope" });
  for (const t of lines(i.quote.exclusions)) s.excluded.push({ text: t, ref: "quotes.exclusions" });
  s.conditional.push({ text: `Az ajánlat a megküldött költségvetés és tervdokumentáció ${i.asOf} napi állapota alapján készült; az ezektől eltérő vagy később módosuló műszaki tartalom külön egyeztetés és elszámolás tárgya.`, ref: "alap" });
  if (r) {
    const notFull = r.files.filter((f) => !f.full && f.fileName !== i.scopeFileName).map((f) => f.fileName);
    if (notFull.length) s.conditional.push({ text: `A következő megküldött dokumentumok tartalma nem volt teljes körűen ellenőrizhető, ezekre az ajánlat csak a költségvetés tételei szerint terjed ki: ${notFull.slice(0, 10).join(", ")}${notFull.length > 10 ? ` és további ${notFull.length - 10} fájl` : ""}.`, ref: "matrix" });
    for (const f of r.findings) {
      if (f.category === "kizaras") s.excluded.push({ text: `A műszaki leírás / egyeztetés szerint: „${f.title}”`, ref: f.id });
      else if (f.category === "feltetelezes" && f.topic !== "szekreny") s.conditional.push({ text: `„${f.title}”`, ref: f.id });
      else if (f.category === "elteres" && !f.question) s.conditional.push({ text: `${f.title} Az ajánlat a költségvetés (kiírás) szerinti tartalommal készült; eltérés esetén a tartalom és az ár egyeztetendő.`, ref: f.id });
    }
    for (const c of r.cabinets) {
      if (c.status === "no_drawing") s.conditional.push({ text: `A(z) ${c.id} elosztó műszaki tartalma a kapcsolási rajz és készülékjegyzék megküldéséig feltételes.`, ref: c.id });
      else if (c.mismatch || c.status !== "bom_complete") s.conditional.push({ text: `A(z) ${c.id} elosztó készülékszáma a tervlapok közötti eltérés tisztázásáig feltételes.`, ref: c.id });
    }
    for (const q of r.questions.slice(0, 60)) s.questions.push({ text: q, ref: null });
  }
  return { included: uniq(s.included), excluded: uniq(s.excluded), conditional: uniq(s.conditional), questions: uniq(s.questions) };
}

export function scopeText(title: string, s: ScopeSections): string {
  const parts = [title, ""];
  for (const k of Object.keys(SCOPE_SECTION_LABEL) as (keyof ScopeSections)[]) {
    parts.push(SCOPE_SECTION_LABEL[k]);
    parts.push(...(s[k].length ? s[k].map((x, n) => `${k === "questions" ? `${n + 1}.` : "–"} ${x.text}`) : ["– Nincs."]), "");
  }
  return parts.join("\n");
}

export function coverLetter(i: ComposeInput, s: ScopeSections, net: number | null, attachments: { priced: string | null; scope: string }): CoverLetter {
  const title = i.quote.title?.trim() || "VIBA-TEAM ajánlat";
  const files = [attachments.priced, attachments.scope].filter(Boolean).map((f) => `– ${f}`);
  const q = s.questions.slice(0, 15);
  const body = [
    `Tisztelt ${i.quote.contactName?.trim() || "Partnerünk"}!`, "",
    `Köszönjük megkeresésüket. Mellékelten küldjük a(z) „${title}” tárgyú ajánlatunkat ${i.mode === "subcontractor_labor" ? "munkadíjas (anyag nélküli)" : "anyag- és munkadíjas"} tartalommal, az Önök által megküldött költségvetés eredeti szerkezetében beárazva.`,
    ...(net != null && net > 0 ? ["", `Ajánlatunk nettó végösszege: ${huf(net)} + ÁFA.`] : []),
    ...(i.quote.validUntil ? [`Ajánlatunk érvényes: ${i.quote.validUntil}-ig.`] : []),
    "", "Mellékletek:", ...files, "",
    "A vállalt, nem vállalt és feltételes munkarészeket a mellékelt lehatárolási dokumentum tartalmazza.",
    ...(q.length ? ["", "Az ajánlat véglegesítéséhez kérjük az alábbi pontok tisztázását:", ...q.map((x, n) => `${n + 1}. ${x.text}`), ...(s.questions.length > q.length ? [`(További ${s.questions.length - q.length} kérdés a lehatárolási dokumentumban.)`] : [])] : []),
    "", "Kérdés esetén állunk rendelkezésükre.", "", "Üdvözlettel:", "VIBA-TEAM",
  ].join("\n");
  return { subject: `Ajánlat – ${title} (v${i.quote.version ?? 1}${i.quote.alternativeKey && i.quote.alternativeKey !== "A" ? ` / ${i.quote.alternativeKey}` : ""})`, body };
}

export function contentGates(i: ComposeInput, s: ScopeSections, letter: CoverLetter, customerText: string): Gate[] {
  const p = i.pricing, r = i.review;
  const open = p ? p.lines.filter((l) => OPEN_LINE_STATUSES.includes(l.status)) : [];
  const unsourced = p ? p.lines.filter((l) => l.status === "priced" && !l.sourced) : [];
  const high = r ? r.findings.filter((f) => f.severity === "high").length : 0;
  const leaks = internalLeaks(`${customerText}\n${letter.subject}\n${letter.body}`);
  const net = offerNet(p);
  return [
    { key: "not_locked", label: "Nem kiküldött (nem zárolt) ajánlatverzió", ok: !i.quote.locked, blocking: true, hint: "Kiküldött verzió nem módosítható — 1. lépés → Verziók → Új verzió." },
    { key: "budget", label: "Árazatlan költségvetés kijelölve", ok: !!i.budgetDocName, blocking: true, hint: "1. lépés: „Árazatlan költségvetés” típusú Excel feltöltése." },
    { key: "pricing", label: "Árazás lefutott (P3 motor)", ok: !!p && !i.pricingError, blocking: true, hint: i.pricingError ?? undefined },
    { key: "workbook", label: "Árazott Excel visszaellenőrizve (képletek, összegek, eredeti szerkezet)", ok: p?.export.status === "verified", blocking: true, hint: p && p.export.status !== "verified" ? p.export.reasons[0] : undefined },
    { key: "lines", label: "Minden tételsor árazott, 0 mennyiségű vagy kizárt", ok: !!p && open.length === 0, blocking: true, hint: open.length ? `${open.length} tételsor nyitott (nincs ár / ellenőrizendő) — 2. lépés árazás: ársablon, egyedi ár Timothy-val, vagy kérdés az ügyfélnek.` : undefined },
    { key: "sourced", label: "Minden kitöltött árnak van forrása vagy jelölt becslése", ok: !!p && unsourced.length === 0, blocking: true, hint: unsourced.length ? `${unsourced.length} árazott sor forrás nélkül.` : undefined },
    { key: "net", label: "Ismert, pozitív ajánlati nettó", ok: net != null && net > 0, blocking: true },
    { key: "no_internal", label: "Ügyfélnek szánt szövegben nincs belső kalkulációs adat", ok: leaks.length === 0, blocking: true, hint: leaks.length ? `Belső kifejezés: ${leaks.join(", ")}` : undefined },
    { key: "plans", label: "Tervellenőrzés lefutott (P4)", ok: !!r && !i.reviewError, blocking: false, hint: i.reviewError ?? "Tervek nélkül a lehatárolás csak a költségvetésre épül." },
    { key: "plans_read", label: "Minden terv szövege teljesen olvasható", ok: !!r && r.allTextRead, blocking: false, needsAck: !!r && !r.allTextRead, hint: "Részleges olvasás — a lehatárolásba fenntartásként bekerült; jóváhagyáskor tudomásul kell venni." },
    { key: "findings", label: "Nincs nyitott jelentős (magas) műszaki eltérés", ok: high === 0, blocking: false, needsAck: high > 0, hint: high ? `${high} jelentős eltérés — feltételként/kérdésként a lehatárolásba került; jóváhagyáskor tudomásul kell venni.` : undefined },
    { key: "existing", label: "Nincs megrendelő által előre kitöltött ár", ok: !p || p.totals.existingHuf === 0, blocking: false, hint: "A meglévő árak változatlanul a végösszeg részei — ellenőrizd." },
    { key: "questions", label: "Kérdéslista rendelkezésre áll", ok: true, blocking: false, hint: `${s.questions.length} kérdés.` },
  ];
}

export function missingList(i: ComposeInput): MissingItem[] {
  const out: MissingItem[] = [], p = i.pricing, r = i.review;
  if (i.pricingError) out.push({ kind: "pricing", text: `Árazás: ${i.pricingError}`, ref: null });
  if (i.reviewError) out.push({ kind: "review", text: `Tervellenőrzés: ${i.reviewError}`, ref: null });
  if (p) {
    if (p.export.status !== "verified") for (const x of p.export.reasons.slice(0, 10)) out.push({ kind: "export", text: x, ref: null });
    for (const l of p.lines.filter((x) => OPEN_LINE_STATUSES.includes(x.status)).slice(0, 200)) out.push({ kind: "line", text: `${l.sheet}!${l.row} ${l.name.slice(0, 120)} — ${LINE_STATUS_HU[l.status]}`, ref: l.key });
  }
  if (r) {
    for (const f of r.files.filter((x) => !x.full && x.fileName !== i.scopeFileName)) out.push({ kind: "file", text: `${f.fileName}: ${f.label}${f.reasons.length ? ` — ${f.reasons.slice(0, 2).join(" ")}` : ""}`, ref: null });
    for (const c of r.cabinets.filter((x) => !x.priceComplete)) out.push({ kind: "cabinet", text: `${c.id} elosztó: részösszeg, NEM teljes szekrényár — ${c.blockReasons.slice(0, 2).join(" ")}`, ref: c.id });
    for (const f of r.findings.filter((x) => x.severity === "high")) out.push({ kind: "finding", text: f.title, ref: f.id });
  }
  return out;
}

export function composePackage(i: ComposeInput): QuotePackageCore {
  const scope = scopeSections(i);
  const net = offerNet(i.pricing);
  const priced = i.pricing?.export.status === "verified" ? i.pricing.export.fileName : null;
  const letter = coverLetter(i, scope, net, { priced, scope: i.scopeFileName });
  const gates = contentGates(i, scope, letter, scopeText("", scope));
  const p = i.pricing, r = i.review;
  return {
    status: gates.every((g) => g.ok || !g.blocking) ? "ready" : "incomplete", offerNetHuf: net, gates, scope, missing: missingList(i), coverLetter: letter,
    internal: p ? { materialHuf: p.totals.materialHuf, laborHuf: p.totals.laborHuf, existingHuf: p.totals.existingHuf, byStatus: p.totals.byStatus,
      cabinets: (r?.cabinets ?? []).map((c) => ({ id: c.id, priceComplete: c.priceComplete, pricedHuf: c.pricedHuf })),
      findings: { high: r?.findings.filter((f) => f.severity === "high").length ?? 0, medium: r?.findings.filter((f) => f.severity === "medium").length ?? 0, low: r?.findings.filter((f) => f.severity === "low").length ?? 0 } } : null,
  };
}

/** Kanonikus (kulcs-rendezett) JSON az ujjlenyomathoz — ugyanaz a tartalom mindig ugyanazt adja. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v ?? null);
}

// ---------- Összekötés és jóváhagyás-előkészítés (kliens és szerver közös szabály) ----------
export type Linkage = { pricedDocIds: string[]; scopeDocIds: string[]; savedNetHuf: number | null };
export function linkageGates(core: Pick<QuotePackageCore, "offerNetHuf">, l: Linkage): Gate[] {
  return [
    { key: "priced_saved", label: "Az árazott Excel ennél az ajánlatnál „Árazott Excel-költségvetés” dokumentumként mentve", ok: l.pricedDocIds.length > 0, blocking: true, hint: "„Fájlok mentése az ajánlathoz” — a meglévő feltöltési úton." },
    { key: "scope_saved", label: "A lehatárolási dokumentum „Műszaki lehatárolás” dokumentumként mentve", ok: l.scopeDocIds.length > 0, blocking: true, hint: "„Fájlok mentése az ajánlathoz”." },
    { key: "crm_net", label: "A CRM-ben mentett nettó összeg egyezik a csomag nettójával", ok: core.offerNetHuf != null && l.savedNetHuf != null && Math.round(l.savedNetHuf) === core.offerNetHuf, blocking: true, hint: "„Nettó átvétele és mentése”." },
  ];
}
export type ApprovalAck = "excel_reviewed" | "scope_reviewed" | "findings_ack" | "partial_plans_ack";
export const ACK_LABEL: Record<ApprovalAck, string> = {
  excel_reviewed: "Átnéztem az árazott Excelt (összegek, mennyiségek, eredeti szerkezet).",
  scope_reviewed: "Átnéztem a lehatárolást, a kérdéslistát és a kísérőlevelet.",
  findings_ack: "A jelentős műszaki eltéréseket tudomásul vettem; feltételként/kérdésként szerepelnek.",
  partial_plans_ack: "Tudomásul vettem, hogy nem minden terv volt teljesen olvasható.",
};
export function requiredAcks(gates: Gate[]): ApprovalAck[] {
  const out: ApprovalAck[] = ["excel_reviewed", "scope_reviewed"];
  if (gates.some((g) => g.key === "findings" && g.needsAck)) out.push("findings_ack");
  if (gates.some((g) => g.key === "plans_read" && g.needsAck)) out.push("partial_plans_ack");
  return out;
}
export const APPROVAL_ROLES = ["owner", "tulajdonos", "admin", "superadmin", "sales"] as const;
export type ApprovalPrep = { fingerprint: string; role: string; by: string | null; at: string; acks: ApprovalAck[]; persisted: false };
/** Belső jóváhagyás-előkészítés: csak Owner/Sales, minden blokkoló kapu rendben, minden kötelező nyugtázás megvan. */
export function prepareApproval(a: { role: string | null; by: string | null; fingerprint: string; gates: Gate[]; acks: ApprovalAck[]; now?: Date }): { ok: true; prep: ApprovalPrep } | { ok: false; reason: string } {
  if (!a.role || !(APPROVAL_ROLES as readonly string[]).includes(a.role.toLowerCase())) return { ok: false, reason: "Ajánlattartalmat csak Tulajdonos vagy Sales hagyhat jóvá." };
  const bad = a.gates.filter((g) => g.blocking && !g.ok);
  if (bad.length) return { ok: false, reason: `Nyitott kötelező feltétel: ${bad.map((g) => g.label).join("; ")}` };
  const missing = requiredAcks(a.gates).filter((k) => !a.acks.includes(k));
  if (missing.length) return { ok: false, reason: `Hiányzó nyugtázás: ${missing.map((k) => ACK_LABEL[k]).join(" ")}` };
  if (!/^[a-f0-9]{64}$/.test(a.fingerprint)) return { ok: false, reason: "Érvénytelen csomag-ujjlenyomat." };
  return { ok: true, prep: { fingerprint: a.fingerprint, role: a.role.toLowerCase(), by: a.by, at: (a.now ?? new Date()).toISOString(), acks: [...a.acks], persisted: false } };
}
/** Kiküldésre átadható, ha a jóváhagyás-előkészítés UGYANARRA a csomag-ujjlenyomatra és összekötésre szól. */
export function handoffAllowed(fingerprint: string, approval: ApprovalPrep | null, linkage: Gate[]): { ok: boolean; reason: string | null } {
  if (!approval) return { ok: false, reason: "Előbb a belső jóváhagyás-előkészítés." };
  if (approval.fingerprint !== fingerprint) return { ok: false, reason: "A csomag tartalma a jóváhagyás óta megváltozott — új jóváhagyás szükséges." };
  const bad = linkage.filter((g) => g.blocking && !g.ok);
  return bad.length ? { ok: false, reason: bad.map((g) => g.label).join("; ") } : { ok: true, reason: null };
}

// ---------- Változatok / diff ----------
export type PackageSnapshot = { fingerprint: string; offerNetHuf: number | null; lines: Pick<PkgLine, "key" | "name" | "status" | "lineTotalHuf">[]; scope: ScopeSections; gates: Pick<Gate, "key" | "label" | "ok">[] };
export type PackageDiff = { same: boolean; netDeltaHuf: number | null; changedLines: { key: string; name: string; before: string; after: string }[]; scopeAdded: { section: keyof ScopeSections; text: string }[]; scopeRemoved: { section: keyof ScopeSections; text: string }[]; gateChanges: { key: string; label: string; before: boolean; after: boolean }[] };
const lineSig = (l: PackageSnapshot["lines"][number]) => `${LINE_STATUS_HU[l.status]}${l.lineTotalHuf != null ? ` · ${huf(l.lineTotalHuf)}` : ""}`;
export function diffPackages(a: PackageSnapshot, b: PackageSnapshot): PackageDiff {
  const A = new Map(a.lines.map((l) => [l.key, l])), changed: PackageDiff["changedLines"] = [];
  for (const l of b.lines) { const o = A.get(l.key); if (!o) changed.push({ key: l.key, name: l.name, before: "—", after: lineSig(l) }); else if (o.status !== l.status || o.lineTotalHuf !== l.lineTotalHuf) changed.push({ key: l.key, name: l.name, before: lineSig(o), after: lineSig(l) }); }
  const B = new Set(b.lines.map((l) => l.key)); for (const l of a.lines) if (!B.has(l.key)) changed.push({ key: l.key, name: l.name, before: lineSig(l), after: "—" });
  const added: PackageDiff["scopeAdded"] = [], removed: PackageDiff["scopeRemoved"] = [];
  for (const k of Object.keys(SCOPE_SECTION_LABEL) as (keyof ScopeSections)[]) {
    const x = new Set(a.scope[k].map((i) => i.text)), y = new Set(b.scope[k].map((i) => i.text));
    for (const t of y) if (!x.has(t)) added.push({ section: k, text: t });
    for (const t of x) if (!y.has(t)) removed.push({ section: k, text: t });
  }
  const G = new Map(a.gates.map((g) => [g.key, g.ok])), gateChanges = b.gates.filter((g) => G.has(g.key) && G.get(g.key) !== g.ok).map((g) => ({ key: g.key, label: g.label, before: G.get(g.key)!, after: g.ok }));
  const netDeltaHuf = a.offerNetHuf != null && b.offerNetHuf != null ? b.offerNetHuf - a.offerNetHuf : null;
  return { same: a.fingerprint === b.fingerprint, netDeltaHuf, changedLines: changed.slice(0, 300), scopeAdded: added, scopeRemoved: removed, gateChanges };
}

/** Mentett ajánlatverziók összevetése (előző verzió ↔ mostani) a meglévő mezők és dokumentumok alapján. */
export type SavedVersion = { version: number | null; netHuf: number | null; technicalScope: string | null; exclusions: string | null; validUntil: string | null; notes: string | null; status: string | null; docs: { name: string; documentType: string }[] };
export function versionDiff(prev: SavedVersion, cur: SavedVersion) {
  const f = (label: string, a: unknown, b: unknown) => ((a ?? "") === (b ?? "") ? null : { label, before: a == null || a === "" ? "—" : String(a), after: b == null || b === "" ? "—" : String(b) });
  const fields = [f("Nettó összeg", prev.netHuf == null ? null : huf(prev.netHuf), cur.netHuf == null ? null : huf(cur.netHuf)), f("Műszaki lehatárolás", prev.technicalScope?.trim(), cur.technicalScope?.trim()),
    f("Kizárások", prev.exclusions?.trim(), cur.exclusions?.trim()), f("Érvényesség", prev.validUntil, cur.validUntil), f("Megjegyzés", prev.notes?.trim(), cur.notes?.trim()), f("Állapot", prev.status, cur.status)].filter((x): x is NonNullable<typeof x> => !!x);
  const key = (d: { name: string; documentType: string }) => `${d.documentType}|${d.name}`;
  const P = new Set(prev.docs.map(key)), C = new Set(cur.docs.map(key));
  const docsAdded = cur.docs.filter((d) => !P.has(key(d))), docsRemoved = prev.docs.filter((d) => !C.has(key(d)));
  return { fields, docsAdded, docsRemoved, same: !fields.length && !docsAdded.length && !docsRemoved.length };
}
