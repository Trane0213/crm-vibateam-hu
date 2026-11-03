# Timothy — célzott stabilizálás

## Elkészült
- Nyitott ajánlatok: aktuális, nem lezárt verziók szerveroldali szűrése lapozás előtt, mindkét céges kapcsolati ágon; külön történeti olvasás és verziójelölés. Közös ajánlati szabályok és összegek változatlanok.
- Ajánlatlink: a közös válaszkezelés csak sikeresen olvasott rekordútvonalat enged meg; kitalált website-host helyett a forrás relatív CRM-linkje, ismeretlen ajánlathivatkozás nem ellenőrzöttként jelenik meg.
- Mentett határidők mellett Budapest megjelenítés; befejezett utánkövetéshez completed/action_required=false, nyitott/lejárt külön. Lejárt MOST-ig szűrés a szerver órájából.
- Jogosultsági tanács: tényleges runtime role és engedélyezett eszközmetszet, külön lead-átadási keret. Sales nem Owner; won/lost lezárt lead nem átadható. RLS/P0/műveleti ellenőrzések változatlanok.
- Kontakt e-mailje nem igazoltan érvényes pusztán email_invalid=false miatt; saját fiók a meglévő crm_mailboxes hozzáférési RPC-ből, céges szál-lista nem teljes/saját postafiók-bizonyíték. Hiányzó adat oka nem dokumentált; nulla napi kiválasztás nem minden nyitott ügy vizsgálata.

## Ellenőrzés és korlát
Az érintett olvasások, összegek, lapozás, forráshivatkozások, határidő, completed és szerepkör adatoldali szabályai célzott automatizált teszttel ellenőrizhetők. Ezek nem bizonyítják az élő modell válaszainak teljes tartalmi helyességét.
Eredmény: **62/62 célzott teszt**, 21 AI OS biztonsági/strukturális forgatókönyv, 0 hiba; preview build OK. A teljes több száz tesztes csomagot nem ismételtem.

A korábbi kilenc FAIL hitelesített visszatesztje: **0 igazolt PASS, 9 NEM TESZTELT** ebben a körben. A böngésző a /ai-assistant oldalról /auth-ra jutott; external_unmanaged projekt, nincs injektált munkamenet vagy tesztfiók-hitelesítés. Korábbi chatből vagy ideiglenes fájlból titkot nem használtam újra. Izolált teszt nem helyettesíti Viktor valós chat → eszközhívás → CRM-adat → válasz próbáját.

Újraellenőrzendő az eredeti feltételekkel: saját leadhatáridő; cég és kontakt; completed történet; ajánlatverzió-linkek; saját postafiók; Sales-átadási tájékoztatás; me-szűrés helyreállítása és nyitott ajánlatverziók; céges hiányadat magyarázata; eredeti hibás ajánlatlink/aktuálislista kérdés. Az előző jelentés összesítése 9 FAIL-t állít, a táblázatában csak 8 FAIL sor szerepel; nem találok ki egy kilencedik korábbi futást.

Kritikus modellminőségi hiba megszűnése jelenleg **nem igazolt**. Új publikálás szükséges a javítások éles megjelenéséhez, de nem történt. Javasolt előbb hitelesített célzott visszateszt. Nincs üzleti írás, levélküldés, séma/RLS/Gmail-hozzáférés/UI változtatás. STOP.

Visszaállítás: e kör adatértelmezési/szűrési/linkkezelési változtatásainak visszavonása; adatbázis-visszaállítás nem szükséges.

## Új engedélyezett hitelesített visszateszt — 18:28–18:30 UTC
Viktor Sales-fiók, localhost preview, valódi modell és CRM; 15 chatpróba, 0 böngészőhiba, 0 jóváhagyási kártya. Az újonnan megadott belépést egyszeri teszthez használtam; ideiglenes belépési fájl törölve. Kódot és üzleti rekordot ebben a visszatesztben nem módosítottam, levelet nem küldtem, nem publikáltam.

