AI OS — Knowledge Graph + Website Knowledge (technikai terv v5)

Az M7 mostantól két különálló modul, két külön sprint-sorozattal:

A) Knowledge Graph modul — a teljes AI OS központi tudásrétege. Domain-független, önálló élettel. Nem tud semmit se a website-ról, se a CRM-ről; csak node-okat, éleket, relációkat és típusokat kezel.

B) Website Knowledge modul — az első publisher a Knowledge Graph felé. Ugyanúgy publisher lesz később a CRM, Google Ads, GA4, Clarity, Számlázás, Dokumentumok, Email, Calendar, NexoHabit, Mennyibe.hu stb.

Egyszerre EGY funkció szabály tartva. Először a Knowledge Graph csontváz (A), utána a Website Knowledge (B), amely már használja.

A) Knowledge Graph modul (src/lib/knowledge-graph/)

A.1 Cél és hatókör

Egy közös, domain-független gráf-tudásréteg. Bármely AI ügynök (George, Scarlet, Timothy, Boss, Michael) és bármely jövőbeli üzleti modul (Website, CRM, Ads, GA4, Clarity, Számlázás, Dokumentumok, Email, Calendar, NexoHabit, Mennyibe.hu) egyaránt olvassa és publisher-ként írja.

Nem tulajdonol adatot — csak hivatkozásokat (ref_table + ref_id) és kapcsolatokat. Az igazság a forrás-modulokban él.

A.2 Modul-felépítés

src/lib/knowledge-graph/

  ├── types.ts                    # Node/Edge/Relation TS típusok, kind enumok utility-jei

  ├── registry.server.ts          # publisher-regiszter: melyik modul milyen kind-okat publikál

  ├── nodes.server.ts             # upsertNode / getNode / deleteNode

  ├── edges.server.ts             # upsertEdge / deleteEdge / findEdges

  ├── projector.server.ts         # projectFromSource(kind, payload) — publisher belépési pont

  ├── kg.functions.ts             # server functions: kg_get_node, kg_find_related, kg_stats

  └── adapters/

        └── (üres — a publisherek nem itt élnek, hanem a saját moduljuk mellett)

A publisherek NEM a knowledge-graph alatt élnek. Minden domain-modul (Website, CRM, Ads, …) a saját mappájában tart egy *-kg-publisher.server.ts fájlt, ami hívja a knowledge-graph/projector.server.ts-t. Így a KG modul semmit sem tud a domain-modulokról — a függés irány mindig domain → knowledge-graph, soha nem fordítva.

A.3 Adatmodell (új Supabase táblák, public séma, RLS + GRANT)

Írás service_role. Olvasás authenticated. anon semmit.

kg_node_kinds — bővíthető típus-szótár

kind text pk, label text, description text nullable

owner_module text (pl. website | crm | ads | ga4 | clarity | billing | docs | email | calendar | nexohabit | mennyibe | ai_os) — informatív, ki a "publisher owner"

is_enabled bool default true

Kezdeti seed (M7-ben INSERT, üresen indul a legtöbb, csak deklarál):

website_page, website_entity, media_asset, pdf_document, blog_post, faq_item, reference_project, external_url, topic,

crm_lead, crm_project, crm_company, crm_contact, crm_quote, crm_followup, crm_email_thread,

google_ads_campaign, google_ads_ad_group, google_ads_ad, google_ads_keyword,

ga4_event, clarity_recording,

invoice, document, email_message, calendar_event,

nexohabit_habit, mennyibe_item,

ai_agent, ai_run, ai_tool_call.

kg_relations — bővíthető reláció-szótár

relation text pk, label text, description text nullable

inverse_relation text nullable fk → kg_relations.relation

default_direction text CHECK: directed | undirected

is_semantic bool default false

owner_module text (informatív), is_enabled bool default true

Kezdeti seed (M7-ben INSERT):

Strukturális: describes | mentions | links_to | contains_media | belongs_to_source | has_entity | has_version | derived_from | authored_by | assigned_to

Üzleti (deklarálva, üres): landing_of_campaign | target_of_ad | tracked_by_ga4_event | recorded_by_clarity | originates_lead | supports_project | billed_in_invoice | quoted_in | booked_in_calendar | related_to_habit

Szemantikus AI (deklarálva, üres): related_to | describes_same_service | predecessor_of | successor_of | supports | details | contradicts | supersedes

kg_nodes

id uuid pk

kind text fk → kg_node_kinds.kind

ref_table text nullable, ref_id uuid nullable, ref_uri text nullable

