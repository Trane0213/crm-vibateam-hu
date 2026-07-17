
# AI OS — Egységes hibakezelési szabvány (E1)

Cél: minden AI OS tool (Google Ads, CRM, Website Knowledge, KG, később GA4/GTM/Search Console) **ugyanazt** a strukturált hibaformátumot adja vissza. A runtime a hibakódok alapján dönt retry-ról vagy továbbadásról. Az LLM soha ne kapjon olyan szabad szöveget, amely önmagában végkövetkeztetést sugall ("nincs kapcsolat").

Ez tisztán infrastrukturális változás. **Michael promptját ebben a körben NEM módosítjuk** — az a következő lépés lesz, ha a tool + runtime réteg stabil.

## Hatókör

Érintett fájlok:
- `src/lib/ai-os/types.ts` — új típusok (`ToolError`, `ToolResult`, `ErrorType`)
- `src/lib/ai-os/tool-errors.ts` — **új**, központi hiba-taxonómia + `toolError()`, `wrapUnknownError()` helperek
- `src/lib/ai-os/runtime.server.ts` — retry logika + hiba-normalizáció a `tool.execute` körül
- `src/lib/ai-os/adapters/google-ads-tools.server.ts` — `fail()` cseréje `toolError()`-re, `loadConnection`/HTTP hibák osztályozása
- `src/lib/ai-os/adapters/crm-tools.server.ts` — ugyanaz
- `src/lib/ai-os/adapters/kg-tools.server.ts` — ugyanaz
- `src/lib/ai-os/adapters/website-tools.server.ts` — ugyanaz
- `src/lib/google-ads/client.server.ts` — `loadConnection`, `resolveCustomerId`, `gaqlSearch`, `listAccessibleCustomers` tipizált hibákat dobjanak (nem magyar mondatot)
- audit-view érintetlen; a `logStep` már fogadja az `error` mezőt.

Michael prompt, más agent promptok, DB, RLS — NEM változik.

## A hibaobjektum egységes alakja

Minden tool ezt adja vissza siker/hiba esetén:

```ts
type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ToolError };

type ToolError = {
  error_type: ErrorType;              // gépi kód, ld. taxonómia lentebb
  retriable: boolean;                 // a runtime automatikusan újrapróbálja-e
  user_safe_message: string;          // rövid magyar mondat, ezt idézheti az LLM
  technical_reason: string;           // eredeti hibaüzenet / HTTP status / stack — auditba
  http_status?: number;               // ha upstream HTTP hiba
  hint?: string;                      // opcionális agent-nak szánt hint (pl. "hívd list_ads_accounts-ot")
};
```

## Hiba-taxonómia (`ErrorType`)

Domain-független, minden adapter ezt használja:

```text
CONNECTION_MISSING       nincs mentett integráció (pl. Google Ads soha nem kötve)
CONNECTION_READ_FAILED   supabase/DB hiba a kapcsolat olvasásakor  (retriable)
AUTH_EXPIRED             refresh token hiányzik/lejárt
CONFIG_MISSING           pl. active_customer_id NULL, dev token secret hiányzik
INVALID_INPUT            args validation, UUID formátum stb. (retriable=false)
NOT_FOUND                a keresett entitás nem létezik (nem hiba, csak üres)
UPSTREAM_UNAVAILABLE     upstream 5xx / timeout / hálózat  (retriable)
UPSTREAM_RATE_LIMIT      429 / quota  (retriable, backoff)
UPSTREAM_FORBIDDEN       403 (nem retriable)
UPSTREAM_ERROR           4xx egyéb (nem retriable)
INTERNAL                 nem várt exception a tool execute-ban (retriable=false)
```

A `retriable` flag a taxonómiából jön, nincs adapter-szintű döntés.

**Kulcsszabály:** a `user_safe_message` szövegében **TILOS** olyan mondat, amely az egész integráció állapotára vonatkozó végkövetkeztetést sugall. Pl. TILOS: *"Nincs mentett Google Ads kapcsolat."* Helyette: *"A Google Ads kapcsolat olvasása most sikertelen volt."* (retriable) vagy csak `CONNECTION_MISSING` kóddal a `list_ads_accounts` explicit hívása után. A "nincs kapcsolat" **állítás jogát** csak a `list_ads_accounts` sikeres, üres eredménye adja meg.

