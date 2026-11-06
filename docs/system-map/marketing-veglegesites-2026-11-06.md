# A hátralévő marketingmunka – közös állapot

A 17:01 UTC feltöltött kérés az eredeti 0–5. terv folytatása, nem új rendszerterv. Kész funkciók ismétlése nincs; megengedett kód/izolált teszt köztes STOP nélkül, éles adatok/jogosultság/küldés/publikálás kapui megmaradnak. E dokumentum a folytatás közös rövid jegyzete, nem teljes elfogadási jelentés.

## Elkészült kapcsolódások
- Az importellenőrzés a title mezőben mentett szál-UUID-t is megnyitja; kizárólag email_thread típusú tételnél, szigorú UUID-ellenőrzéssel. Meglévő levél–cég ellenőrzésre belépő, új felület/automatikus relink nélkül.
- Cégadatlap Kampányok részéből és kontaktadatlapról Owner/Marketing „Hozzáadás kampányhoz”: a meglévő kampány-előkészítést nyitja validált company/contact URL-azonosítóval. A kontakt csak a látható azonos céges jelöltek között lesz kijelölve, a mentett lista megmarad; nincs automatikus mentés vagy küldési jogosultság. Nem mentett kontaktváltozásnál az action tiltott.
- A kampány cégolvasási hibája nem jelenik meg üres/igazolt nulla listaként. Hiányzó/nem látható kiválasztott cégnél figyelmeztetés.

## Ellenőrzés
- Összevont Vitest: **719 PASS / 0 FAIL, 70 fájl**; AI acceptance **21 PASS / 0 hiba, 5 agent**. A 6 új szabályteszt konkrét szálazonosító-feloldást és explicit cég/kontaktkijelölést ellenőriz.
- Harness fordítás: build OK (17:04:28 UTC); a search-típus miatti átmeneti hibát optional return mezőkkel javítottuk, a meglévő Ma link változatlan.
- Elkülönített megjelenítés 1280×1800 és 390×844: mentett és adatlapról kijelölt kontakt egyszerre megmarad, nem mentett üzenetváltozásnál előellenőrzés tiltott; 0 pageerror és nincs mobil vízszintes túlcsordulás. Ez TESZT-cache-es megjelenítés, nem hitelesített mentési végigpróba. A valódi /campaign-list /auth-ra irányít; **hosted mentés és saját Gmail-próba NEM TESZTELT: external_unmanaged**.
- Nincs schema/RLS/üzleti adatírás, küldés vagy publikálás. Sales-pipeline, ajánlat, árazás, Timothy és központi modell forrása nem módosult.

## Fennmaradó tényleges hiányok
A roadmap egyetlen folyamatos nyitott listája követi: kontakt nélküli tartós kampánycélcég; cégszintű tiltás; marketinges adatkapcsolati munkasor naplózott és visszaállítható döntéssel; saját Gmail Drafts olvasás/proveniencia; ütemezett dispatch; napi/Sales/Scarlet kapcsolódások; közös HTML/aláírás; utolsó közös használhatóság; teljes üzleti integrációs és szerepkörös végigpróbák.

Friss policy-olvasás: import_review_items és relink reader Owner-only, kampány Owner vagy saját Marketing; company/contact meglévő üzleti szerepkörökkel látható. A marketinges review-hozzáférés nem oldható meg pusztán linkkel vagy szerver-admin kerülőúttal. A 39+8 bizonytalan szál változatlan, kézi döntés hiányzik. A contact_id NOT NULL kampánytábla nem tárolhat kontakt nélküli célcéget a mostani mentőúton; **ez még nincs megvalósítva**.

Ügyfélkampány, automatikus küldés és publikálás nincs aktiválva. Teljes CRM-készség nem állítható. A commitot a platform kezeli, végleges commitazonosító ebben a körben nem igazolt.