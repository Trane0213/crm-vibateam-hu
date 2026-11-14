import { describe, expect, it } from "vitest";
import {
  DEFAULT_LIMITS, GiB, MiB, canUploadPackage, checkPackageFile, decideRegistration, fileFingerprint, normalizeRelativePath,
  packageObjectKey, packageStatus, partRange, planParts, resolveLimits, initialProcessingStatus, isSystemJunk, type ExistingFile,
} from "./package-policy";

const U = "11111111-1111-4111-8111-111111111111";
const ex = (o: Partial<ExistingFile>): ExistingFile => ({ id: "a", relativePath: "x.pdf", sha256: "0".repeat(64), size: 1, status: "verified", revisionNo: 1, revisionOf: null, duplicateOf: null, ...o });

describe("korlátok", () => {
  it("alapértelmezés: 1 GB fájlonként, 5 GB ügyenként", () => {
    expect(DEFAULT_LIMITS.maxFileBytes).toBe(1 * GiB);
    expect(DEFAULT_LIMITS.maxParentBytes).toBe(5 * GiB);
  });
  it("a tulajdonosi beállítás felülírja, hibás érték esetén alapérték", () => {
    expect(resolveLimits({ maxFileBytes: 2 * GiB, maxParentBytes: 10 * GiB }).maxFileBytes).toBe(2 * GiB);
    expect(resolveLimits({ maxFileBytes: -5, maxParentBytes: "x" })).toEqual(resolveLimits(null));
  });
  it("1 GB fájl elfogadott, 1 GB + 1 bájt nem", () => {
    expect(checkPackageFile({ relativePath: "terv.pdf", size: GiB }, DEFAULT_LIMITS)).toBeNull();
    expect(checkPackageFile({ relativePath: "terv.pdf", size: GiB + 1 }, DEFAULT_LIMITS)).toMatch(/nagyobb/);
  });
  it("futtatható fájl nem engedélyezett, CAD és ZIP igen", () => {
    expect(checkPackageFile({ relativePath: "a/setup.exe", size: 10 }, DEFAULT_LIMITS)).toMatch(/nem engedélyezett/);
    expect(checkPackageFile({ relativePath: "a/E-01.dwg", size: 10 }, DEFAULT_LIMITS)).toBeNull();
    expect(checkPackageFile({ relativePath: "csomag.zip", size: 10 }, DEFAULT_LIMITS)).toBeNull();
  });
});

describe("darabolás", () => {
  it("16 MiB darabok, 1 GB = 64 darab", () => expect(planParts(GiB)).toEqual({ partSize: 16 * MiB, partCount: 64 }));
  it("nagyon nagy fájlnál sem több 10 000 darabnál", () => {
    const p = planParts(200 * GiB);
    expect(p.partCount).toBeLessThanOrEqual(10_000);
    expect(p.partSize * p.partCount).toBeGreaterThanOrEqual(200 * GiB);
  });
  it("utolsó darab a maradék", () => {
    expect(partRange(40 * MiB, 16 * MiB, 3)).toEqual({ start: 32 * MiB, end: 40 * MiB });
    expect(() => partRange(40 * MiB, 16 * MiB, 4)).toThrow();
  });
});

