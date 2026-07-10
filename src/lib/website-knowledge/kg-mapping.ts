/**
 * Website Knowledge → Knowledge Graph mapping helpers. PURE, no DB access.
 *
 * Bemenet: már betöltött DB sorok / szövegek.
 * Kimenet: `NodePayload` és részleges `EdgePayload` template-ek
 * (from_node_id / to_node_id még nincs — azt a publisher tölti ki, miután
 * upsertNode-al feloldotta az azonosítókat).
 *
 * Csere-barát: ez a modul semmit nem tud a KG DB rétegről vagy a WK
 * tábláiról a típusaikon kívül, könnyen unit-tesztelhető.
 */

import type { NodePayload } from "@/lib/knowledge-graph/types";

export interface WkPageRow {
  id: string;
  url: string;
  path: string;
  title: string | null;
  asset_kind: string;
  current_version_id: string | null;
}

export interface WkEntityRow {
  id: string;
  entity_kind: string;
  name: string;
  normalized_name: string;
}

export interface WkMediaRow {
  id: string;
  url: string;
  media_kind: string;
  alt_text: string | null;
  mime_type: string | null;
}

/** Website page node — a `website_pages.id` az elsődleges ref. */
export function pageNodePayload(page: WkPageRow, version_number?: number): NodePayload {
  return {
    kind: "website_page",
    ref_table: "website_pages",
    ref_id: page.id,
    ref_uri: page.url,
    label: page.title ?? page.path ?? page.url,
    metadata: {
      asset_kind: page.asset_kind,
      path: page.path,
      current_version_id: page.current_version_id,
      current_version_number: version_number ?? null,
    },
  };
}

/** Website entity node. */
export function entityNodePayload(entity: WkEntityRow): NodePayload {
  return {
    kind: "website_entity",
    ref_table: "website_entities",
    ref_id: entity.id,
    ref_uri: `${entity.entity_kind}:${entity.normalized_name}`,
    label: entity.name,
    metadata: { entity_kind: entity.entity_kind },
  };
}

/** Media asset node — a website_media sor id-jét használjuk ref-nek. */
export function mediaNodePayload(media: WkMediaRow): NodePayload {
  return {
    kind: "media_asset",
    ref_table: "website_media",
    ref_id: media.id,
    ref_uri: media.url,
    label: media.alt_text ?? media.url,
    metadata: {
      media_kind: media.media_kind,
      mime_type: media.mime_type,
    },
  };
}

/** External URL node — csak ref_uri (nincs domain-tábla). */
export function externalUrlNodePayload(url: string): NodePayload {
  let label = url;
  try {
    label = new URL(url).hostname;
  } catch {
    /* ignore */
  }
  return {
    kind: "external_url",
    ref_table: null,
    ref_id: null,
    ref_uri: url,
    label,
    metadata: {},
  };
}

/**
 * Nyers HTML-ből linkek kiszedése. Két csoport:
 *   - internal[]  : ugyanazon a hosthoz tartozó abszolút URL-ek (belső oldalak)
 *   - external[]  : más host abszolút URL-jei
 * A duplikátumokat kiszűrjük, a fragment/query részt megtartjuk, a hash-t elvágjuk.
 * Az anchor `href="#..."` és `mailto:` / `tel:` linkeket eldobjuk.
 */
export function extractLinksFromHtml(
  rawHtml: string,
  baseUrl: string,
): { internal: string[]; external: string[] } {
  const internal = new Set<string>();
  const external = new Set<string>();
  let baseHost = "";
  try {
    baseHost = new URL(baseUrl).hostname;
  } catch {
    return { internal: [], external: [] };
  }
  const re = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawHtml)) !== null) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw) continue;
    if (raw.startsWith("#") || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) {
      continue;
    }
    let abs: URL;
    try {
      abs = new URL(raw, baseUrl);
    } catch {
      continue;
    }
    if (abs.protocol !== "http:" && abs.protocol !== "https:") continue;
    abs.hash = "";
    const s = abs.toString();
    if (abs.hostname === baseHost) internal.add(s);
    else external.add(s);
    if (internal.size + external.size > 200) break;
  }
  return { internal: Array.from(internal), external: Array.from(external) };
}