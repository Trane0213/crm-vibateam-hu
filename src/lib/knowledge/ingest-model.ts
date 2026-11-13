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