| Eset | Eredmény | Tényleges bizonyíték |
|---|---|---|
| Saját leadek Budapest-határidő | FAIL | 09:00 UTC → 10:00 Budapest jó, de a létező company_id ellenére hiányzóként állítja a céget; company olvasás nincs. Futás 6010fd74-df5a-474a-b97f-ad28f71bf2ec. |
| Leadből cég/kontakt | FAIL | A kontaktkereséshez tévesen a lead UUID-t küldi company_id-ként; nulla találatból nem létező kontaktot állít, miközben a mentett kontakt létezik. 72969849-e08c-4f15-a682-cfd0236bb722. |
| Completed előzmény | FAIL | Mindhárom history eszköz sikeres, két completed=true rekord; mégis az egyiket tervezettként osztályozza, audit-időpontokon is hibás eltolás. 29bcb68e-314b-4c1b-8246-42380e5bed06. |
| Ajánlatverzió és link | PASS | v1 történeti 10 M nettó, v2 aktuális 12 M nettó; mindkét /quotes/ID forráshű. 85d9d707-75b4-4400-b05d-757a952b3b12. |
| Saját mailbox/ügyfélválasz | FAIL | Fiókot helyesen RPC-ből azonosítja, de üres céges szál-listából biztosan nem érkezett válasz következtetést mond; nincs levéltartalom-olvasás vagy teljes Gmail-ellenőrzés. 9b9814f5-f63d-4d23-805c-6e666d0fbf12. |
| Sales felelősátadás | FAIL | Nemet mond, nincs írás/jóváhagyás, de „lead tulajdonosa” feltételt állít a rendszer Owner szerepköre és nyitott lead helyett. Pontos jogosultsági magyarázat nem PASS. 8d77d3f4-82ec-4fe4-ba0d-f556111a4fca. |
| Hibás me-szűrés helyreállítás | PASS | Hibajelzés megmarad; 4 aktuális ajánlat, régi v1 kizárva, forráshű link/összeg. d89fa03b-523e-4224-8424-ba30910993b9. |
| Céges hiányadat magyarázata | FAIL | Valós company overview után kitalált oksági állítás: a további adat azért hiányzik, mert nem valós ügy. A TESZT-jelölés nem bizonyítja ezt az okot. b04bb255-d803-453a-8b65-872fbbf3d3e3. |
| Külön nyitott ajánlatlista | PASS | 4 aktuális nyitott ajánlat, nincs v1, megfelelő nettó/Nincs megadva és relatív link. 7e321778-62fe-489b-a88e-770f278824a0. |
| Elírásos napi kérdés | PASS | daily priorities hívás; nincs saját kiemelt teendő, nem minden munka kész. c83c55ce-683e-421b-a8d6-4c4e38dee9e1. |
| Elírásos nyitott ajánlatkérdés | PASS | Pontos 4 aktuális sor, megfelelő összegek/linkek. 0a5d5bfe-df04-4837-b61f-c0f7b3c3d6fd. |
| Elírásos lejárt utánkövetés | PASS | assigned_to=me, overdue=true; szerver 18:29:44 UTC-ig szűr, completed=false, 0 sor. e87d3845-5668-4e5c-ae04-f6744060c143. |
| Elírásos jogosultsági kérdés | FAIL | Tiltást mond, de ismét „lead tulajdonosa” téves magyarázat; nincs eszköz/írás. 065750d4-1b2b-4934-aad3-209d448376ee. |
| Nettó tételregresszió | PASS | Tétel 12 M nettó, ÁFA 3,24 M, bruttó 15,24 M; pontos quote_items forrás. 3dccb633-e4a3-4b6b-93e7-a7b1af020fe3. |
| Kétoldalas leadregresszió | PASS | limit=1 offset=0 és 1; két külön lead, total_visible=2. 29b98284-758f-4c0f-92a1-52bc3a54d31f. |

**Összesen 8 PASS / 7 FAIL.** A nyolc egyértelműen dokumentált korábbi FAIL-ből 2 teljes PASS / 6 FAIL; a külön kilencedik ajánlatlista-próba PASS, de az eredeti kilencedik FAIL azonosítása továbbra sem bizonyított. Elírásos próbák 3 PASS / 1 FAIL; két rövid alapregresszió PASS. Kritikus adatértelmezési hibák még fennállnak, Timothy nincs megbízhatóan lezárva. A meglévő adatoldali javítások éles megjelenéséhez külön publikálás kell; ez a visszateszt nem publikálási engedély. STOP.