label text (cache)

metadata jsonb (kind-specifikus)

created_at, updated_at

UNIQUE(kind, ref_table, ref_id)

kg_edges

id uuid pk

from_node_id uuid fk → kg_nodes.id

to_node_id uuid fk → kg_nodes.id

relation text fk → kg_relations.relation

direction text CHECK: directed | undirected

weight numeric(4,3) nullable, confidence numeric(3,2) nullable

source text: manual | heuristic | ai_extraction | ai_vision | ai_semantic | crawl_link | import | domain_hook

origin_ref_table text nullable, origin_ref_id uuid nullable (pl. mely website_ai_jobs.id-ből származik — a KG nem FK-zza cross-table, ez laza pointer)

evidence jsonb nullable

valid_from timestamptz nullable, valid_to timestamptz nullable

metadata jsonb

created_at, created_by_user_id nullable

UNIQUE(from_node_id, to_node_id, relation)

kg_edge_history (előkészítve, üresen indul) — id, edge_id fk, changed_at, change_type (created|updated|deleted), previous_relation, previous_weight, previous_confidence.

kg_publishers — futásidejű regiszter, ki mikor publikált utoljára és mennyit

id uuid pk

module text (pl. website, crm), source_kind text (pl. landing, lead)

last_run_at timestamptz

nodes_upserted int, edges_upserted int, edges_removed int

status text, error_message text nullable

Ez adja a jövőbeli "Publisher health" UI-t.

A.4 RLS

authenticated → SELECT minden kg_* táblára (közös tudás).

service_role → ALL.

anon → semmi.

A.5 API (server-side + AI OS)

src/lib/knowledge-graph/nodes.server.ts:

upsertNode({ kind, ref_table?, ref_id?, ref_uri?, label, metadata? })

getNodeByRef({ kind, ref_table, ref_id })

deleteNodeAndEdges({ node_id }) — soft cascade

src/lib/knowledge-graph/edges.server.ts:

upsertEdge({ from_node_id, to_node_id, relation, ...opts })

syncEdges({ from_node_id, relation, target_node_ids: uuid[], source }) — idempotens: ami már ott van marad, ami hiányzik jön, ami plusz megy

deleteEdges({ from_node_id?, to_node_id?, relation? })

findEdges({ node_id, relation?, direction?, limit? })

src/lib/knowledge-graph/projector.server.ts:

projectFromSource({ module, source_kind, run_id?, batch: NodePayload[] }) — publisherek egységes belépési pontja, kg_publishers sort ír run végén.

Server functions (src/lib/knowledge-graph/kg.functions.ts):

kg_get_node({ kind, ref_id?, ref_uri? }) — node + közvetlen szomszédok relációnként.

kg_find_related({ kind, ref_id, relation?, direction?, limit? }) — 1-hop.

kg_stats() — node/edge count kind/relation szerint (Owner-only UI-hoz).

AI OS tool domain: kg — a nodes.server és edges.server függvényekre épülő READ toolok. Minden agent kap hozzáférést a kg domainhez:

kg_get_node, kg_find_related — mindenki

kg_stats — Owner-only (allowed_roles: ['owner']).

Prompt-kiegészítés minden agenthez: "Ha összefüggést keresel (mi kapcsolódik mihez, milyen kampányhoz tartozik egy landing, milyen leadek jönnek egy oldalról), hívd a kg_ toolt."*

A.6 Sprint felosztás — Knowledge Graph

KG-1 — Adatmodell + seed + read toolok

SQL migráció: kg_node_kinds, kg_relations, kg_nodes, kg_edges, kg_edge_history (üres), kg_publishers. RLS + GRANT. Seed INSERT-ek a fenti listákkal.

nodes.server.ts, edges.server.ts, projector.server.ts implementáció (tesztek nélkül a Lovable szabály szerint).

kg.functions.ts server function-ök.

AI OS: src/lib/ai-os/adapters/kg-tools.server.ts — 3 READ tool regisztráció a kg domainbe.

Bootstrap regisztráció.

Agent tool_domains bővítés minden interaktív agentnek (george, scarlet, timothy, boss, michael).

KG-2 — Owner "Publisher health" oldal

src/routes/_authenticated/settings.knowledge-graph.tsx (Owner-only).

Nézetek: kind eloszlás (kg_stats), reláció eloszlás, publisher-lista utolsó futással, node keresés (kind + label), 1 node "szomszéd" nézet.

Ez lezárja a KG modult. Utána indul a Website Knowledge, ami már publisher.

