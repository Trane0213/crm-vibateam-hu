/**
 * `website_pages` + `website_page_versions` + `website_page_changes` upsert.
 *
 * Egy oldal-feldolgozás lépései:
 *  1) Page felvétele (URL alapján) — path/asset_kind alapadatok kitöltése.
 *  2) Content hash számítás; ha megegyezik a jelenlegi current_version content_hash-jével → skip.
 *  3) Új version rekord (next version_number), diff a régihez képest.
 *  4) `current_version_id` frissítése + blokk-táblák és media rögzítése.
 *  5) `website_page_changes` bejegyzés (created / updated).
 */

import { getAdminClient } from "@/integrations/supabase/server";
import { contentHash, normalizeForHash } from "./hash.server";
import { simpleLineDiff, summarizeDiff } from "./diff.server";
import { parseHtml, type ExtractedPage } from "./html-parser.server";
import { upsertPageMedia } from "./media.server";
import type { AssetKind } from "./types";

function inferAssetKind(url: string): AssetKind {
  const p = new URL(url).pathname.toLowerCase();
  if (p === "/" || p === "") return "landing";
  if (p.startsWith("/blog") || p.startsWith("/post") || p.startsWith("/news")) return "blog_post";
  if (p.startsWith("/szolgaltat") || p.startsWith("/service") || p.startsWith("/services")) return "service";
  if (p.startsWith("/faq") || p.startsWith("/gyik")) return "faq";
  if (p.startsWith("/referen") || p.startsWith("/case") || p.startsWith("/portfolio")) return "reference";
  return "other";
}

interface UpsertResult {
  page_id: string;
  status: "created" | "updated" | "unchanged" | "failed";
  version_id?: string;
  version_number?: number;
  error?: string;
}

async function upsertBlocks(
  page_version_id: string,
  parsed: ExtractedPage,
): Promise<void> {
  const admin = getAdminClient();

  if (parsed.hero) {
    const { error } = await admin.from("website_page_blocks_hero").insert({
      page_version_id,
      position: parsed.hero.position,
      headline: parsed.hero.headline,
      subheadline: parsed.hero.subheadline,
      cta_label: parsed.hero.cta_label,
      cta_url: parsed.hero.cta_url,
      media_url: parsed.hero.media_url,
    });
    if (error) throw new Error(`blocks_hero: ${error.message}`);
  }

  if (parsed.text_blocks.length > 0) {
    const rows = parsed.text_blocks.map((t) => ({
      page_version_id,
      position: t.position,
      heading: t.heading,
      body_text: t.body_text,
    }));
    const { error } = await admin.from("website_page_blocks_text").insert(rows);
    if (error) throw new Error(`blocks_text: ${error.message}`);
  }

  if (parsed.features.length > 0) {
    const rows = parsed.features.map((f) => ({
      page_version_id,
      position: f.position,
      heading: f.heading,
      items: f.items,
    }));
    const { error } = await admin.from("website_page_blocks_features").insert(rows);
    if (error) throw new Error(`blocks_features: ${error.message}`);
  }

  if (parsed.faqs.length > 0) {
    const rows = parsed.faqs.map((f) => ({
      page_version_id,
      position: f.position,
      heading: f.heading,
      items: f.items,
    }));
    const { error } = await admin.from("website_page_blocks_faq").insert(rows);
    if (error) throw new Error(`blocks_faq: ${error.message}`);
  }

  if (parsed.ctas.length > 0) {
    const rows = parsed.ctas.map((c) => ({
      page_version_id,
      position: c.position,
      headline: c.headline,
      description: c.description,
      cta_label: c.cta_label,
      cta_url: c.cta_url,
    }));
    const { error } = await admin.from("website_page_blocks_cta").insert(rows);
    if (error) throw new Error(`blocks_cta: ${error.message}`);
  }
}

export async function upsertPageAndVersion(input: {
  url: string;
  raw_html: string;
  http_status: number;
  source_id: string | null;
  run_id: string;
}): Promise<UpsertResult> {
  const admin = getAdminClient();
  const parsed = await parseHtml(input.raw_html, input.url);
  const hash = contentHash(parsed.rendered_text);
  const path = new URL(input.url).pathname || "/";
  const asset_kind = inferAssetKind(input.url);
  const now = new Date().toISOString();

  // 1) page upsert
  const { data: pageRow, error: pageErr } = await admin
    .from("website_pages")
    .upsert(
      {
        url: input.url,
        path,
        asset_kind,
        title: parsed.title,
        source_id: input.source_id,
        is_active: true,
        last_seen_at: now,
        last_crawled_at: now,
        updated_at: now,
      },
      { onConflict: "url" },
    )
    .select("id, current_version_id")
    .single();
  if (pageErr || !pageRow) {
    return {
      page_id: "",
      status: "failed",
      error: `pages upsert: ${pageErr?.message ?? "no row"}`,
    };
  }
  const page_id = pageRow.id as string;

  // 2) van-e ilyen hash?
  const { data: existing } = await admin
    .from("website_page_versions")
    .select("id, version_number, rendered_text")
    .eq("page_id", page_id)
    .eq("content_hash", hash)
    .maybeSingle();
  if (existing) {
    return {
      page_id,
      status: "unchanged",
      version_id: existing.id as string,
      version_number: existing.version_number as number,
    };
  }

  // 3) előző verzió lekérése diffhez + version_number
  const { data: prev } = await admin
    .from("website_page_versions")
    .select("id, version_number, rendered_text")
    .eq("page_id", page_id)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const next_version = ((prev?.version_number as number | undefined) ?? 0) + 1;

  const { data: inserted, error: insErr } = await admin
    .from("website_page_versions")
    .insert({
      page_id,
      version_number: next_version,
      content_hash: hash,
      raw_html: input.raw_html.slice(0, 500_000),
      rendered_text: normalizeForHash(parsed.rendered_text),
      http_status: input.http_status,
      byte_size: input.raw_html.length,
      run_id: input.run_id,
      metadata: {
        title: parsed.title,
        meta_description: parsed.meta_description,
      },
    })
    .select("id, version_number")
    .single();
  if (insErr || !inserted) {
    return {
      page_id,
      status: "failed",
      error: `versions insert: ${insErr?.message ?? "no row"}`,
    };
  }
  const version_id = inserted.id as string;

  // 4) blokkok + media
  try {
    await upsertBlocks(version_id, parsed);
    await upsertPageMedia({
      page_id,
      page_version_id: version_id,
      media: parsed.media,
    });
  } catch (e) {
    // A blokk/media hiba nem borítja el a page-t: verzió megmarad.
    console.error("[WK] block/media insert failed", e);
  }

  // 5) current_version_id frissítés
  await admin
    .from("website_pages")
    .update({ current_version_id: version_id, updated_at: now })
    .eq("id", page_id);

  // 6) change log
  const isCreated = !prev;
  const diff = simpleLineDiff(
    (prev?.rendered_text as string | null) ?? "",
    normalizeForHash(parsed.rendered_text),
  );
  await admin.from("website_page_changes").insert({
    page_id,
    from_version_id: (prev?.id as string | undefined) ?? null,
    to_version_id: version_id,
    change_type: isCreated ? "created" : "updated",
    diff_summary: summarizeDiff(diff),
    diff: { added: diff.added_lines, removed: diff.removed_lines },
    run_id: input.run_id,
  });

  return {
    page_id,
    status: isCreated ? "created" : "updated",
    version_id,
    version_number: next_version,
  };
}