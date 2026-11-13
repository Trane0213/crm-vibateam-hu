import { describe, expect, it } from "vitest";
import { cleanText, finalStatus, planIngest } from "./ingest-model";

describe("document ingestion rules", () => {
  it("never downloads unsupported types such as images", () => {
    expect(planIngest("kep.png", 1000)).toMatchObject({ action: "skip", status: "unsupported" });
  });
  it("flags files above 5 MB for review instead of reading them", () => {
    expect(planIngest("terv.pdf", 5 * 1024 * 1024 + 1)).toMatchObject({ action: "skip", status: "needs_review", code: "too_large_ocr_pending" });
  });
  it("extracts supported PDF, DOCX and XLSX within the limit", () => {
    for (const n of ["a.pdf", "b.DOCX", "c.xlsx"]) expect(planIngest(n, 1000)).toEqual({ action: "extract" });
  });
  it("marks a scanned document without text layer as needs review", () => {
    expect(finalStatus([{ status: "missing", text: null }], false).status).toBe("needs_review");
  });
  it("marks a document with some empty pages as partial, not processed", () => {
    expect(finalStatus([{ status: "cached", text: "szöveg" }, { status: "missing", text: null }], false).status).toBe("partial");
  });
  it("withholds content that looks like a password or key", () => {
    expect(finalStatus([{ status: "sensitive_withheld", text: null }], false)).toMatchObject({ status: "needs_review", code: "sensitive_withheld" });
  });
  it("only a complete extraction counts as processed", () => {
    expect(finalStatus([{ status: "cached", text: "teljes" }], false).status).toBe("processed");
    expect(finalStatus([{ status: "cached", text: "teljes" }], true).status).toBe("partial");
  });
  it("removes NUL characters that the database cannot store", () => {
    expect(cleanText("a\u0000b")).toBe("a b");
  });
});
