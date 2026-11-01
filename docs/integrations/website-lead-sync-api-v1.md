# Weboldal → CRM ajánlatkérés-szinkron – API-szerződés v1 (2026-11-01)

Átadandó a weboldal (439085e1-…) fejlesztő ügynöknek. Jelszót/titkot ez a dokumentum nem tartalmaz.

## Végpont
`POST https://crm-vibateam-hu.lovable.app/api/public/website-lead-sync`
(stabil: `https://project--c28aaa72-1357-49f9-a9b5-5ba88a13e08f.lovable.app/api/public/website-lead-sync`)

## Hívás helye – KÖTELEZŐ
- KIZÁRÓLAG a weboldal saját szerveroldali `send-quote-email` edge functionjéből, **miután** a saját `public.leads` sor sikeresen elmentődött (`lead_saved=true`, `lead_id` ismert).
- SOHA nem a böngészős React kódból (a titok nem kerülhet a kliens bundle-be).
- A CRM hívás hibája NEM akaszthatja meg a felhasználói választ és az e-mail küldést; hiba esetén a weboldali lead „nem szinkronizált”-ként jelölhető és később újraküldhető.

## Titok
- Név mindkét projektben: `VIBA_WEB_CRM_SYNC_SECRET` (min. 32 karakter, pl. `openssl rand -hex 32`).
- Ugyanazt az értéket a tulajdonos teszi be: CRM és weboldal → Project Settings → Secrets. Chatbe, kódba nem.

## Hitelesítés
```
ts  = aktuális unix idő másodpercben (string)
sig = hex(HMAC_SHA256(VIBA_WEB_CRM_SYNC_SECRET, ts + "." + rawBody))
Fejlécek:
  Content-Type: application/json
  X-Viba-Timestamp: <ts>
  X-Viba-Signature: sha256=<sig>
```
- Az aláírás a pontosan elküldött nyers body-ra vonatkozik (ugyanazt a stringet küldd, amit aláírtál).
- ±300 mp időeltérés felett elutasítva (replay védelem). Retrynál új ts + új aláírás kell.

Deno példa (edge function):
```ts
const raw = JSON.stringify(body);
const ts = String(Math.floor(Date.now() / 1000));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(Deno.env.get("VIBA_WEB_CRM_SYNC_SECRET")!),
  { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${raw}`));
const sig = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
const res = await fetch(CRM_URL, { method: "POST", body: raw,
  headers: { "Content-Type": "application/json", "X-Viba-Timestamp": ts, "X-Viba-Signature": `sha256=${sig}` } });
```

## Request body (JSON, max 64 KB; ismeretlen mező → elutasítás)
| mező | típus | kötelező | megjegyzés |
|---|---|---|---|
| lead_id | uuid | igen | a weboldali `public.leads.id` – idempotencia kulcs |
| created_at | ISO-8601 időzónával | igen | eredeti beküldési idő |
| source_type | alap: `lakossagi`\|`tarsashazi`\|`general`\|`kapcsolat`\|`visszahivas`\|`letoltes`\|`chat`; egyedi címke is: `^[a-z0-9][a-z0-9_-]{0,39}$` (pl. `cikk`) | igen | kisbetűsítve tárolódik |
| name, email, phone | string/null | legalább egy | `visszahivas`: phone kötelező, email elhagyható |
| source_page, origin_page, entry_page | string ≤500 | nem | relatív útvonal vagy URL |
| utm | objektum `{utm_source: "...", ...}` | nem | csak string értékek |
| project_type, property_type, budget, company_name, apartment_count | string | nem | |
| consent | boolean | nem | |
| message | string ≤10000 | nem | |
| attachment_path | string ≤300 | nem | **storage objektum-útvonal** (pl. `quote-attachments/2026/abc.pdf`). Tilos: `http(s)://` URL, public URL, signed URL, `..` |
| payload | objektum ≤32 KB | nem | teljes eredeti űrlap-adat, a CRM csak tárolja/megjeleníti |

## Válaszok
| HTTP | body | weboldal teendő |
|---|---|---|
| 201 | `{"status":"accepted","source_lead_id":"…","crm_id":"…"}` | szinkronizáltnak jelöl |
| 200 | `{"status":"duplicate","source_lead_id":"…","crm_id":"…"}` | szinkronizáltnak jelöl (már bent van, nem íródott felül) |
| 400 | `{"status":"error","code":"invalid_json"}` | hiba, ne retry |
| 401 | `code`: `missing_auth` / `invalid_signature` / `stale_timestamp` | konfighiba vagy óra; ne végtelen retry |
| 413 | `payload_too_large` | ne retry |
| 422 | `validation_failed` (+`details`) / `invalid_attachment` | ne retry, javítandó |
| 503 | `server_misconfigured` / `storage_error` | **retry** (backoff: 1 perc, 5 perc, 30 perc, 2 óra, majd napi) |
| egyéb / hálózati hiba / timeout | – | **nem sikeres**, retry |

Sikeresnek KIZÁRÓLAG a 201 `accepted` vagy 200 `duplicate` számít.

## Idempotencia
Ugyanaz a `lead_id` többször → egyetlen CRM sor; második hívásra `duplicate`. Retry és backfill ezért biztonságos.

## Backfill (történeti leadek)
Egyszeri szerveroldali script/edge function a weboldali projektben: a saját `public.leads` sorait `created_at` szerint lapozva (pl. 50/kör), soronként ugyanezzel a kéréssel elküldi. Az eredményt (accepted/duplicate/hiba) naplózza. Darabszámot a weboldal saját adatbázisából kell megállapítani. Futtatás előtt 1 TESZT sorral próbálni.

## Mit NEM szabad
- Titkot böngészőbe tenni; service_role kulcsot küldeni.
- CRM üzleti leadet közvetlenül létrehozni – a CRM ezt nem is teszi; a beérkezés a „Weboldali ajánlatkérések” listába kerül, onnan a Marketing minősít és ad át Salesnek.
- A weboldal `send-quote-email` meglévő e-mail-küldését / lead-mentését megváltoztatni (csak egy utólagos hívás kerül hozzá).

## Mit lát a CRM
„Weboldali ajánlatkérések” lista és részletoldal: forrás, név, elérhetőség, forrás-/belépő oldal, UTM, üzenet, csatolmány útvonala, weboldali lead ID, teljes eredeti adat. Megtekintés: owner, admin, projektvezető, marketing, sales.


## v1.1 (2026-11-01) – payload szűrés
A `payload` (pl. `request_intent`, `location`, `attachment_name`, `has_attachment`) JSONB-ben tárolódik, de a CRM eldobja: a secret/token/signature/password/api_key/authorization/cookie/signed/credential nevű kulcsokat, valamint az aláírt URL-nek vagy tokennek látszó szövegeket (`token=`, `signature=`, `X-Amz-`, JWT). Max. mélység 4, 100 kulcs, 50 tömbelem, 2000 karakter/szöveg.