B) Website Knowledge modul (src/lib/website-knowledge/)

B.1 Cél és hatókör

A vibateam.hu tartalmának automatikus indexelése, verziózása, AI-összefoglalása és entitás-kinyerése. Publisher a Knowledge Graph felé — minden változás után csomópontokat és éleket publikál.

Az architektúra készen áll képek (Vision AI), dokumentumok (PDF stb.) későbbi bevonására, és üzemeltetési telemetriára.

B.2 Modul-felépítés

src/lib/website-knowledge/

  ├── crawler.server.ts            # sitemap fetch, HTML parse, hash, verzió + change

  ├── summarizer.server.ts         # gpt-4o-mini strukturált JSON (summary + entities)

  ├── ai-pricing.ts                # modell-tarifák a website_ai_jobs költséghez

  ├── kg-publisher.server.ts       # →  knowledge-graph/projector.server.ts hívása

  ├── refresh.functions.ts         # Owner-only manuális refresh server fn-ek

  └── (routes: /api/public/website-knowledge/netlify-webhook.ts)

A kg-publisher.server.ts az egyetlen fájl, ami a knowledge-graph-tól függ — a többi modul nem is tudja, hogy létezik a gráf.

B.3 Adatmodell (v4 változatlan, kivéve: nincs KG-tábla itt)

Minden website_* tábla úgy marad, ahogy v4-ben terveztük:

website_sources, website_pages (asset_kind), website_page_versions, website_page_changes, blokk-táblák, website_page_summaries, website_entities, website_page_entities, website_media (Vision-ready mezőkkel), website_media_entities, website_crawl_runs, website_ai_jobs.

Amit kihagyunk: website_page_links és minden kg_* tábla — ez utóbbiak most a Knowledge Graph modulhoz tartoznak.

RLS változatlan: authenticated SELECT, service_role ALL, anon semmit.

B.4 Crawl folyamat

Változatlan v4-hez képest, két új lépéssel a végén:

Netlify deploy ─▶ webhook ─▶ website_crawl_runs

                                │

                                ▼

                     oldalanként:

                       ├─ fetch + hash + SKIP/verzió/diff

                       ├─ blokkok újraírása

                       ├─ website_media UPSERT

                       ├─ AI summary + entity extraction

                       ├─ website_ai_jobs INSERT

                       │

                       ▼

                     kg-publisher.server.ts.publishPageChange(page_id)

                       └─ projectFromSource({ module: 'website',

                                              source_kind: 'landing',

                                              run_id, batch })

                            ├─ node upsert: website_page, website_entity

                            └─ edge sync:  has_entity, links_to

A publisher idempotens és determinisztikus — bármikor újrafuttatható, ugyanazt az állapotot állítja elő. Kézi backfill: Owner UI-n "Rebuild KG projections" gomb (KG-2-ben ez már megvan a Publisher health oldalon, itt nem kell duplikálni).

B.5 AI OS integráció

Új domain: website.knowledge — 10 READ tool (változatlan v4-hez):

website_search_pages, website_get_page, website_list_pages, website_get_summary, website_search_by_entity, website_list_entities, website_get_page_history, website_get_page_diff, website_list_media, website_crawl_status (Owner-only részletek).

Agentek: mindenki kap website.knowledge domaint. A kg domain már a KG modulból regisztrálódott, így egy website-kérdésre az agent szabadon kombinálhatja a website_* és a kg_* toolokat (pl. "listázd a szolgáltatás-oldalakat és mutasd, melyikhez tartozik kampány" — ma az utóbbi rész üres eredményt ad, de a hívás alakja már működik).

Michael M4.5 Business Decision Layer változatlan.

B.6 Manuális refresh (Owner only) + settings UI

Változatlan v4-hez:

refreshCurrentPage, refreshPages, refreshEntireWebsite, getLatestRun, listRuns, getRunDetails, listPages, getPageHistory, getPageDiff.

src/routes/_authenticated/settings.website-knowledge.tsx — status, run history (AI cost oszlopok), oldalanként Refresh, batch, entire, oldal-előzmények + diff, entity browser.

B.7 Netlify

Változatlan: outgoing webhook (Deploy succeeded) → https://crm-vibateam-hu.lovable.app/api/public/website-knowledge/netlify-webhook, secret: NETLIFY_WEBHOOK_SECRET.

B.8 Sprint felosztás — Website Knowledge

WK-1 — Adatmodell + webhook csontváz

SQL migráció csak a website_* táblákra. RLS + GRANT.

