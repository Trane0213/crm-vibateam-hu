/**
 * Knowledge Graph — közös TypeScript típusok. Domain-független.
 *
 * A KG modul semmit sem tud a domain-modulokról (website, crm, ads, ...).
 * Ezek a típusok csak a node/edge/relation struktúrát rögzítik.
 */

/** Node kind — bővíthető szótár. A pontos érvényesítést az adatbázis végzi
 *  (kg_node_kinds tábla FK-ja). A TS típus dokumentációs célt szolgál. */
export type NodeKind =
  // website
  | "website_page"
  | "website_entity"
  | "media_asset"
  | "pdf_document"
  | "blog_post"
  | "faq_item"
  | "reference_project"
  | "external_url"
  | "topic"
  // crm
  | "crm_lead"
  | "crm_project"
  | "crm_company"
  | "crm_contact"
  | "crm_quote"
  | "crm_followup"
  | "crm_email_thread"
  // ads
  | "google_ads_campaign"
  | "google_ads_ad_group"
  | "google_ads_ad"
  | "google_ads_keyword"
  // analytics
  | "ga4_event"
  | "clarity_recording"
  // billing / docs / comms
  | "invoice"
  | "document"
  | "email_message"
  | "calendar_event"
  // apps
  | "nexohabit_habit"
  | "mennyibe_item"
  // ai os
  | "ai_agent"
  | "ai_run"
  | "ai_tool_call"
  // catch-all fallback (a DB engedi az új kind-okat, ha kg_node_kinds-ba beszúrták)
  | (string & {});

/** Reláció típus — bővíthető szótár. A DB kg_relations FK érvényesíti. */
export type RelationKind =
  // strukturális
  | "describes"
  | "mentions"
  | "links_to"
  | "contains_media"
  | "belongs_to_source"
  | "has_entity"
  | "has_version"
  | "derived_from"
  | "authored_by"
  | "assigned_to"
  // üzleti
  | "landing_of_campaign"
  | "target_of_ad"
  | "tracked_by_ga4_event"
  | "recorded_by_clarity"
  | "originates_lead"
  | "supports_project"
  | "billed_in_invoice"
  | "quoted_in"
  | "booked_in_calendar"
  | "related_to_habit"
  // szemantikus AI
  | "related_to"
  | "describes_same_service"
  | "predecessor_of"
  | "successor_of"
  | "supports"
  | "details"
  | "contradicts"
  | "supersedes"
  | (string & {});

/** Edge origin/source — kg_edges.source CHECK-ből. */
export type EdgeSource =
  | "manual"
  | "heuristic"
  | "ai_extraction"
  | "ai_vision"
  | "ai_semantic"
  | "crawl_link"
  | "import"
  | "domain_hook";

export type EdgeDirection = "directed" | "undirected";

/** Egy node upsert payloadja — publisher szempontból. */
export type NodePayload = {
  kind: NodeKind;
  /** Forrás-tábla neve a public sémában (pl. "website_pages", "leads"). */
  ref_table?: string | null;
  /** Forrás-rekord id-ja. */
  ref_id?: string | null;
  /** Alternatív / kiegészítő azonosító: URI (pl. külső URL, email cím). */
  ref_uri?: string | null;
  /** Emberi olvasható címke — cache. */
  label?: string | null;
  /** Kind-specifikus szabad metaadat. */
  metadata?: Record<string, unknown> | null;
};

/** Egy edge upsert payloadja — publisher szempontból. */
export type EdgePayload = {
  from_node_id: string;
  to_node_id: string;
  relation: RelationKind;
  direction?: EdgeDirection;
  weight?: number | null;
  confidence?: number | null;
  source: EdgeSource;
  origin_ref_table?: string | null;
  origin_ref_id?: string | null;
  evidence?: Record<string, unknown> | null;
  valid_from?: string | null;
  valid_to?: string | null;
  metadata?: Record<string, unknown> | null;
  created_by_user_id?: string | null;
};

/** syncEdges input — idempotens él-szinkron egyetlen (from, relation) párra. */
export type SyncEdgesInput = {
  from_node_id: string;
  relation: RelationKind;
  target_node_ids: string[];
  source: EdgeSource;
  direction?: EdgeDirection;
  origin_ref_table?: string | null;
  origin_ref_id?: string | null;
};

/** Publisher belépési pontjához (projectFromSource) használt DTO. */
export type ProjectFromSourceInput = {
  module: string;
  source_kind: string;
  run_id?: string | null;
  batch: Array<{
    node: NodePayload;
    edges?: EdgePayload[];
  }>;
};

/** kg_publishers state — futásidejű publikációs statisztika. */
export type PublisherRunStats = {
  nodes_upserted: number;
  edges_upserted: number;
  edges_removed: number;
  status: "ok" | "partial" | "error";
  error_message?: string | null;
};