## Runtime változás (`runtime.server.ts`)

Az execute-blokk (289–298. sor) helyett:

1. `tool.execute` normál hívás.
2. Ha visszaadott `{ ok: false, error }` és `error.retriable === true`: max **2 retry**, backoff 250 ms → 750 ms. `UPSTREAM_RATE_LIMIT` esetén hosszabb (750 → 2000 ms).
3. Ha `tool.execute` **dob** (nem catch-elte az adapter): `wrapUnknownError(e)` → `INTERNAL` (nem retriable) VAGY `UPSTREAM_UNAVAILABLE` ha network jellegű (retriable, 2 retry).
4. A retry-okat `logStep(kind: "retry", ...)` logolja külön lépésként, hogy az audit-view megmutassa.
5. Végső eredmény az LLM-hez: **csak** `{ error_type, user_safe_message, hint? }` — a `technical_reason` NEM megy az LLM kontextusába, csak az auditba. Így a modell nem tud "megtanulni" upstream szövegeket idézni.

Kompatibilitás: a jelenlegi `{ ok: false, error: string }` alak eltűnik. Mivel egyetlen fogyasztó a runtime + audit, nincs külső hívó fél. Az `agent_run_steps.output_json` mezőbe a strukturált objektum kerül — az audit-view enhance-e triviális.

## Adapter migráció mintája

Régi:
```ts
function fail(err: unknown) { return { ok: false, error: String(err) }; }
// ...
} catch (e) { return fail(e); }
```

Új (helper a `tool-errors.ts`-ben):
```ts
} catch (e) { return toolError.fromException(e, { tool: "get_campaign_performance" }); }
```

A `fromException` felismeri:
- Postgres hibák (`PGRST…`, RLS) → `CONNECTION_READ_FAILED` retriable
- Fetch `TypeError` / `AbortError` → `UPSTREAM_UNAVAILABLE` retriable
- HTTP status kódok (a `client.server.ts` `throw new Error("... HTTP 500: ...")`-ból): parseoljuk a statust
- ismert magyar szentinel üzeneteket (`loadConnection` "Nincs mentett…") → `CONNECTION_MISSING`

Ezenkívül minden adapter aktívan is dobhat: `throw toolError.invalidInput("customer_id nem numerikus")`.

A `client.server.ts` `loadConnection` / `resolveCustomerId` refaktora: sima `Error` helyett új `ToolFailure extends Error` osztály (`error_type` mezővel). Az adapterek ezt átengedik, a `fromException` felismeri és 1:1-ben átemeli.

## Nem változik

- Tool registry API (`registerTool`, `ToolSpec`)
- Approval / dry_run gépi állapot
- Agent domain/role hozzáférés-ellenőrzés
- Michael és minden más agent system prompt
- DB séma, RLS, agent_runs / agent_run_steps
- Audit UI logikája (csak a megjelenítés kap egy `error_type` badge-et opcionálisan)

## Kimeneti kritériumok

- `bunx tsgo --noEmit` zöld.
- `bun run ai:acceptance` zöld (nem érintjük az elfogadási invariánsokat).
- Manuális ellenőrzés: az `/settings/agent-audit`-ban egy Michael futás lépéseinél `error_type` mező látszik a hibás lépéseknél.
- A 4 adapter mindegyikében **zéró** `{ ok: false, error: "..." }` string mintázat.

## Nem szerepel ebben a lépésben

- Michael prompt módosítása (következő kör: "Egyszeri tool-hiba ≠ nincs kapcsolat" szabály; erre külön mennénk rá, ha ez a réteg stabil).
- Új READ toolok (list_negative_keywords, get_auction_insights stb.).
- GA4 / GTM / Search Console adapterek — nem léteznek még, csak a szabvány készül fel rájuk.

Így haladhatunk?