Public webhook route HMAC-cal, run insert. Crawler stub. kg-publisher.server.ts stub (üres call).

Owner-only settings oldal placeholder + run listázás.

WK-2 — Crawler + verziókezelés + diff + media metaadat

Sitemap, linkedom parse, blokk-extractors, website_media alt UPSERT.

Hash + verzió + change insert.

Settings oldal: run history, page-lista, page history + diff.

WK-3 — AI summary + entity extraction + AI jobs telemetria

gpt-4o-mini strukturált JSON, két hívás/oldal.

website_ai_jobs minden hívásra, website_crawl_runs AI aggregátumok.

Settings oldal: summary preview, entity browser, run breakdown.

WK-4 — KG publisher bekötése

kg-publisher.server.ts élesítése: page + entity node UPSERT, has_entity és links_to edge sync.

kg_publishers sort ír minden crawl végén.

Settings oldalon "Utolsó KG publikáció" mini-státusz.

WK-5 — Manuális refresh (Owner)

Server function-ök + UI: per-page/batch/entire refresh, jogosultság-check.

WK-6 — Website AI OS toolok + agent hozzáférés

website-tools.server.ts (10 READ tool). Bootstrap regisztráció.

Agent tool_domains bővítés website.knowledge-dzsel + rövid prompt-kiegészítés minden agentnek.

Végrehajtási sorrend

KG-1 — Knowledge Graph csontváz (tábla, kg-tools, agentek).

KG-2 — Owner Publisher health UI.

WK-1 — Website adatmodell + webhook csontváz.

WK-2 — Crawler + verziózás.

WK-3 — AI summary + entity + telemetria.

WK-4 — Website → KG publisher élesítés.

WK-5 — Manuális refresh Owner UI.

WK-6 — Website AI OS toolok + agent hozzáférés.

Minden sprint után jóváhagyás, csak utána indul a következő.

Amit nem csinálunk M7-ben

Vision AI feldolgozás (séma áll csak készen).

PDF/dokumentum crawler (asset_kind + website_sources.kind áll csak készen).

Nem-website publisherek (CRM, Ads, GA4, Clarity, Számlázás, Docs, Email, Calendar, NexoHabit, Mennyibe) — a KG oldal fogadókész, de a saját moduljaik saját sprintjeikben kötnek be.

AI szemantikus reláció-generátor (related_to, describes_same_service, predecessor_of stb.) — reláció-katalógus deklarálva, tölteni későbbi AI job fogja.

Gráf-vizualizáció (D3/Cytoscape) — adat rendelkezésre áll, UI külön kérdés.

Embedding / vector search.

AI cost dashboard — adat kész, UI külön sprint.

Kompatibilitás M1–M6-tal

Nem érinti a runtime.server.ts, agents.ts Michael prompt, Google Ads toolok, CRM toolok viselkedését. Két új domain (kg, website.knowledge) + agent tool_domains bővítés.

Nem vezet be új runtime infrastruktúrát.

ai_memory érintetlen.

Későbbi CRM/Ads publisherek additívek lesznek: minden domain-modul kap egy *-kg-publisher.server.ts-t a saját mappájában, ami hívja a knowledge-graph/projector.server.ts-t. A KG modul soha nem függ vissza.

Kockázatok

KG modul stabilitása kritikus: mivel minden későbbi publisher rá épül, a projectFromSource és syncEdges szerződését KG-1-ben véglegesíteni kell. Változtatás cascade-elne minden publisherre.

KG edge robbanás: nagy site + jövőbeli CRM/Ads → százezres edge. Indexek: (from_node_id, relation), (to_node_id, relation), (relation). Nagyságrend M7 végén 5–15k edge — semmi ijesztő.

Cross-table ref_id konzisztencia: nem FK. Szabály: minden publisher felelős a saját node-jainak "temetéséért" (deleteNodeAndEdges) hard-delete-nél. Website-nál nincs hard-delete (csak is_indexable=false), így M7-ben nem érint.

Duplikált node: UNIQUE(kind, ref_table, ref_id) biztosítja, az UPSERT idempotens.

Publisher széttöredezés: minden új publisher kötelezően a projector.server.ts.projectFromSource-t hívja, egyéb közvetlen kg_nodes INSERT tiltott (kódszabály). Így egy helyen látszik minden publikáció + kg_publishers audit.

Linkedom node-only globals → fallback regex extractor (Website oldal).

AI költség → website_ai_jobs monitorozza.

Netlify duplikált webhook → netlify_deploy_id dedup.