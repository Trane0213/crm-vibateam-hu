# Sales Ma végleges elrendezés – 2026-11-03

## Hatókör
Sales Ma megjelenítése és a szükséges, csak olvasó adatok. Nincs migráció, SQL, adatírás, szerepkörváltás, ügyfélkapcsolatfelvétel vagy publikálás.

## Eredmények
- PASS: négy fő HeroStat KPI: saját Pipeline előtti leadek, saját aktív Pipeline leadek, aktuális saját `sent`/`negotiation` ajánlatok, saját megnyert leadek.
- PASS: a piszkozat, korábbi ajánlatverzió, ismeretlen és lezárt ajánlatállapot nem számít nyitott kiküldött ajánlatnak.
- PASS: a napi fókusz a meglévő `useDailyWork` Budapest-besorolásából számol. A holnap/később kártya a meglévő teendőoldal Holnap nézetét nyitja; a Később fül ott elérhető.
- PASS: prioritás szerinti egyszeri megjelenítés csak a Sales Ma kompakt listájában; az eredeti napi bucketek, tulajdonosi lista és teendőoldal alapnézete nem változott.
- PASS: ügyfél neve (ha elérhető), ügy összefoglalója, magyar következőlépés-típus, budapesti határidő, hiányzó adat és közvetlen lead-munkafelület link.
- PASS: gyorsbelépők az előkészítéshez, Pipeline-hoz, a meglévő tényleges ajánlatkezeléshez és teendőkhöz. Megnyert KPI a meglévő Pipeline-áttekintéshez vezet.
- PASS: lekérdezési hibánál `!` és magyar hibajelzés, nem hamis nulla.
- PASS: 99/99 Vitest (17 fájl, 3 új szabályteszt); AI acceptance 12/12; automatikus fordítás `build OK`.
- PASS, mesterséges böngészős adatokkal: 1280×1800 asztali, 390×844 mobil, nincs oldalirányú túlcsordulás vagy futásidejű hiba. Előkészítés=2, Pipeline=1, nyitott ajánlat=1, megnyert=1; három lead pontosan egyszer jelenik meg. Mai kártya `/sales/todo?bucket=today` navigációja sikeres. Hibás lekérdezés külön ellenőrizve. Nincs hálózati adatírás.
- NOT TESTED: élő bejelentkezett Sales-fiók számlálóinak egyezése az éles rekordokkal; külső Supabase miatt biztonságos munkamenet nem áll rendelkezésre. A mesterséges böngészős próba nem éles szerepköri E2E.

## Érintett alkalmazásfájlok
- `src/components/today/sales-home.tsx`
- `src/components/today/sales-worklists.tsx` (Sales Ma opt-in compact nézet)
- `src/lib/sales/use-daily-work.ts` (ugyanazon saját lekérdezés kiegészítése megnyert számmal és cégnevekkel; owner ág változatlan)
- `src/lib/sales/daily-work.ts` (kizárólag megjelenítési összesítés és prioritás szerinti szűrés; meglévő dailyWork változatlan)
- `src/lib/sales/daily-work.test.ts`

Technikai szabály és feladatállapot: `AGENTS.md`, `roadmap.md`. Nincs új dizájnrendszer vagy párhuzamos Sales-funkció. Timothy nem került vissza. Marketing, owner és PM oldalak forrásai nem módosultak.

## Visszaállítás és átadás
Visszaállítható az öt alkalmazásfájl korábbi verziójára; adat-visszaállítás nem szükséges. Frontend publikálás nem történt. STOP: további modulfejlesztés nem indul.