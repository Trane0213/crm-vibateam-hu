/** AI OS 2.0 document ingestion rules (pure). Extraction/indexing only — never an LLM call. */
export const INGEST_LIMITS = { batch: 5, maxUnits: 60, maxChars: 240_000, bytes: 5 * 1024 * 1024 } as const;
export const SUPPORTED_EXT = ["pdf", "docx", "xlsx", "txt", "csv"] as const;
export type IngestStatus = "processed" | "partial" | "needs_review" | "unsupported" | "error";

export const STATUS_LABEL: Record<IngestStatus | "pending", string> = {
  pending: "Sorban áll", processed: "Feldolgozva", partial: "Részlegesen feldolgozva",
  needs_review: "Ellenőrzést igényel", unsupported: "Nem támogatott", error: "Hibás",
};

export function extOf(name: string | null | undefined) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(name ?? ""));
  return m ? m[1].toLowerCase() : "";
}

/** Decide before download: unsupported types and oversize files never get downloaded. */
export function planIngest(name: string | null, sizeBytes: number | null): { action: "extract" } | { action: "skip"; status: IngestStatus; code: string; limitation: string } {
  const ext = extOf(name);
  if (!(SUPPORTED_EXT as readonly string[]).includes(ext)) {
    return { action: "skip", status: "unsupported", code: "unsupported_type", limitation: `A(z) .${ext || "?"} fájltípus szövege nem kinyerhető (támogatott: PDF, DOCX, XLSX, TXT, CSV); képek/szkennelt fájlok OCR-t igényelnek.` };
  }
  if (Number(sizeBytes ?? 0) > INGEST_LIMITS.bytes) {
    return { action: "skip", status: "needs_review", code: "too_large_ocr_pending", limitation: "5 MB feletti fájl: nagyfeldolgozás / OCR szükséges, külső OCR jóváhagyásra vár. Tartalom nem lett olvasva." };
  }
  return { action: "extract" };
}

export function documentTypeOf(name: string | null, sourceType: string | null) {
  if (sourceType) return sourceType;
  const ext = extOf(name);
  return ext === "xlsx" || ext === "csv" ? "spreadsheet" : ext === "pdf" ? "pdf" : ext === "docx" ? "word" : ext || "unknown";
}

export type UnitResult = { status: string; text: string | null };

/** Final status: only a complete text extraction is "processed"; anything withheld, truncated or empty is flagged. */
export function finalStatus(units: UnitResult[], truncated: boolean): { status: IngestStatus; code: string | null; limitations: string[] } {
  const limitations: string[] = [];
  if (units.some((u) => u.status === "sensitive_withheld")) {
    return { status: "needs_review", code: "sensitive_withheld", limitations: ["Hozzáférési adat / jelszó gyanúja miatt a tartalom nem került a tudásbázisba."] };
  }
  const withText = units.filter((u) => (u.text ?? "").trim().length > 0);
  if (!withText.length) return { status: "needs_review", code: "no_text_layer", limitations: ["Nincs kinyerhető szöveg (valószínűleg szkennelt/képes dokumentum) — OCR szükséges."] };
  const empty = units.length - withText.length;
  if (empty > 0) limitations.push(`${empty} egység (oldal/munkalap) szöveg nélkül — szkennelt vagy képes tartalom nem ellenőrzött.`);
  if (truncated) limitations.push("Méret-/oldalkorlát miatt nem a teljes dokumentum indexelt.");
  return { status: truncated || empty > 0 ? "partial" : "processed", code: null, limitations };
}

/** Postgres jsonb rejects NUL and lone surrogates: normalize extracted text before storing. */
export function cleanText(text: string) {
  const wf = typeof (text as { toWellFormed?: () => string }).toWellFormed === "function" ? (text as unknown as { toWellFormed: () => string }).toWellFormed() : text;
  return wf.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
}

/** AI OS 2.0/7 — felhasználóbarát magyarázat a feldolgozási hibakódokhoz (dokumentumlistákban). */
export const INGEST_ERROR_HELP: Record<string, string> = {
  unsupported_type: "Ennek a fájltípusnak a szövegét az AI nem tudja kiolvasni (támogatott: PDF, DOCX, XLSX, TXT, CSV). A fájl letölthető marad.",
  too_large_ocr_pending: "5 MB feletti fájl: a tartalma még nincs beolvasva, nagyfeldolgozásra vár. Az AI addig nem hivatkozhat rá.",
  no_text_layer: "Szkennelt vagy képes dokumentum, nincs kiolvasható szöveg. Szövegfelismerés (OCR) kell hozzá.",
  large_document: "Nagyon hosszú dokumentum: csak egy része került feldolgozásra, ellenőrzést igényel.",
  sensitive_withheld: "Jelszó vagy hozzáférési adat gyanúja miatt a tartalom nem került az AI tudásbázisába.",
  corrupt_or_unreadable: "A fájl sérült vagy nem nyitható meg. Töltsd fel újra egy ép példányt.",
  external_or_invalid_key: "A fájl nem a CRM tárhelyén van, ezért nem olvasható be.",
};

export type ProcessingView = { label: string; tone: "ok" | "info" | "warning" | "error"; help: string };
/** Egy dokumentum AI-feldolgozási állapota a felhasználó nyelvén. */
export function processingView(status: string | null | undefined, code: string | null | undefined): ProcessingView {
  const help = (code && INGEST_ERROR_HELP[code]) || "";
  switch (status) {
    case "processed": return { label: "AI számára olvasható", tone: "ok", help: "A dokumentum szövege bekerült a közös tudásbázisba." };
    case "partial": return { label: "Részben olvasható", tone: "info", help: help || "A dokumentum egy része (pl. képes oldalak) nem olvasható; az AI csak a kiolvasott részre támaszkodhat." };
    case "needs_review": return { label: "Ellenőrzést igényel", tone: "warning", help: help || "A feldolgozás nem volt teljes, kézi ellenőrzés szükséges." };
    case "unsupported": return { label: "AI nem olvassa", tone: "info", help: help || INGEST_ERROR_HELP.unsupported_type };
    case "error": return { label: "Feldolgozási hiba", tone: "error", help: help || "A feldolgozás nem sikerült; a tulajdonos újraindíthatja." };
    default: return { label: "Feldolgozásra vár", tone: "info", help: "A dokumentum még nincs beolvasva; a tulajdonos indítja a feldolgozást." };
  }
}
