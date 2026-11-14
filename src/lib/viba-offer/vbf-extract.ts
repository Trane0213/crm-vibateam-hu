/**
 * P6 — VBF-jegyzőkönyv / szöveges feladatlista hibapontjainak determinisztikus kinyerése.
 * Nem AI-találgatás: számozott sorok + szakmai kulcsszavak; minden ponthoz sorszám-bizonyíték és a besorolás oka.
 * A sürgősségi besorolás javaslat (kulcsszó alapján), a felhasználó módosíthatja; ismeretlen esetben "unknown".
 * A szöveg megbízhatatlan bemenet: csak adatként kezeljük, utasításként soha.
 */
import type { Defect, Priority } from "./calc-model";

export const VBF_LIMITS = { chars: 200_000, defects: 200, text: 400 };

const DEFECT_WORDS = /(hiány|hibás|nem megfelel|nincs|nincsen|sérült|törött|cserél|javít|pótl|pótol|érintésvéd|hibavéd|földel|EPH|védővezet|szigetel|megszakító|áramvédő|FI[- ]relé|ÁVK|burkolat|kötés|vezeték|kábel|lámpatest|dugalj|kapcsoló|jelölés|feliratoz|elosztó|szekrény|túlmelegedé|kiolvad|laza|szabálytalan|MSZ\s?HD|MSZ\s?EN|60364)/i;
const URGENT = /(azonnal|haladéktalan|sürgős|életveszély|áramütés|közvetlen veszély|balesetveszély|tűzveszély|üzemen kívül|nem üzemeltethető|feszültség alatt álló.*(szabad|érinthető))/i;
const SCHEDULED = /(ütemezhető|következő (időszakos )?felülvizsgálatig|tervezett karbantartás|javasolt|ajánlott|esztétikai|dokumentáció pótlása|határidő:?\s*\d+\s*(hónap|év))/i;
const ITEM = /^\s*(?:(\d{1,3}(?:\.\d{1,3}){0,2})[.)]?|[-•–*])\s+(.{3,})$/;

export type ExtractedDefect = Defect & { lines: [number, number]; priorityReason: string | null; standards: string[] };
export type VbfExtract = { defects: ExtractedDefect[]; scannedLines: number; truncated: boolean; notes: string[] };

function classify(t: string): { p: Priority; why: string | null } {
  const u = t.match(URGENT), s = t.match(SCHEDULED);
  if (u) return { p: "urgent", why: `„${u[1]}”` };
  if (s) return { p: "scheduled", why: `„${s[1]}”` };
  return { p: "unknown", why: null };
}

export function extractVbfDefects(raw: string): VbfExtract {
  const notes: string[] = [];
  const truncated = raw.length > VBF_LIMITS.chars;
  const text = (truncated ? raw.slice(0, VBF_LIMITS.chars) : raw).replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const out: ExtractedDefect[] = [];
  const seen = new Set<string>();
  let cur: { ref: string; start: number; end: number; parts: string[] } | null = null;
  let bullet = 0;
  const flush = () => {
    if (!cur) return;
    const body = cur.parts.join(" ").replace(/\s+/g, " ").trim();
    cur = cur && body && DEFECT_WORDS.test(body) ? cur : null;
    if (cur) {
      const key = body.toLowerCase();
      if (!seen.has(key) && out.length < VBF_LIMITS.defects) {
        seen.add(key);
        const c = classify(body);
        out.push({ id: `d${out.length + 1}`, ref: cur.ref, text: body.slice(0, VBF_LIMITS.text), priority: c.p, priorityReason: c.why,
          evidence: `${cur.start === cur.end ? `${cur.start}.` : `${cur.start}–${cur.end}.`} sor`, lines: [cur.start, cur.end],
          standards: [...new Set([...body.matchAll(/MSZ\s?(?:HD|EN)?\s?[\d-]+(?:[-:]\d+)*/gi)].map((m) => m[0].replace(/\s+/g, " ")))] });
      }
    }
    cur = null;
  };
  lines.forEach((line, i) => {
    const n = i + 1, m = line.match(ITEM);
    if (m) { flush(); cur = { ref: m[1] ?? `•${++bullet}`, start: n, end: n, parts: [m[2]!] }; return; }
    if (!line.trim()) { flush(); return; }
    if (cur && cur.parts.join(" ").length < VBF_LIMITS.text * 2) { cur.parts.push(line.trim()); cur.end = n; }
  });
  flush();
  if (truncated) notes.push(`A szöveg első ${VBF_LIMITS.chars.toLocaleString("hu-HU")} karaktere került feldolgozásra.`);
  if (out.length >= VBF_LIMITS.defects) notes.push(`Legfeljebb ${VBF_LIMITS.defects} hibapontot dolgozunk fel egyszerre.`);
  if (!out.length) notes.push("Nem találtam számozott vagy felsorolt hibapontot — a hibapontokat kézzel kell rögzíteni, vagy a jegyzőkönyv szövegrétege hiányzik (szkennelt PDF).");
  notes.push("A sürgősség kulcsszó alapú javaslat; ellenőrizd, a végleges műszaki megoldást felmérés nélkül nem tekintjük bizonyítottnak.");
  return { defects: out, scannedLines: lines.length, truncated, notes };
}
