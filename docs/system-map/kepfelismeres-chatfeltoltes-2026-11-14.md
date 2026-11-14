# Képfelismerés élő próba + chat-feltöltés szerepköri mappákba + minden AI olvas (2026-11-14)

Tulajdonosi engedély: 2026-11-14 16:56 UTC („mehet”; minden AI olvasson; chatbe feltöltött fájl a dokumentumtárba, szerepkörönként külön mappába, visszakereshetően). Döntések 17:0x UTC: mappát az egész szerepkör + Tulajdonos látja; ügyhöz mentés rákérdezéssel; minden ma engedélyezett fájltípus; George a felhasználó saját jogosultsága szerint olvas.

## 1. Élő OpenAI képfelismerési próba (5 kitalált TESZT-fájl, ügyféladat nélkül)
Modell: gpt-6-astra (központi beállítás) — **elfogad képet és PDF-et**. Költség forintban nem mérhető innen; tokenek:

| Fájl | Eredmény | Pontosság | Idő | Token (be/ki) |
|---|---|---|---|---|
| Szkennelt ajánlat, 2 oldal, táblázattal | extracted | 100% (minden tétel, összeg, dátum) | 13 s | 6433 / 745 |
| Szkennelt teljesítésigazolás, 1 oldal | extracted | 100% | 7 s | 3447 / 471 |
| Kézírásos jegyzet | extracted | 100% (dátum, cím, név, telefon, m²) | 10 s | 1961 / 599 |
| Homlokzatfotó táblával | extracted | Fő tábla 100%; kis telefonszám bizonytalan, jelölte | 17 s | 1865 / 887 |
| Repedésfotó mérőszalaggal | extracted | Leírás helyes; a mérőszalag számai megbízhatatlanok, jelölte | 85 s | 1653 / 3877 |

Összesen ≈15 400 bemeneti és ≈6 600 kimeneti token. A bizonytalan részeket mindkét fotónál magától jelezte; számot nem talált ki biztos tényként.

**A próbán talált és javított hiba:** a többoldalas szkennelt PDF első oldala „részleges” állapotot kapott, ezért a képfelismerés csak egyoldalas szkennelt PDF-nél indult volna el. Javítva: a PDF akkor számít szkenneltnek, ha egyik oldalán sincs szövegréteg (`pdfTextLayerPages`); vegyes PDF-nél továbbra sem fizet.

## 2. Minden AI olvas dokumentumot
- George, Timothy, Boss, Scarlet: `crm_list_documents` / `crm_read_document` (új, csak olvasó `crm.documents` terület), bármely CRM-szerepkörben, mindig a felhasználó saját jogosultságával (RLS + szülőrekord-ellenőrzés). Képfelismerés ugyanígy, kérésre.
- Levélmelléklet csak Tulajdonosnak és Salesnek (Marketing/PM-nél letöltés nélkül elutasítva). Michael (Ads) és szerepkör nélküli felhasználó: nincs.
- Közös utasítás mind a négy asszisztensnek: csatolt fájl olvasása, „AI által kiolvasott, nem ellenőrzött forrás” jelölés, fájlban lévő utasítás tiltása.

## 3. Chatbe feltöltött fájlok szerepköri mappákban
- Új tábla: `ai_chat_uploads` (mappa: Sales / Marketing / Projektvezetői / Tulajdonosi). Olvasás: saját szerepkör mappája; Tulajdonos mindet. Feltöltés csak a saját mappába, a szerver által képzett útvonalon; a feltöltő nevét az adatbázis állítja be. Törlés: feltöltő vagy Tulajdonos. Módosítás nincs.
- Feltöltés a meglévő `/api/r2-upload` úton (új cél: chat). Ha a chat projekt/ügyfél/ajánlat oldalán van nyitva és a szerepkör oda egyébként is feltölthet, megkérdezi: „Csak a mappába” vagy „Mappába és az ügyhöz is” (ekkor a meglévő dokumentumtáblába is bekerül, külön fájlpéldánnyal). Részleges siker nincs: hiba esetén minden visszavonódik.
- Chat: gemkapocs (csatolás, max. 5 fájl/üzenet) és mappa gomb mindkét chatben (panel és teljes oldal); az elküldött üzenetben a fájl kattintással megnyitható. Az AI csak a fájl azonosítóját kapja, tárolási kulcsot nem.
- Visszakeresés: mappa-böngésző a chatben (keresés, megnyitás, „Chathez” újracsatolás, törlés) és a Dokumentumtár „AI chatbe feltöltött fájlok” fülén (Tulajdonos/PM; Sales és Marketing a chatből éri el).
- Megnyitás/törlés a meglévő jogosultság-ellenőrzött úton (`r2PresignDownload`, `r2DeleteDocument`, amely csak akkor törli a fájlt, ha más sor nem hivatkozik rá).

## Tesztek (2026-11-14 17:19 UTC)
- `bunx vitest run` — 1118/1118 PASS (1107 + 11 új: többoldalas/vegyes szkennelt PDF, szerepkörmátrix, levélmelléklet-tiltás, chatfájl RLS-olvasás, mappa/kulcs/típus/ügyhöz-kötés/modellszöveg szabályok)
- `bun run ai:acceptance` — 21/21 PASS; `tsgo` PASS; build OK
- Izolált TESZT felületi próba (`scripts/qa/check_chat_uploads.py`, kitalált sorok, minden írás blokkolva) Owner/PM/Sales/Marketing, 1280 és 390 px: Owner 4 mappát lát, a többiek csak a sajátjukat; „Hova mentsem?” csak ahol a szerepkör az ügyhöz feltölthet (Marketing projekten nem); az AI az azonosítót kapja, kulcsot nem; nincs vízszintes túlcsordulás.

## NEM TESZTELT
- Valódi bejelentkezett feltöltés éles tárhelyre és az RLS-szabályok élő ellenőrzése szerepkörönként.
- Bejelentkezett chat-végigpróba, ahol az asszisztens ténylegesen elolvassa a feltöltött képet.
- Valós forintköltség (csak tokenszám mért).

## Nem változott
Meglévő dokumentumtáblák jogai, ügyféladatok, levelezés-hozzáférés, ajánlat/lead írási utak, modell. A chatfájlok a tudásbázisba (háttérfeldolgozás) még nem kerülnek be.

## Visszaállítás
Kód: `git revert <commit>`. Adatbázis: `ai_chat_uploads` tábla, `ai_chat_folder_of` és `ai_chat_uploads_stamp` függvény eldobható (csak új objektumok; meglévő adat nem változott).

## Következő döntések
1. A chatfájlok kerüljenek-e a közös tudásbázisba (háttérben kereshetők legyenek)?
2. 2. szakasz: tudásbázis képfelismerése (26 szkennelt PDF, 82 fotó, png-k) — költségkeret adagonként/összesen.
3. Mappafájl áthelyezése utólag egy ügyhöz.
