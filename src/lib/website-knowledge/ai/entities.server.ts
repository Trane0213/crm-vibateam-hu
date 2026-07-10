/**
 * Entity extraction — kinyeri az entitásokat egy page-version szövegéből,
 * upsertel a `website_entities` katalógusba és `website_page_entities`-be linkeli.
 */

import { getAdminClient } from "@/integrations/supabase/server";
import { callWkAi, safeParseJson } from "./client.server";
import { ENTITY_SYSTEM_PROMPT, buildEntityUserPrompt } from "./prompts";

type EntityKind =
  | "service"
  | "product"
  | "person"
  | "company"
  | "location"
  | "topic"
  | "technology"
  | "other";

type EntityRole = "primary" | "secondary" | "mentioned";

const KIND_SET: ReadonlySet<EntityKind> = new Set([
  "service",
  "product",
  "person",
  "company",
  "location",
  "topic",
  "technology",
  "other",
]);

const ROLE_SET: ReadonlySet<EntityRole> = new Set(["primary", "secondary", "mentioned"]);

interface RawEntity {
  kind?: string;
  name?: string;
  role?: string;
  confidence?: number;
  evidence?: string;
}

interface EntityJson {
  entities?: RawEntity[];
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .slice(0, 120);
}

function coerceKind(v: unknown): EntityKind {
  if (typeof v !== "string") return "other";
  const k = v.trim().toLowerCase();
  return (KIND_SET as ReadonlySet<string>).has(k) ? (k as EntityKind) : "other";
}

function coerceRole(v: unknown): EntityRole {
  if (typeof v !== "string") return "mentioned";
  const r = v.trim().toLowerCase();
  return (ROLE_SET as ReadonlySet<string>).has(r) ? (r as EntityRole) : "mentioned";
}

function coerceConfidence(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.max(0, Math.min(1, Number(v.toFixed(2))));
}

export interface ExtractEntitiesInput {
  run_id: string;
  page_id: string;
  page_version_id: string;
  url: string;
  title: string | null;
  rendered_text: string;
}

export interface ExtractEntitiesResult {
  status: "success" | "failed" | "skipped";
  ai_job_id?: string;
  entities_created: number;
  entities_linked: number;
  error?: string;
}

export async function extractEntitiesForVersion(
  input: ExtractEntitiesInput,
): Promise<ExtractEntitiesResult> {
  if (!input.rendered_text || input.rendered_text.trim().length < 40) {
    return {
      status: "skipped",
      entities_created: 0,
      entities_linked: 0,
      error: "text too short",
    };
  }
  const admin = getAdminClient();

  const call = await callWkAi({
    kind: "entity_extraction",
    run_id: input.run_id,
    page_id: input.page_id,
    page_version_id: input.page_version_id,
    system: ENTITY_SYSTEM_PROMPT,
    user: buildEntityUserPrompt({
      url: input.url,
      title: input.title,
      text: input.rendered_text,
    }),
  });
  if (call.status === "failed") {
    return {
      status: "failed",
      ai_job_id: call.ai_job_id,
      entities_created: 0,
      entities_linked: 0,
      error: call.error_message ?? "ai call failed",
    };
  }

  const parsed = safeParseJson<EntityJson>(call.text);
  const rawList = Array.isArray(parsed?.entities) ? parsed!.entities! : [];

  let created = 0;
  let linked = 0;

  for (const raw of rawList.slice(0, 15)) {
    if (typeof raw?.name !== "string") continue;
    const name = raw.name.trim().slice(0, 200);
    if (!name) continue;
    const kind = coerceKind(raw.kind);
    const role = coerceRole(raw.role);
    const confidence = coerceConfidence(raw.confidence);
    const normalized = normalizeName(name);
    if (!normalized) continue;

    const { data: entRow, error: entErr } = await admin
      .from("website_entities")
      .upsert(
        {
          entity_kind: kind,
          name,
          normalized_name: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "entity_kind,normalized_name" },
      )
      .select("id, created_at, updated_at")
      .single();
    if (entErr || !entRow) continue;
    const entity_id = entRow.id as string;
    if (entRow.created_at === entRow.updated_at) created++;

    const { error: linkErr } = await admin.from("website_page_entities").upsert(
      {
        page_id: input.page_id,
        page_version_id: input.page_version_id,
        entity_id,
        role,
        confidence,
        evidence: {
          quote: typeof raw.evidence === "string" ? raw.evidence.slice(0, 500) : null,
        },
        ai_job_id: call.ai_job_id,
      },
      { onConflict: "page_version_id,entity_id,role", ignoreDuplicates: true },
    );
    if (!linkErr) linked++;
  }

  return {
    status: "success",
    ai_job_id: call.ai_job_id,
    entities_created: created,
    entities_linked: linked,
  };
}