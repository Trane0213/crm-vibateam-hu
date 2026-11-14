import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  canDeleteDoc, canUploadDoc, categoryCounts, classifyOpenError, docCategoryLabel, docParentLink, docParentState,
  documentLibraryHints, documentSourcesForRole, filterDocs, formatBytes, mergeDocs, normalizeDoc, openFailure, searchKey, sourceCounts,
} from "./document-access";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";

const P = "11111111-1111-4111-8111-111111111111";
const C = "22222222-2222-4222-8222-222222222222";
const Q = "33333333-3333-4333-8333-333333333333";
const ME = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const can = (role: RoleSlug) => (p: string) => canAccessRoute(role, p);

const pdoc = (over: Record<string, unknown> = {}) => normalizeDoc("project_documents", { id: "p1", name: "Alaprajz.pdf", file_url: "k/p1", document_type: "plan", created_at: "2026-11-10T10:00:00Z", project_id: P, uploaded_by: ME, ...over } as any, "Társasház felújítás");
const cdoc = (over: Record<string, unknown> = {}) => normalizeDoc("company_documents", { id: "c1", name: "Céginfó.pdf", file_url: "k/c1", document_type: "marketing", created_at: "2026-11-09T10:00:00Z", company_id: C, uploaded_by: ME, ...over } as any, "TESZT Kft.");
const qdoc = (over: Record<string, unknown> = {}) => normalizeDoc("quote_documents", { id: "q1", name: "Szerződési feltételek.pdf", file_url: "k/q1", document_type: "contract_terms", created_at: "2026-11-11T10:00:00Z", quote_id: Q, uploaded_by: ME, ...over } as any, "Ajánlat v2");

describe("normalizeDoc", () => {
  it("egységes alakra hozza a három forrást, a szülőmező forrásonként más", () => {
    expect(pdoc()).toMatchObject({ uid: "project_documents:p1", parentId: P, categoryLabel: "Tervrajz", fileKey: "k/p1" });
    expect(cdoc()).toMatchObject({ uid: "company_documents:c1", parentId: C, categoryLabel: "Marketing anyag" });
    expect(qdoc()).toMatchObject({ uid: "quote_documents:q1", parentId: Q, categoryLabel: "Szerződési / fizetési feltételek" });
  });
  it("hiányzó név, fájlkulcs és ismeretlen kategória nem lesz kitalált adat", () => {
    const d = pdoc({ name: "  ", file_url: "", document_type: "valami" });
    expect(d.name).toBe("Névtelen fájl");
    expect(d.nameMissing).toBe(true);
    expect(d.fileKey).toBeNull();
    expect(d.categoryLabel).toBe("Egyéb");
    expect(docCategoryLabel(null)).toBe("Egyéb");
  });
  it("projekt nélküli fájl NINCS ÖSSZEKÖTVE állapotú", () => {
    expect(docParentState(pdoc({ project_id: null }))).toBe("not_linked");
    expect(docParentState(pdoc())).toBe("linked");
  });
});

describe("mergeDocs — deduplikáció jelöléssel, összevonás nélkül", () => {
  it("azonos rekord csak egyszer szerepel", () => {
    const out = mergeDocs([[pdoc()], [pdoc()]]);
    expect(out).toHaveLength(1);
  });
  it("ugyanaz a tárolt fájl két rekordban: mindkettő marad, mindkettő jelölve", () => {
    const out = mergeDocs([[pdoc({ file_url: "same" })], [qdoc({ file_url: "same" })], [cdoc()]]);
    expect(out).toHaveLength(3);
    expect(out.find((d) => d.source === "project_documents")!.sameFileCount).toBe(1);
    expect(out.find((d) => d.source === "quote_documents")!.sameFileCount).toBe(1);
    expect(out.find((d) => d.source === "company_documents")!.sameFileCount).toBe(0);
  });
  it("fájlkulcs nélküli rekordok nem jelölődnek egymás duplikátumának", () => {
    const out = mergeDocs([[pdoc({ id: "a", file_url: null }), pdoc({ id: "b", file_url: null })]]);
    expect(out.every((d) => d.sameFileCount === 0)).toBe(true);
  });
  it("újabb elöl", () => {
    expect(mergeDocs([[cdoc(), pdoc(), qdoc()]]).map((d) => d.source)).toEqual(["quote_documents", "project_documents", "company_documents"]);
  });
});

