/**
 * `website_media` upsertelése verzióhoz. Unique key: (page_version_id, url).
 */

import { getAdminClient } from "@/integrations/supabase/server";
import type { ExtractedMedia } from "./html-parser.server";

export async function upsertPageMedia(input: {
  page_id: string;
  page_version_id: string;
  media: ExtractedMedia[];
}): Promise<{ inserted: number }> {
  if (input.media.length === 0) return { inserted: 0 };
  const admin = getAdminClient();
  const rows = input.media.map((m) => ({
    page_id: input.page_id,
    page_version_id: input.page_version_id,
    url: m.url,
    media_kind: m.media_kind,
    mime_type: m.mime_type,
    alt_text: m.alt_text,
    width: m.width,
    height: m.height,
  }));
  const { error } = await admin
    .from("website_media")
    .upsert(rows, { onConflict: "page_version_id,url", ignoreDuplicates: true });
  if (error) throw new Error(`website_media upsert: ${error.message}`);
  return { inserted: rows.length };
}