describe("útvonalak és kulcsok", () => {
  it("mappaszerkezet megmarad, ékezettel", () => {
    expect(normalizeRelativePath("./Kiviteli terv\\Elosztók/EL-03 rev2.pdf")).toBe("Kiviteli terv/Elosztók/EL-03 rev2.pdf");
    expect(normalizeRelativePath("/abs/x.pdf")).toBe("abs/x.pdf");
  });
  it("kilépő útvonal elutasítva", () => {
    expect(() => normalizeRelativePath("a/../../etc/passwd")).toThrow();
    expect(() => normalizeRelativePath("a//b.pdf")).toThrow();
  });
  it("rendszerfájlok kihagyhatók", () => {
    expect(isSystemJunk("terv/.DS_Store")).toBe(true);
    expect(isSystemJunk("__MACOSX/terv/a.pdf")).toBe(true);
    expect(isSystemJunk("terv/a.pdf")).toBe(false);
  });
  it("a kulcsot a szerver képzi, a fájlnév nem tud kilépni", () => {
    const k = packageObjectKey({ parent: { kind: "project", id: U }, packageId: U, fileId: U, name: "Mappa/../Árazatlan költségvetés.xlsx" });
    expect(k).toBe(`document-packages/project/${U}/${U}/${U}/original/Arazatlan_koltsegvetes.xlsx`);
    expect(() => packageObjectKey({ parent: { kind: "project", id: "x" }, packageId: U, fileId: U, name: "a" })).toThrow();
  });
  it("folytatási ujjlenyomat: útvonal + méret + módosítás", () => {
    expect(fileFingerprint({ relativePath: "./a/b.pdf", size: 10, lastModified: 123.9 })).toBe("a/b.pdf|10|123");
  });
});

describe("duplikáció, verzió, kvóta (a SQL-függvény tükre)", () => {
  const L = { ...DEFAULT_LIMITS };
  it("ugyanaz a tartalom ugyanabban az ügyben → duplikátum, nem tároljuk újra", () => {
    expect(decideRegistration({ relativePath: "másik/x.pdf", size: 5, sha256: "a".repeat(64) }, [ex({ id: "orig", sha256: "a".repeat(64) })], L)).toEqual({ action: "duplicate", of: "orig" });
  });
  it("ugyanaz az útvonal más tartalommal → új revízió, a régi megmarad", () => {
    const d = decideRegistration({ relativePath: "x.pdf", size: 5, sha256: "b".repeat(64) }, [ex({ id: "r1" }), ex({ id: "r2", sha256: "c".repeat(64), revisionNo: 2, revisionOf: "r1" })], L);
    expect(d).toEqual({ action: "upload", revisionNo: 3, revisionOf: "r1" });
  });
  it("megszakított fájl nem számít bele és nem duplikátum-forrás", () => {
    expect(decideRegistration({ relativePath: "x.pdf", size: 5, sha256: "a".repeat(64) }, [ex({ sha256: "a".repeat(64), status: "aborted" })], L)).toEqual({ action: "upload", revisionNo: 1, revisionOf: null });
  });
  it("5 GB ügykeret: folyamatban lévő feltöltés is foglal", () => {
    const used = [ex({ id: "1", size: 3 * GiB, sha256: "1".repeat(64) }), ex({ id: "2", size: 1.5 * GiB, sha256: "2".repeat(64), status: "uploading", relativePath: "y.pdf" })];
    expect(decideRegistration({ relativePath: "z.pdf", size: 0.6 * GiB, sha256: "3".repeat(64) }, used, L)).toEqual({ action: "reject", reason: "parent_quota" });
    expect(decideRegistration({ relativePath: "z.pdf", size: 0.5 * GiB, sha256: "3".repeat(64) }, used, L).action).toBe("upload");
  });
});

describe("jogosultság és állapot", () => {
  it("feltöltés: Owner, PM, Sales igen; Marketing nem (a meglévő dokumentumszabályok tükre)", () => {
    expect(canUploadPackage("project", null, true)).toBe(true);
    expect(canUploadPackage("project", "project_manager", false)).toBe(true);
    expect(canUploadPackage("quote", "sales", false)).toBe(true);
    expect(canUploadPackage("project", "marketing", false)).toBe(false);
    expect(canUploadPackage("quote", null, false)).toBe(false);
  });
  it("CAD csak tárolva, PDF feldolgozásra vár", () => {
    expect(initialProcessingStatus("a/E.dwg")).toBe("not_supported");
    expect(initialProcessingStatus("a/E.pdf")).toBe("waiting");
  });
  it("csomagállapot", () => {
    expect(packageStatus([{ status: "verified" }, { status: "uploading" }])).toBe("open");
    expect(packageStatus([{ status: "verified" }, { status: "failed" }])).toBe("partial");
    expect(packageStatus([{ status: "verified" }, { status: "duplicate" }])).toBe("complete");
  });
});