describe("keresés és szűrés", () => {
  const all = mergeDocs([[pdoc(), cdoc(), qdoc()]]);
  it("ékezet- és kisbetű-független, több szóra is", () => {
    expect(searchKey("Szerződési  FELTÉTELEK")).toBe("szerzodesi feltetelek");
    expect(filterDocs(all, { query: "szerzodesi" }).map((d) => d.id)).toEqual(["q1"]);
    expect(filterDocs(all, { query: "alaprajz tarsashaz" }).map((d) => d.id)).toEqual(["p1"]);
    expect(filterDocs(all, { query: "nincsilyen" })).toEqual([]);
  });
  it("kategória- és forrásszűrő", () => {
    expect(filterDocs(all, { category: "plan" }).map((d) => d.id)).toEqual(["p1"]);
    expect(filterDocs(all, { source: "company_documents" }).map((d) => d.id)).toEqual(["c1"]);
    expect(filterDocs(all, { category: "all", source: "all" })).toHaveLength(3);
  });
  it("számlálók", () => {
    expect(sourceCounts(all)).toEqual({ project_documents: 1, company_documents: 1, quote_documents: 1 });
    expect(categoryCounts([pdoc(), pdoc({ id: "p2" }), cdoc()])[0]).toEqual({ category: "plan", label: "Tervrajz", count: 2 });
  });
  it("méret", () => {
    expect(formatBytes(null)).toBeNull();
    expect(formatBytes(0)).toBeNull();
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5,0 MB");
  });
});

describe("kapcsolódó rekord hivatkozása szerepkör szerint", () => {
  it("projekt → projekt Dokumentumok fül; ajánlat → ajánlat; ügyfél → ügyfél adatlap", () => {
    expect(docParentLink(pdoc(), can("project_manager"))).toEqual({ to: "/projects/$id", params: { id: P }, search: { tab: "docs" }, label: "Társasház felújítás" });
    expect(docParentLink(qdoc(), can("sales"))).toMatchObject({ to: "/quotes/$id", params: { id: Q } });
    expect(docParentLink(cdoc(), can("marketing"))).toMatchObject({ to: "/customers/$id", params: { id: C } });
  });
  it("negatív: Marketing nem kap ajánlat- és projekthivatkozást", () => {
    expect(docParentLink(qdoc(), can("marketing"))).toBeNull();
    expect(docParentLink(pdoc(), can("marketing"))).toBeNull();
  });
  it("kapcsolódó rekord nélkül nincs hivatkozás", () => {
    expect(docParentLink(pdoc({ project_id: null }), can("owner"))).toBeNull();
  });
  it("címke nélkül a rekord típusa a felirat", () => {
    expect(docParentLink({ ...qdoc(), parentLabel: null }, can("owner"))!.label).toBe("Ajánlat");
  });
});

describe("szerepkör-tükrök (nem bővítenek)", () => {
  it("források: Owner/PM/Sales mind; Marketing csak ügyfél; szerepkör nélkül semmi", () => {
    expect(documentSourcesForRole("owner")).toHaveLength(3);
    expect(documentSourcesForRole("project_manager")).toHaveLength(3);
    expect(documentSourcesForRole("sales")).toHaveLength(3);
    expect(documentSourcesForRole("marketing")).toEqual(["company_documents"]);
    expect(documentSourcesForRole(null)).toEqual([]);
  });
  it("feltöltés a meglévő UPLOAD_ROLES / INSERT RLS szerint", () => {
    expect(canUploadDoc("owner", "project_documents")).toBe(true);
    expect(canUploadDoc("project_manager", "quote_documents")).toBe(true);
    expect(canUploadDoc("sales", "company_documents")).toBe(true);
    expect(canUploadDoc("marketing", "company_documents")).toBe(true);
    expect(canUploadDoc("marketing", "project_documents")).toBe(false);
    expect(canUploadDoc("marketing", "quote_documents")).toBe(false);
    expect(canUploadDoc(null, "company_documents")).toBe(false);
  });
  it("törlés: tulajdonos vagy a feltöltő; más feltöltése nem", () => {
    expect(canDeleteDoc("owner", OTHER, pdoc())).toBe(true);
    expect(canDeleteDoc("sales", ME, pdoc())).toBe(true);
    expect(canDeleteDoc("sales", OTHER, pdoc())).toBe(false);
    expect(canDeleteDoc("project_manager", null, pdoc())).toBe(false);
    expect(canDeleteDoc("marketing", ME, cdoc())).toBe(true);
    expect(canDeleteDoc("marketing", ME, pdoc())).toBe(false);
    expect(canDeleteDoc(null, ME, pdoc())).toBe(false);
  });
  it("zárolt ajánlat „Kiküldött ajánlat” fájlja tulajdonosnak sem törölhető, más fájlja igen", () => {
    expect(canDeleteDoc("owner", ME, qdoc({ document_type: "sent_offer" }), { quoteLocked: true })).toBe(false);
    expect(canDeleteDoc("owner", ME, qdoc(), { quoteLocked: true })).toBe(true);
    expect(canDeleteDoc("sales", ME, qdoc({ document_type: "sent_offer" }), { quoteLocked: false })).toBe(true);
  });
});

