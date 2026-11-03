# Timothy V3.0 P2 — napi munkaszervezés

## Megvalósult
- A Sales Ma áttekintése és napi listája között kompakt Timothy-blokk, legfeljebb öt kiemelt saját ügy, tényszerű prioritási indoklás, első teendő, közvetlen `/leads?lead=<id>` munkafelület-link. A feltöltött P2/A kifejezett kérését hajtja végre, nem általános UI-újrarendezés.
- `load-daily-work.ts` közös betöltő a meglévő useDailyWork-ból kiemelve. Saját/csapat scope, dailyWork/salesFocusSections, **Europe/Budapest** nap, stable ID lapozás és hibakezelés. Nem új számítás. Lejárt→mai→új→ajánlatra váró→hiányos sorrend változatlan; P2 nem tekinti a várakozó státuszt igazolt megválaszolatlanságnak. Nem pontoz bizonyíték nélküli pénzügyi érték alapján.
- A strukturált aktuális számlálókat/ügyeket a CRM adja; az AI kizárólag rövid Javaslatot ír a meglévő sales_briefing/runAgent/OpenAI gpt-4o-mini útvonalon. Nincs write-tool vagy végrehajtás. Modelldata maximum öt ügy, rövid név és mentett határidő; safeAudit titokszűrés. Érdemi modellminőség még nem ellenőrzött.
- Sales Ma, owner Ma és dashboard Sales módja közös per-user budapesti napi automatikus kvótát használ. A régi Sales táblalistás snapshot elhagyva; módváltás nem újragenerál. Kézi Frissítés külön kérés. PM adatszámítás és feldolgozás változatlan.
- `ai_memory` privát `system:daily-sales:` rendszerkulcs; csak service_role RPC foglalás/lezárás, namespace trigger, futási token és 5 perces lease. Automatikus kvóta a modellhívás előtt elfogy, hiba/ismeretlen futás nem nyitja újra. A napi cache olvasása nem exponál futási tokent. Általános getMemory és memory_read kizárja a rendszersorokat.
- Friss adatlenyomat, készítési idő; változott adatoknál régi javaslat rejtve. Ha egy ügy hozzáférése eltűnik, a lenyomatváltozás miatt régi kontextusszöveg nem jelenik meg. A strukturált napi ügyek továbbra is élők. Másik kérésben futó generálásnál a Sales kártya csak olvasást ismétel.
- Kézikönyvek, AGENTS és roadmap frissítve. Érintett Ma/index fejlécadatai ellenőrizve; dashboard hiányzó saját metaadatai pótolva.

## Adatbázis és visszaállítás
Éles migráció sikeres: csak a három P2 RPC és fenntartott memóriakulcs-névtér védelme. Nem módosult üzleti adat, Gmail-fiók, szerepkör vagy meglévő RLS policy; új tábla nincs. Éles read-only ellenőrzés: RPC-k owner=postgres, authenticated EXECUTE=false, service_role=true.

Hatás: `timothy-v3-P2-hatas-2026-11-03.md`; pontos SQL: `database/ai_os_daily_sales_P2_2026-11-03.sql`; rollback `database/rollback_ai_os_daily_sales_P2_2026-11-03.sql`. Rollback csak P2 függvényeket/trigger töröl; sorok megmaradnak.

## PASS / FAIL / NEM TESZTELT
| Ellenőrzés | Eredmény |
|---|---|
| Meglévő napi logika és célzott P2, teljes Vitest | PASS, 231/231 teszt, 32 fájl |
| AI acceptance | PASS, 5 agent / 16 forgatókönyv, 0 hiba |
| Automatikus build | PASS |
| Izolált SQL automatikus/másik user/kézi/eredeti token/újranyitás | PASS |
| 12 egyidejű automatikus kérésből pontosan egy foglalás | PASS |
| Kliens rendszerkulcs létrehozás/átnevezés/törlés tiltása; közönséges memóriaírás | PASS |
| Lejárt lease nem indít új automatikus futást | PASS |
| Izolált rollback, 4 mesterséges sor megőrzése | PASS |
| Mesterséges böngészős Sales kártya, 3 konkrét link, számlálók, Frissítés hibajelzés | PASS; AI endpoint blokkolva, nincs üzleti írás |
| Desktop és mobil képernyő / túlcsordulás / runtime | PASS, nincs pageerror vagy horizontális túlcsordulás |
| Hitelesített Sales/owner, valódi RLS+modell napi futás, cache, kézi refresh | NEM TESZTELT: external_unmanaged Supabase, nincs átadható biztonságos munkamenet |
| Modell javaslat pontosság, prompt-injection éles/adversarial értékelés | NEM TESZTELT; nincs tényleges modellfuttatás |

Izolált SQL futtatás: scratch DB-ben, ahol postgres szerep még nincs, `database/tests/daily_sales_P2.sql`; concurrency kísérlet külön 12 kapcsolatban. A scratch adatbázist leállítottuk, éles DB-t tesztírás nem érintette.

A migráció jelzett 16 korábbi biztonsági megállapítást (RLS policy nélküli tábla, search_path, extension, végrehajtási grantok, jelszóvédelem). A migráció nem hozott új findingot; a korábbiakat ebben a szakaszban nem módosítottuk. A quote_requests nulla klienspolicyja szándékos és nem lazítandó.

**STOP: nincs publikálás, nincs levélküldés, nincs éles üzleti adatírás. P3–P5 nem indult. P2 nem tekinthető teljesen élesben igazoltnak a nyitott hitelesített kapu miatt.**