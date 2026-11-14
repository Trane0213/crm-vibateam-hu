import { describe, expect, it } from "vitest";
import { packageOverview, readPackageFile, searchPackage } from "./package-tools.server";

function fakeSb(tables: Record<string, any>) {
  const calls: { table: string; ops: [string, ...any[]][] }[] = [];
  const sb: any = { from(table: string) {
    const rec = { table, ops: [] as [string, ...any[]][] }; calls.push(rec);
    const q: any = new Proxy({}, { get(_t, op: string) {
      if (op === "then") return (res: any) => res(typeof tables[table] === "function" ? tables[table](rec) : { data: tables[table] ?? [], count: (tables[table] ?? []).length });
      if (op === "maybeSingle") return async () => ({ data: (Array.isArray(tables[table]) ? tables[table][0] : tables[table]) ?? null });
      return (...a: any[]) => { rec.ops.push([op, ...a]); return q; };
    } });
    return q;
  } };
  return { sb, calls };
}

describe("tervcsomag AI-eszközök (csak olvasás)", () => {
  it("projekt vagy ajánlat azonosító nélkül nem olvas", async () => {
    await expect(packageOverview(fakeSb({}).sb, {})).rejects.toThrow();
    await expect(packageOverview(fakeSb({}).sb, { project_id: "nem-uuid" })).rejects.toThrow();
  });

  it("nem látható fájl: hiba, tartalom nélkül", async () => {
    await expect(readPackageFile(fakeSb({ package_files: [] }).sb, { file_id: "00000000-0000-4000-8000-000000000001" })).rejects.toThrow("not_visible");
  });

  it("fájlolvasás: forrás, oldal, AI-kiolvasás jelölése és lapozás", async () => {
    const { sb } = fakeSb({
      package_files: [{ id: "f1", package_id: "p1", relative_path: "Terv/A-101.pdf", sha256: "a".repeat(64), status: "verified", extracted_from: null }],
      package_file_extracts: [{ status: "partial", parser: "pdf", problems: [{ code: "ocr_budget", page: 3 }], summary: {} }],
      package_file_units: () => ({ data: [{ unit_kind: "page", unit_no: 1, label: "1. oldal", source: "text_layer", text: "A-101 alaprajz", chars: 14, ai_extracted: false }, { unit_kind: "page", unit_no: 2, label: "2. oldal (AI-kiolvasás)", source: "ocr", text: "SZ-01", chars: 5, ai_extracted: true }], count: 3 }),
    });
    const r = await readPackageFile(sb, { file_id: "00000000-0000-4000-8000-000000000001", max_units: 2 });
    expect(r.source.path).toBe("Terv/A-101.pdf");
    expect(r.units[1].ai_extracted).toBe(true);
    expect(r.next_unit_from).toBe(3);
    expect(r.completeness.full_document).toBe(false);
    expect((r.processing as any).problems[0].text).toMatch(/kerete elfogyott/);
  });

  it("keresés: a speciális karakterek nem válnak helyettesítő jellé, és csak az adott csomagban keres", async () => {
    const { sb, calls } = fakeSb({ package_file_units: [] });
    await searchPackage(sb, { package_id: "00000000-0000-4000-8000-000000000002", query: "100%_" });
    const ops = calls[0].ops;
    expect(ops.find((o) => o[0] === "ilike")?.[2]).toBe("%100\\%\\_%");
    expect(ops.find((o) => o[0] === "eq")).toEqual(["eq", "package_files.package_id", "00000000-0000-4000-8000-000000000002"]);
    await expect(searchPackage(sb, { package_id: "00000000-0000-4000-8000-000000000002", query: "x" })).rejects.toThrow();
  });
});