describe("megnyitási hibák besorolása", () => {
  it.each([
    ["Nincs jogosultságod ehhez a fájlhoz.", "no_access"],
    ["Érvénytelen fájlkulcs", "invalid_key"],
    ["R2 nincs megfelelően konfigurálva (R2_ACCOUNT_ID/ACCESS/SECRET/BUCKET)", "storage"],
    ["Unauthorized: invalid JWT", "session"],
    ["TypeError: Failed to fetch", "network"],
    ["valami más", "unknown"],
  ])("%s → %s", (msg, kind) => {
    expect(classifyOpenError(new Error(msg)).kind).toBe(kind);
  });
  it("minden hibának van magyar címe és teendője", () => {
    for (const k of ["missing_file", "no_access", "invalid_key", "storage", "session", "network", "popup", "unknown"] as const) {
      const f = openFailure(k);
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.detail.length).toBeGreaterThan(10);
    }
  });
});

describe("Dokumentumtár oldal hozzáférése változatlan (nincs jogosultságváltozás)", () => {
  it("/documents: Owner és PM igen, Sales és Marketing nem", () => {
    expect(canAccessRoute("owner", "/documents")).toBe(true);
    expect(canAccessRoute("project_manager", "/documents")).toBe(true);
    expect(canAccessRoute("sales", "/documents")).toBe(false);
    expect(canAccessRoute("marketing", "/documents")).toBe(false);
  });
  it("tiltott szerepkörnek csak a számára nyitható helyeket ajánlja", () => {
    for (const role of ["sales", "marketing"] as const) {
      const hints = documentLibraryHints(role);
      expect(hints.length).toBeGreaterThan(0);
      for (const h of hints) {
        expect(canAccessRoute(role, h.to)).toBe(true);
        expect(h.to.startsWith("/documents")).toBe(false);
      }
    }
    expect(documentLibraryHints("marketing").some((h) => h.to === "/quotes" || h.to === "/projects")).toBe(false);
    expect(documentLibraryHints("owner")).toEqual([]);
    expect(documentLibraryHints("project_manager")).toEqual([]);
  });
});

describe("forrásvédelem: az új dokumentumréteg nem ír és nem ír alá saját hivatkozást", () => {
  const files = [
    "src/lib/documents/document-access.ts",
    "src/lib/documents/related-docs-loader.ts",
    "src/hooks/use-related-documents.ts",
    "src/components/documents/document-list.tsx",
    "src/components/documents/related-documents-panel.tsx",
    "src/components/documents/use-open-document.ts",
  ];
  it("nincs insert/update/delete/upsert/rpc vagy admin kliens", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
      expect(src, f).not.toMatch(/client\.server|supabaseAdmin|getAdminClient|service_role/i);
    }
  });
  it("fájlt kizárólag a meglévő r2PresignDownload nyit meg", () => {
    const open = readFileSync("src/components/documents/use-open-document.ts", "utf8");
    expect(open).toMatch(/r2PresignDownload/);
    expect(open).not.toMatch(/presignR2Url|r2\.server/);
    for (const f of ["src/components/documents/document-manager.tsx", "src/components/documents/company-document-manager.tsx", "src/components/quotes/quote-document-manager.tsx", "src/components/contract/contract-prep-panel.tsx"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/r2PresignDownload/);
    }
  });
});

