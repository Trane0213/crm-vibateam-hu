# 3. szakasz – Marketing véglegesítés: javítási és tesztjelentés (2026-10-30)

Séma, RLS (1/B), R2-védelem (1/C), Pipeline-szabályok: **változatlan**. Új tábla/modul/szerepkör nincs. Éles üzleti adat nem módosult.

## Tesztfiók
- viktor.csotai@gmail.com – backendben ellenőrizve: aktív, **marketing** szerepkör (nem módosítottam).
- Jelszó: a felhasználó a chatben adta meg; ideiglenes projekttitokként (MARKETING_E2E_TEST_PASSWORD) használtam, fájlba/kódba/naplóba nem írtam. **A titkot töröltem, a törlés után a titoklista már nem tartalmazza (ellenőrizve).** A böngészős munkamenet-fájlt is töröltem. A felhasználónak jelszót kell cserélnie.

## Módosított / új fájlok
- `src/components/marketing/marketing-workspace.tsx`
  - Idővonal: + hívások, találkozók, utánkövetések, leadek (phone_calls/meetings/followups/leads, cégre szűrve, hívó RLS-jogaival); szürke sáv, amely kimondja, hogy levélszálból csak a megnyitott oldal szerepel.
  - Sales-átadás: meglévő nyitott lead felismerése (lista + kötelező „külön projektlehetőség” megerősítés); hibánál a lead-lista frissül (nincs vak ismételt átadás).
  - **Javított hiba:** az értékesítő-választó szűrője `role_id`-t használt, de a lekérdezés nem kérte le → most lekéri.
- `src/lib/marketing-timeline.ts` – új eseménytípusok (call, meeting, followup, lead).
- ÚJ `src/lib/marketing-handoff-guard.ts` + `.test.ts` (3 teszt).
- `src/routes/_authenticated/help.marketing.tsx` – valós működéshez igazítva (Levélszálak fül, idővonal-korlát, kötelező felelős, meglévő-lead figyelmeztetés, Scarlet = AI OS).
- ÚJ `docs/manuals/marketing-kezikonyv-v1.0-2026-10-30.md` – Marketinges munkatársi kézikönyv.
- Visszaállítás: `docs/rollback/3-2026-10-30/` (3 eredeti fájl); az új guard + teszt + kézikönyv törölhető.

## Élő böngészős teszt (marketinges fiók, localhost, desktop 1280 + mobil 390)
| Lépés | Eredmény |
|---|---|
| Bejelentkezés | ✅ /today |
| Menü | ✅ Ma, Marketing munkafelület, Weboldali igények, Kampánylista, Emailek; AI; Továbbiak: Ügyfelek, Cégek, Kapcsolattartók, Hívások, Adatminőség, Marketing súgó |
| Tiltott oldalak (/dashboard, /projects, /quotes, /sales/leads, /settings/gmail, /attendance) | ✅ mind „Nincs jogosultságod” |
| Engedett oldalak (/campaign-list, /web-quote-requests, /emails, /data-quality, /help/marketing, /sales/research, /ai-assistants, /contacts, /leads) | ✅ megnyílnak |
| 12 Raszter (csak olvasás) | ✅ 5 kontakt, Levélszálak 0* (jogosultság – a 2 szál info@), Meglévő lead 1 (new) |
| TESZT cég létrehozása | ✅ „TESZT – Marketing E2E 2026-10-30” |
| TESZT kontakt | ✅ „TESZT Kontakt E2E”, teszt.e2e@example.invalid |
| Sales-jegyzet, csatorna, „Kapcsolatban” | ✅ |
| Hívás (szerveroldali kereső a cégre) | ✅ mentve, idővonalon látszik |
| Találkozó rögzítése | ✅ tiltva (nincs Új gomb) |
| Cég törlése | ✅ nincs törlés gomb |
| Sales-átadás | ⛔ **nem végezhető**: a rendszerben **0 Sales szerepkörű felhasználó** van; az ablak kiírja, a gomb tiltott |
| Duplikált átadás | UI-ban egyszeri átadás után tiltott (kód); meglévő-lead megerősítés – egységteszt; élőben nem próbálható |
| Mobil | ✅ alsó menü, nincs vízszintes túlcsúszás (Ma, cégadatlap) |
| Konzolhiba | ✅ nincs |

## Tesztek
- Vitest 44/44 → lásd lent a végső futást; typecheck a módosított fájlokra hibamentes; build OK.

## TESZT adatok (élő DB, marketing nem törölheti)
- Cég `f0761f0b-8765-4631-93ca-65fdd5971302` „TESZT – Marketing E2E 2026-10-30” (+ notes markerek), kontakt „TESZT Kontakt E2E”, hívás „TESZT hívás – E2E, nem valós”. Lead nem jött létre, levél nem ment ki. Törlés: tulajdonos a felületen.

## Nyitott hibák / blokkolók
1. **⛔ Nincs Sales felhasználó** → a Marketing→Sales átadás nem működtethető. Tulajdonosi teendő (szerepkör kiosztása); nem módosítottam.
2. Átadás nem atomikus (lead beszúrás, majd cég-státusz mentés két lépésben). Teljes atomikussághoz DB-függvény kellene → külön engedély kell.
3. A Marketing munkafelület (/leads) saját, lead-alapú átadási útvonala nem része ennek a javításnak (Sales-szabály érintett lehet) – Sales szakasz.
4. Emailek oldal marketingesnél „Összes postafiók” címet mutat, bár üres (nincs saját fiók) – félrevezető felirat, megjelenítési kérdés.
5. Korábbi adatellenőrzési tételek változatlanul nyitva (25 saját cégre rendelt levél, ZÁÉV, 39 szál, 14 cég).

## Publikálás
Szükséges; nem publikáltam.
