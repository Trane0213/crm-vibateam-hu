# Cégszintű marketingtiltás – célzott biztonsági kapu

A meglévő 0–5. terv következő hiányának lezárása, nem új rendszerterv. Az adatlap–kampány kapcsolódás és szálmegnyitás már elkészült; a többi nyitott feladat a meglévő roadmapben marad.

## Kért működés
- A meglévő cégadatlapon tulajdonos és marketinges kötelező indokkal letilthatja a cég hideg marketingmegkeresését. Feloldás kizárólag tulajdonosnak.
- Minden jelenlegi és később felvett kontaktjára érvényes; címtiltás és hibás email külön marad.
- Kampányba ellenőrzési/kizárási céllal továbbra kijelölhető, de előellenőrzése „Cégszintű marketingtiltás”. A későbbi ütemezett küldés ugyanebből a cégállapotból ellenőriz.
- Dokumentumok, emailek, normál szerződéses/ügyfélszolgálati levelezés, Sales és ajánlat működés változatlan. Nincs ügyfélküldés vagy automatikus publikálás.

## Technikai megvalósítás és hatás
- A meglévő companies táblán nullable tiltás/indok/felelős/szerveridő/revízió mezők; nincs új cégtábla és nincs backfill. Meglévő sorok üzleti értékei nem változnak.
- Hitelesített, felhasználói RLS-es tranzakciós RPC: cég láthatósága, Owner/Marketing szerep, Owner-only feloldás, révíziós ütközésvédelem, szerveridő és atomic activities audit.
- Trigger tiltja a védett tiltásmezők közvetlen Data API módosítását minden kliensútvonalon. Meglévő companies RLS és más mezők szerkesztése nem bővül.
- Saját jogosultságú readback igazolja a mentést; közös előellenőrzés és saját céges adatlap újrahasználva.

## Visszaállítás és tesztek
- Az alkalmazás előtt külön SQL-javaslat és rollback fájl, aktuális constraint/trigger/grants ellenőrzése. Nincs éles üzleti tesztírás.
- Visszaállítás: RPC execute visszavonásával írás felfüggesztése, előző alkalmazásút visszaállítása; megőrzött tiltási mezők és audit nem törlődnek. Aktív tiltás mellett küldést tilos a rollbackkel újra engedélyezni.
- Izolált PostgreSQL: Owner/Marketing tiltás, Sales/PM/közvetlen írás elutasítás, Marketing feloldás elutasítás, párhuzamos revision és audit rollback, új kontakt tiltása. Célzott Vitest + meglévő CRM regresszió.
- Éles hitelesített végigpróba továbbra NEM TESZTELT a külső Supabase miatt; sem kerülőút, sem jelszókérés nincs.

**Jóváhagyás tárgya:** kizárólag ez a minimális séma és védett írási szabály; nem történeti átkötés, szerepkör-bővítés, kampányindítás vagy publikálás. A többi engedélyezett feladat utána ugyanabban a folyamatos végrehajtásban halad.