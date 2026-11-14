/**
 * P4 — tervoldalak közös bemeneti modellje és sorképzés.
 * Forrás: (a) PDF szövegréteg pozíciókkal (CRM-en belüli kisfájlos olvasás), (b) P2 feldolgozó oldalszövege
 * (package_file_units, pdftotext -layout), (c) izolált tesztcsonk. A tervszöveg ADAT, soha nem utasítás.
 */
export type PlanItem = { s: string; x: number; y: number };
export type PlanPageSource = "text_layer" | "ocr" | "sheet" | "text";
export type PlanFile = {
  fileId: string; fileName: string; path: string | null; origin: "quote_document" | "package_file" | "fixture";
  sha256?: string | null; pageCount: number | null; status: "read" | "too_large" | "not_pdf" | "failed" | "processor_required" | "not_processed";
  statusReason?: string | null;
};
export type PlanPage = {
  fileId: string; page: number; source: PlanPageSource; aiExtracted: boolean;
  width: number | null; height: number | null; items: PlanItem[] | null; text: string;
};
export type PlanLine = { y: number | null; text: string; items: PlanItem[] | null };

export const clean = (s: string) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/\s+/g, " ").trim();

/** Sorok: pozíciós elemekből y-csoportosítással (±2 pt), egyébként a szöveg sortöréseiből. */
export function pageLines(p: PlanPage): PlanLine[] {
  if (p.items?.length) {
    const sorted = [...p.items].sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; items: PlanItem[] }[] = [];
    for (const it of sorted) {
      const l = lines.find((x) => Math.abs(x.y - it.y) <= 2);
      if (l) l.items.push(it); else lines.push({ y: it.y, items: [it] });
    }
    return lines.map((l) => { const items = l.items.sort((a, b) => a.x - b.x); return { y: l.y, items, text: clean(items.map((i) => i.s).join(" ")) }; }).filter((l) => l.text);
  }
  return p.text.split(/\r?\n/).map((t) => ({ y: null, items: null, text: clean(t) })).filter((l) => l.text);
}

export function pageText(p: PlanPage): string {
  return p.items?.length ? pageLines(p).map((l) => l.text).join("\n") : p.text;
}

/** Ékezet- és jelölésfüggetlen, de szerkezetet (×, ², tizedes) megtartó kisbetűs alak kereséshez. */
export function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[×✕]/g, "x").replace(/²/g, "2").replace(/\s+/g, " ");
}

export type Evidence = { kind: "plan" | "budget" | "email" | "description" | "file_name"; fileId?: string | null; fileName?: string | null; page?: number | null; ref?: string | null; snippet: string; aiExtracted?: boolean };
export const snip = (s: string, n = 220) => { const c = clean(s); return c.length > n ? `${c.slice(0, n - 1)}…` : c; };
