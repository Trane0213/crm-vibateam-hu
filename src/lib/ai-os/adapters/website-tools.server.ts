/**
 * AI OS — Website Knowledge (`website.knowledge`) tool adapterek. SERVER-ONLY.
 *
 * WK-6: kizárólag READ toolok. Semmi mutation. Az agentek a saját tudásbázisunkban
 * (vibateam.hu crawl → website_* táblák) keresnek. A KG kapcsolatokat a `kg` domain
 * (kg_get_node / kg_find_related) adja külön.
 *
 * Tíz tool:
 *   1) website_search_pages
 *   2) website_list_pages
 *   3) website_get_page
 *   4) website_get_summary
 *   5) website_search_by_entity
 *   6) website_list_entities
 *   7) website_get_page_history
 *   8) website_get_page_diff
 *   9) website_list_media
 *  10) website_crawl_status                — Owner only
 *
 * A toolok a tool context user Supabase kliensét (RLS) használják.
 * A website_* táblákra authenticated → SELECT engedélyezve van.
 */

import { registerTool } from "../tool-registry";

function ok<T>(data: T) {
  return { ok: true, data };
}
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: message };
}

const DOMAIN = "website.knowledge";

/** Segéd: LIKE-safe escape. */
function like(s: string): string {
  return `%${s.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
}

export function registerWebsiteTools() {
  // ------------------------------------------------------------------
  // 1) website_search_pages
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_search_pages",
      description:
        "Vibateam.hu oldalak keresése kulcsszó alapján. A title / path / url mezőkön ILIKE kereséssel, találatonként a legutolsó AI summary első 240 karakterével. Ez az elsődleges eszköz arra, hogy megtudd, van-e a Vibateam weboldalán az adott témáról tartalom.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keresendő kifejezés." },
          asset_kind: {
            type: "string",
            enum: ["landing", "blog_post", "service", "faq", "reference", "other"],
          },
          limit: { type: "integer", default: 10, minimum: 1, maximum: 30 },
        },
        required: ["query"],
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        const q = String(args.query ?? "").trim();
        if (!q) return fail("A `query` mező kötelező és nem lehet üres.");
        const term = like(q);
        const limit = Math.min(Math.max(Number(args.limit ?? 10), 1), 30);

        let sel = sb
          .from("website_pages")
          .select(
            "id, url, path, title, asset_kind, last_crawled_at, current_version_id",
          )
          .eq("is_active", true)
          .or(`title.ilike.${term},path.ilike.${term},url.ilike.${term}`)
          .order("last_crawled_at", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (args.asset_kind) sel = sel.eq("asset_kind", String(args.asset_kind));
        const { data: pages, error } = await sel;
        if (error) throw new Error(error.message);

        const rows = (pages ?? []) as Array<{
          id: string;
          url: string;
          path: string;
          title: string | null;
          asset_kind: string;
          last_crawled_at: string | null;
          current_version_id: string | null;
        }>;
        if (rows.length === 0) {
          return ok({ query: q, count: 0, results: [] });
        }

        const versionIds = rows
          .map((r) => r.current_version_id)
          .filter((v): v is string => !!v);
        const summaries = new Map<string, string>();
        if (versionIds.length > 0) {
          const { data: sums } = await sb
            .from("website_page_summaries")
            .select("page_version_id, summary")
            .in("page_version_id", versionIds);
          for (const s of (sums ?? []) as Array<{
            page_version_id: string;
            summary: string | null;
          }>) {
            if (s.summary) summaries.set(s.page_version_id, s.summary);
          }
        }

        return ok({
          query: q,
          count: rows.length,
          results: rows.map((r) => ({
            page_id: r.id,
            url: r.url,
            path: r.path,
            title: r.title,
            asset_kind: r.asset_kind,
            last_crawled_at: r.last_crawled_at,
            summary_preview: r.current_version_id
              ? (summaries.get(r.current_version_id) ?? "").slice(0, 240) || null
              : null,
          })),
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 2) website_list_pages
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_list_pages",
      description:
        "A Vibateam weboldalán utoljára crawlolt oldalak listája. Szűrhető asset_kind szerint (landing/blog_post/service/faq/reference/other). Jó belépőpont, ha nem tudod, mit tartalmaz a weboldal.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          asset_kind: {
            type: "string",
            enum: ["landing", "blog_post", "service", "faq", "reference", "other"],
          },
          limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100);
        let q = sb
          .from("website_pages")
          .select("id, url, path, title, asset_kind, last_crawled_at")
          .eq("is_active", true)
          .order("last_crawled_at", { ascending: false, nullsFirst: false })
          .limit(limit);
        if (args.asset_kind) q = q.eq("asset_kind", String(args.asset_kind));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok({ count: (data ?? []).length, pages: data ?? [] });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 3) website_get_page
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_get_page",
      description:
        "Egy Vibateam oldal teljes rekordja page_id vagy url alapján: meta + current version + legfrissebb AI summary + top entitások + media darabszám. Ezt hívd, ha egy konkrét oldalról kell strukturált tudás.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string", description: "website_pages.id (uuid)." },
          url: { type: "string", description: "Teljes URL (pl. https://vibateam.hu/szolgaltatasok)." },
          entity_limit: { type: "integer", default: 15, minimum: 1, maximum: 50 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        let q = sb
          .from("website_pages")
          .select(
            "id, url, path, title, asset_kind, is_active, last_crawled_at, last_seen_at, current_version_id",
          )
          .limit(1);
        if (args.page_id) q = q.eq("id", String(args.page_id));
        else if (args.url) q = q.eq("url", String(args.url));
        else return fail("Add meg vagy `page_id`-t, vagy `url`-t.");
        const { data: pages, error } = await q;
        if (error) throw new Error(error.message);
        const page = (pages ?? [])[0] ?? null;
        if (!page) return ok({ page: null });

        const eLimit = Math.min(Math.max(Number(args.entity_limit ?? 15), 1), 50);

        const [{ data: summary }, entityLinksRes, mediaCountRes] = await Promise.all([
          sb
            .from("website_page_summaries")
            .select("summary, summary_json, model, created_at")
            .eq("page_version_id", page.current_version_id ?? "")
            .maybeSingle(),
          sb
            .from("website_page_entities")
            .select("entity_id, role, confidence")
            .eq("page_id", page.id)
            .limit(eLimit),
          sb
            .from("website_media")
            .select("id", { count: "exact", head: true })
            .eq("page_id", page.id),
        ]);

        const links = (entityLinksRes.data ?? []) as Array<{
          entity_id: string;
          role: string | null;
          confidence: number | null;
        }>;
        let entities: Array<{
          id: string;
          name: string;
          entity_kind: string;
          role: string | null;
          confidence: number | null;
        }> = [];
        if (links.length > 0) {
          const ids = Array.from(new Set(links.map((l) => l.entity_id)));
          const { data: ents } = await sb
            .from("website_entities")
            .select("id, name, entity_kind, normalized_name")
            .in("id", ids);
          const byId = new Map(
            ((ents ?? []) as Array<{ id: string; name: string; entity_kind: string }>).map(
              (e) => [e.id, e],
            ),
          );
          entities = links
            .map((l) => {
              const e = byId.get(l.entity_id);
              if (!e) return null;
              return {
                id: e.id,
                name: e.name,
                entity_kind: e.entity_kind,
                role: l.role,
                confidence: l.confidence,
              };
            })
            .filter((v): v is NonNullable<typeof v> => !!v);
        }

        return ok({
          page,
          summary: summary
            ? {
                text: (summary as { summary: string | null }).summary,
                summary_json: (summary as { summary_json: unknown }).summary_json,
                model: (summary as { model: string | null }).model,
                created_at: (summary as { created_at: string }).created_at,
              }
            : null,
          entities,
          media_count: mediaCountRes.count ?? 0,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 4) website_get_summary
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_get_summary",
      description:
        "Egy oldal AI által generált összefoglalója és kulcspontjai a legfrissebb crawl-verzióból. Ezt hívd, ha a felhasználó azt kérdezi, MIT tartalmaz egy Vibateam-oldal.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string" },
          url: { type: "string" },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        let pq = sb.from("website_pages").select("id, url, title, current_version_id").limit(1);
        if (args.page_id) pq = pq.eq("id", String(args.page_id));
        else if (args.url) pq = pq.eq("url", String(args.url));
        else return fail("Add meg vagy `page_id`-t, vagy `url`-t.");
        const { data: pageRows, error: pErr } = await pq;
        if (pErr) throw new Error(pErr.message);
        const page = (pageRows ?? [])[0] as
          | { id: string; url: string; title: string | null; current_version_id: string | null }
          | undefined;
        if (!page) return ok({ found: false, summary: null });
        if (!page.current_version_id) {
          return ok({ found: false, summary: null, page });
        }
        const { data: s } = await sb
          .from("website_page_summaries")
          .select("summary, summary_json, model, created_at")
          .eq("page_version_id", page.current_version_id)
          .maybeSingle();
        if (!s) return ok({ found: false, summary: null, page });
        return ok({ found: true, page, summary: s });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 5) website_search_by_entity
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_search_by_entity",
      description:
        "Adott entitás (pl. 'Google Ads', 'SEO', 'weboldalkészítés') előfordulásai a Vibateam weboldalán. Visszaadja azokat az oldalakat, amelyeken az AI extraction megtalálta az entitást.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          entity_name: { type: "string", description: "Az entitás neve vagy normalizált neve." },
          entity_kind: {
            type: "string",
            enum: ["service", "product", "person", "company", "location", "topic", "technology", "other"],
          },
          limit: { type: "integer", default: 20, minimum: 1, maximum: 50 },
        },
        required: ["entity_name"],
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        const name = String(args.entity_name ?? "").trim();
        if (!name) return fail("Az `entity_name` mező kötelező.");
        const term = like(name);
        const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 50);

        let eq = sb
          .from("website_entities")
          .select("id, name, entity_kind, normalized_name")
          .or(`name.ilike.${term},normalized_name.ilike.${term}`)
          .limit(10);
        if (args.entity_kind) eq = eq.eq("entity_kind", String(args.entity_kind));
        const { data: entities, error: eErr } = await eq;
        if (eErr) throw new Error(eErr.message);
        const ents = (entities ?? []) as Array<{
          id: string;
          name: string;
          entity_kind: string;
          normalized_name: string;
        }>;
        if (ents.length === 0) return ok({ query: name, entities: [], pages: [] });

        const { data: links, error: lErr } = await sb
          .from("website_page_entities")
          .select("page_id, entity_id, role, confidence")
          .in(
            "entity_id",
            ents.map((e) => e.id),
          )
          .limit(limit);
        if (lErr) throw new Error(lErr.message);
        const linkRows = (links ?? []) as Array<{
          page_id: string;
          entity_id: string;
          role: string | null;
          confidence: number | null;
        }>;
        if (linkRows.length === 0) return ok({ query: name, entities: ents, pages: [] });

        const pageIds = Array.from(new Set(linkRows.map((l) => l.page_id)));
        const { data: pages } = await sb
          .from("website_pages")
          .select("id, url, path, title, asset_kind, last_crawled_at")
          .in("id", pageIds);
        const pageMap = new Map(
          ((pages ?? []) as Array<{ id: string }>).map((p) => [p.id, p]),
        );
        const entMap = new Map(ents.map((e) => [e.id, e]));

        const merged = linkRows
          .map((l) => {
            const p = pageMap.get(l.page_id);
            const e = entMap.get(l.entity_id);
            if (!p || !e) return null;
            return {
              ...p,
              entity: {
                id: e.id,
                name: e.name,
                entity_kind: e.entity_kind,
              },
              role: l.role,
              confidence: l.confidence,
            };
          })
          .filter((v): v is NonNullable<typeof v> => !!v);

        return ok({ query: name, entities: ents, pages: merged });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 6) website_list_entities
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_list_entities",
      description:
        "A Website Knowledge által kinyert entitások katalógusa (service / product / topic / technology / ...). Használd, ha át akarod látni, milyen témák jelennek meg a Vibateam oldalain.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          entity_kind: {
            type: "string",
            enum: ["service", "product", "person", "company", "location", "topic", "technology", "other"],
          },
          prefix: { type: "string", description: "Név/normalized_name prefix szűrő." },
          limit: { type: "integer", default: 50, minimum: 1, maximum: 200 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        const limit = Math.min(Math.max(Number(args.limit ?? 50), 1), 200);
        let q = sb
          .from("website_entities")
          .select("id, entity_kind, name, normalized_name, description")
          .order("entity_kind", { ascending: true })
          .order("normalized_name", { ascending: true })
          .limit(limit);
        if (args.entity_kind) q = q.eq("entity_kind", String(args.entity_kind));
        if (args.prefix) {
          const term = `${String(args.prefix).replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
          q = q.or(`name.ilike.${term},normalized_name.ilike.${term}`);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok({ count: (data ?? []).length, entities: data ?? [] });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 7) website_get_page_history
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_get_page_history",
      description:
        "Egy oldal verziólistája: version_number, content_hash, http_status, byte_size, fetched_at. Jó annak eldöntésére, mikor változott utoljára a tartalom.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string" },
          url: { type: "string" },
          limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        let page_id = args.page_id ? String(args.page_id) : null;
        if (!page_id) {
          if (!args.url) return fail("Add meg `page_id`-t vagy `url`-t.");
          const { data: prow } = await sb
            .from("website_pages")
            .select("id")
            .eq("url", String(args.url))
            .maybeSingle();
          if (!prow) return ok({ page_id: null, versions: [] });
          page_id = (prow as { id: string }).id;
        }
        const limit = Math.min(Math.max(Number(args.limit ?? 20), 1), 100);
        const { data, error } = await sb
          .from("website_page_versions")
          .select("id, version_number, content_hash, http_status, byte_size, fetched_at, run_id")
          .eq("page_id", page_id)
          .order("version_number", { ascending: false })
          .limit(limit);
        if (error) throw new Error(error.message);
        return ok({ page_id, versions: data ?? [] });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 8) website_get_page_diff
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_get_page_diff",
      description:
        "Két verzió közötti tartalomváltozás (hozzáadott/eltávolított sorok, diff_summary). Ha csak `to_version_id`-t adsz, a change log adott sorát adjuk vissza.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          to_version_id: { type: "string" },
          from_version_id: { type: "string" },
          page_id: { type: "string" },
          limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        let q = sb
          .from("website_page_changes")
          .select(
            "id, page_id, from_version_id, to_version_id, change_type, diff_summary, diff, created_at",
          )
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(Number(args.limit ?? 10), 1), 50));
        if (args.to_version_id) q = q.eq("to_version_id", String(args.to_version_id));
        if (args.from_version_id) q = q.eq("from_version_id", String(args.from_version_id));
        if (args.page_id) q = q.eq("page_id", String(args.page_id));
        if (!args.to_version_id && !args.from_version_id && !args.page_id) {
          return fail("Adj meg legalább egy szűrőt: `to_version_id`, `from_version_id` vagy `page_id`.");
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok({ count: (data ?? []).length, changes: data ?? [] });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 9) website_list_media
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_list_media",
      description:
        "Media assetek (kép/video/dokumentum) alt szöveggel egy oldalról vagy globálisan. Vision AI mezőket (caption/description/ocr) is visszaadja, ha vannak.",
      domain: DOMAIN,
      parameters: {
        type: "object",
        properties: {
          page_id: { type: "string" },
          media_kind: {
            type: "string",
            enum: ["image", "video", "document", "other"],
          },
          limit: { type: "integer", default: 20, minimum: 1, maximum: 100 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        let q = sb
          .from("website_media")
          .select(
            "id, page_id, url, media_kind, mime_type, alt_text, width, height, ai_caption, ai_description, vision_status",
          )
          .order("created_at", { ascending: false })
          .limit(Math.min(Math.max(Number(args.limit ?? 20), 1), 100));
        if (args.page_id) q = q.eq("page_id", String(args.page_id));
        if (args.media_kind) q = q.eq("media_kind", String(args.media_kind));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return ok({ count: (data ?? []).length, media: data ?? [] });
      } catch (err) {
        return fail(err);
      }
    },
  );

  // ------------------------------------------------------------------
  // 10) website_crawl_status  — Owner only
  // ------------------------------------------------------------------
  registerTool(
    {
      name: "website_crawl_status",
      description:
        "Owner-only: a Website Knowledge crawl állapota — utolsó futások (trigger, status, pages, AI cost) + oldalak összesített darabszáma + entitás katalógus mérete.",
      domain: DOMAIN,
      allowed_roles: ["owner", "tulajdonos", "admin", "superadmin"],
      parameters: {
        type: "object",
        properties: {
          runs_limit: { type: "integer", default: 10, minimum: 1, maximum: 50 },
        },
      },
    },
    async (args, ctx) => {
      try {
        const sb = ctx.supabaseUser;
        const runsLimit = Math.min(Math.max(Number(args.runs_limit ?? 10), 1), 50);
        const [runsRes, pagesCountRes, entCountRes] = await Promise.all([
          sb
            .from("website_crawl_runs")
            .select(
              "id, trigger, status, started_at, finished_at, pages_crawled, pages_updated, pages_skipped, pages_failed, ai_jobs_total, ai_cost_usd, error_message, metadata",
            )
            .order("started_at", { ascending: false })
            .limit(runsLimit),
          sb.from("website_pages").select("id", { count: "exact", head: true }).eq("is_active", true),
          sb.from("website_entities").select("id", { count: "exact", head: true }),
        ]);
        return ok({
          runs: runsRes.data ?? [],
          pages_total: pagesCountRes.count ?? 0,
          entities_total: entCountRes.count ?? 0,
        });
      } catch (err) {
        return fail(err);
      }
    },
  );
}