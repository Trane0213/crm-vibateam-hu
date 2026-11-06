# Kampányküldési védelem és TESZT – 2026-11-06

## Elkészült, ügyfélküldés nélkül
- Kampánytervezet külön TESZT-cím választással és explicit egyetlen levél megerősítésével; csak viktor.csotai@gmail.com / info@vibateam.hu. Mentett nem üres szöveg, [TESZT] tárgy, TESZT helyettesítő nevek, nincs CRM-ügyfélkapcsolat, CC/BCC/melléklet.
- A meglévő Gmail-küldő szolgáltatás beforeSend/verifySent pontjain service-only claim és élő saját Gmail SENT-ellenőrzés. Owner/saját Marketing, saját aktív céges fiók, kampánytimestamp és pontos saved copy/recipient readback. Nincs új connector/feladó, AI OS/P0/ajánlatküldés változatlan.
- Tartós campaign_send_audit: kampányverzió+fiók+cím egyedi, a foglalt/bizonytalan eredmény nem próbálható újra. Budapest-nap szerint 40 foglalás/fiók, TESZT is fogyasztja; nem a Gmail általános kvótája.
- Marketingtiltás a közös meglévő kontakteditorban: normalizált címhez kötött, igazoló hivatkozás, szerveridő/felelős/revision és atomic activities audit. Owner/Marketing tiltás, csak Owner feloldás; címváltozás nem törli az eredeti címen lévő tiltást. Előellenőrzés az igazolt tiltást invalidként minősíti, hiányos történet továbbra sem lesz kész.
- Új táblák explicit grants/RLS; kliens nem írhat auditot vagy tiltásmetaadatot. A kezdeti authenticated security-definer figyelmeztetés service-only invoker migrációval megszüntetve; 16 régi jelzés változatlan, külön ellenőrzési feladat.

## Tesztek és friss éles állapot
- 696 Vitest PASS, 65 fájl. Új tesztek: pontos 40-es korlát, két TESZT-cím, megerősítés, Budapest éjfél, bizonytalan/live/CRM eredmény, rossz cím és timeout nem küld újra.
- Elkülönített PostgreSQL PASS: címváltozás után megmaradó tiltás; Owner-only feloldás; Sales/PM és stale tiltás; claim role/revision/allowlist/replay; uncertain no retry; 39 foglalásnál két párhuzamos kérésből pontosan egy sikeres, összesen 40, következő tiltott; kliensírás tiltott.
- Asztali 1280 és mobil 390 TESZT-megjelenítés: megerősítés nélkül tiltott küldés, címváltás törli a megerősítést; tiltáshivatkozás nélkül mentés tiltott; bizonytalan napló egyértelmű. Túlcsordulás nincs, runtime hiba 0. Nem kattintott mentésre/küldésre.
- Build OK. Éles SELECT: 664 cég, 701 kontakt, 8 lead, 1 kampány, 0 új tiltás, 0 küldési audit. Anon claim és authenticated suppression RPC execute=false.

## Nem tesztelt és következő kapu
Valódi bejelentkezett kampánymentés/tiltás/egy TESZT-küldés **NEM TESZTELT**: external_unmanaged munkamenet nem átadható, /campaign-list → /auth. A felhasználó TESZT-küldést engedélyezett, de ezt jogosultságmegkerüléssel vagy másik feladóról nem végeztük el. Nem kérünk jelszót. Nem történt publikálás vagy éles emailküldés.

Ügyfélküldés és időzítés továbbra sem aktív. Indításmód nem választott; hiányos Gmail-történet nem oldható fel e körrel. A jelenlegi kampánynak nincs mentett tárgya/szövege, ezért addig a TESZT-gomb is tiltott. Következő kapu: saját hitelesített TESZT-próba, majd külön ügyfélküldési jóváhagyás. STOP.

Visszaállítás: database/rollback_campaign_send_safety_2026-11-06.sql letiltja az új claim/tiltásmódosító útvonalat; audit és tiltások megmaradnak, befejező endpoint a már foglalt eredmények lezárására marad. Baseline: database/campaign-send-safety-2026-11-06/baseline.md.