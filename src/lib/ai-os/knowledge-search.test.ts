import { describe, expect, it } from "vitest";
import { KNOWLEDGE_AGENTS, shapeKnowledgeResult, type KnowledgeHit } from "./adapters/knowledge-search";

const hit = (over: Partial<KnowledgeHit>): KnowledgeHit => ({
  chunk_id: "c1", document_id: "d1", title: "Szerződés.pdf", source_table: "company_documents", source_id: "s1",
  company_id: "co1", project_id: null, quote_id: null, lead_id: null, email_id: null, content_sha256: "abc",
  processing_status: "processed", processed_at: "2026-11-13T10:00:00Z", source_updated_at: null,
  unit_label: "3. oldal", unit_index: 2, claim_kind: "source_fact", excerpt: "Határidő: 2026-12-01", ...over,
});

describe("AI OS 2.0 shared knowledge", () => {
  it("is shared by exactly George, Scarlet, Timothy and Boss", () => {
    expect([...KNOWLEDGE_AGENTS].sort()).toEqual(["boss", "george", "scarlet", "timothy"]);
  });
  it("keeps a processed source fact with its page and source link", () => {
    const r = shapeKnowledgeResult({ items: [hit({})], has_more: false, page: 0 });
    expect(r.items[0].claim).toBe("source_fact");
    expect(r.items[0].source.unit).toBe("3. oldal");
    expect(r.items[0].source.link).toBe("/customers/co1");
  });
  it("never shows a partial or needs-review chunk as a verified fact", () => {
    expect(shapeKnowledgeResult({ items: [hit({ processing_status: "partial" })] }).items[0].claim).toBe("unverified");
    expect(shapeKnowledgeResult({ items: [hit({ processing_status: "needs_review" })] }).items[0].claim).toBe("unverified");
  });
  it("keeps AI inference separate from facts", () => {
    expect(shapeKnowledgeResult({ items: [hit({ claim_kind: "ai_inference" })] }).items[0].claim).toBe("ai_inference");
  });
  it("does not treat an empty result as proof of absence", () => {
    expect(shapeKnowledgeResult({ items: [] }).coverage.empty_means).toBe("no_visible_indexed_match_not_absence");
  });
});

describe("AI OS 2.0/9 duplikált fájl", () => {
  it("azonos tartalmú (sha256 + oldal) találatot egyszer ad vissza, a másolatot forrásként jelzi", () => {
    const r = shapeKnowledgeResult({ items: [hit({}), hit({ chunk_id: "c2", document_id: "d2", source_id: "s2", source_table: "email_attachments", email_id: "e1" })] });
    expect(r.items).toHaveLength(1);
    expect(r.items[0].identical_copies).toEqual([{ table: "email_attachments", id: "s2", document_id: "d2", title: "Szerződés.pdf", link: "/emails/e1" }]);
  });
  it("eltérő tartalmú vagy eltérő oldalú találatot nem von össze", () => {
    expect(shapeKnowledgeResult({ items: [hit({}), hit({ chunk_id: "c2", content_sha256: "xyz" })] }).items).toHaveLength(2);
    expect(shapeKnowledgeResult({ items: [hit({}), hit({ chunk_id: "c2", unit_label: "4. oldal", unit_index: 3 })] }).items).toHaveLength(2);
  });
});
