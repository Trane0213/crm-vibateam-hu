# VIBA CRM – 1/C R2 dokumentumvédelem – jelentés (2026-10-30)

## Visszaállítás
Eredeti fájlok: `docs/rollback/1C-2026-10-30/` (r2.functions.ts, r2-upload.ts, document-manager.tsx, company-document-manager.tsx, email-composer.tsx, send.ts). Visszamásolással azonnal visszaáll. Adatbázis és meglévő R2-fájlok nem változtak.

## Módosított / új fájlok
- `src/lib/r2.functions.ts` – minden függvény bejelentkezéshez kötött; letöltési link csak olyan kulcsra, amelyhez a hívó a saját jogosultságával lát dokumentum- vagy mellékletrekordot; tetszőleges kulcsú feltöltési link és tetszőleges kulcsú törlés megszűnt; új `r2DeleteDocument`: rekord törlése jogosultsággal → fájl törlése csak utána, és csak ha más rekord nem hivatkozik rá.
- `src/routes/api/r2-upload.ts` – bejelentkezés, szerepkör (1/B szerint), projekt/cég létezése és láthatósága, kategória, méret (50 MB / levélmelléklet 20 MB), típus (kiterjesztés + MIME), a kulcsot a szerver állítja elő egyedi azonosítóval (felülírás kizárva).
- `src/lib/r2-policy.ts` (+ teszt) – közös szabályok.
- `src/routes/api/gmail/send.ts` – csak a küldő saját kimenő mellékletkulcsa csatolható (más dokumentum levélben nem kiszivárogtatható).
- Dokumentumkezelők, levélíró – az új feltöltési/törlési útvonal használata.

## Tesztek
- Unit: 35/35 (köztük 6 új R2-szabály teszt). AI acceptance 12/12. Build OK.
- Névtelen: feltöltés 401, hamis tokennel 401; letöltési link, törlés, állapot lekérés: elutasítva.
- Szerepkörök: a letöltés/törlés jogosultsága az 1/B adatbázis-szabályokon múlik (265/265 szerepkörös teszt); a feltöltési szerepkör-lista unit teszttel ellenőrzött. Élő bejelentkezett próba szerepkörönként nem futott (nincs biztonságos teszt-session).

## Fennmaradó kockázatok
- A feltöltés után a rekord mentése külön lépés; ha az elutasítva lenne, árva fájl maradhat (adatvesztést nem okoz).
- Régi, felhasználó nélküli kimenő mellékletkulcsok (`outbound-attachments/<idő>-…`) új levélhez már nem csatolhatók; elküldött levelek mellékletei továbbra is letölthetők.
- A kiadott letöltési link 5 percig érvényes, aki megkapja, addig használhatja.
- Publikálás szükséges: az élő oldalon (crm-vibateam-hu.lovable.app) a régi, védtelen végpontok futnak, amíg nem publikáltok.
