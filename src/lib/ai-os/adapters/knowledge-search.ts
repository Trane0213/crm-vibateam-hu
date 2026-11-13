/** AI OS 2.0 — shared knowledge search result shaping (pure, browser-safe). */
export const KNOWLEDGE_AGENTS = ["george", "scarlet", "timothy", "boss"] as const;

const SOURCE_PATH: Record<string, (r: KnowledgeHit) => string | null> = {
  company_documents: (r) => (r.company_id ? `/customers/${r.company_id}` : null),
  project_documents: (r) => (r.project_id ? `/projects/${r.project_id}` : null),
  quote_documents: (r) => (r.quote_id ? `/quotes/${r.quote_id}` : null),
  email_attachments: (r) => (r.email_id ? `/emails/${r.email_id}` : null),
};

export type KnowledgeHit = {
  chunk_id: string; document_id: string; title: string | null; source_table: string | null; source_id: string | null;
  company_id: string | null; project_id: string | null; quote_id: string | null; lead_id: string | null; email_id: string | null;
  content_sha256: string | null; processing_status: string; processed_at: string | null; source_updated_at: string | null;
  unit_label: string | null; unit_index: number; claim_kind: string; excerpt: string;
};

/** Separates verified source facts from AI inference and unverified content; never upgrades a claim. */
export function shapeKnowledgeResult(raw: { items?: KnowledgeHit[]; has_more?: boolean; page?: number } | null) {
  const items = (raw?.items ?? []).map((h) => ({
    claim: h.claim_kind === "source_fact" && h.processing_status === "processed" ? "source_fact" : h.claim_kind === "ai_inference" ? "ai_inference" : "unverified",
    excerpt: h.excerpt, untrusted_content: true,
    source: { table: h.source_table, id: h.source_id, document_id: h.document_id, title: h.title, unit: h.unit_label ?? `#${h.unit_index}`,
      sha256: h.content_sha256, processing_status: h.processing_status, processed_at: h.processed_at, link: h.source_table ? SOURCE_PATH[h.source_table]?.(h) ?? null : null },
    related: { company_id: h.company_id, project_id: h.project_id, quote_id: h.quote_id, lead_id: h.lead_id, email_id: h.email_id },
  }));
  // AI OS 2.0/9: azonos tartalmú fájl (ugyanaz a sha256 + egység) több helyen — egy találat, a másolatok forrásként felsorolva.
  const merged: (typeof items[number] & { identical_copies?: { table: string | null; id: string | null; document_id: string; title: string | null; link: string | null }[] })[] = [];
  const byContent = new Map<string, (typeof merged)[number]>();
  for (const it of items) {
    const key = it.source.sha256 ? `${it.source.sha256}|${it.source.unit}` : null;
    const first = key ? byContent.get(key) : undefined;
    if (first) { (first.identical_copies ??= []).push({ table: it.source.table, id: it.source.id, document_id: it.source.document_id, title: it.source.title, link: it.source.link }); continue; }
    merged.push(it); if (key) byContent.set(key, it);
  }
  return {
    items: merged, page: raw?.page ?? 0, has_more: Boolean(raw?.has_more),
    coverage: { scope: "only_indexed_current_versions_visible_to_user", empty_means: "no_visible_indexed_match_not_absence" },
  };
}
