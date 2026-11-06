# Marketingállapot: külön mentés, változatlan ügyféladatok

## E kör célja
A jelenlegi öt marketingállapot külön mezőkbe kerül a meglévő cégadatokon; a szabad szöveges jegyzet nem lesz az új mentések állapotforrása. Nincs új CRM-modul vagy új képernyő.

**Ez a séma- és jogosultsági kapu jóváhagyásra vár.** A mostani „mehet tovább” alapján csak olvasásos előkészítés történt; sem migráció, sem üzleti adatírás nem történt.

## Mit változtatunk jóváhagyás után?
- Megőrizzük az öt jelenlegi kódot: `new`, `contacted`, `qualified`, `handoff`, `rejected`. Új üzleti állapot vagy átmeneti szabály nem készül.
- Az új mentéseknél külön állapot, hiteles módosító, szerveridőpont, forrás és az átadás meglévő leadazonosítója tárolódik a `companies` táblán.
- Az állapotot a közös olvasó minden érintett nézetben innen veszi. Kitöltetlen mezőnél a meglévő jelölést továbbra is olvassa, de megkülönbözteti az ellenőrizetlen régi jelölést és az állapot nélküli céget. A hiány önmagában nem bizonyít megkeresést vagy küldhetőséget.
- A kézi állapotmentést csak tulajdonos és Marketing használhatja, a meglévő cég-hozzáféréseken belül. Sales és PM más cégadatot érintő meglévő jogai megmaradnak.
- A sikeres Gmail-küldés jelenlegi állapotfrissítését megőrizzük, de külön, szerveroldalon igazolt küldési forrással: csak a ténylegesen mentett saját SENT levél és pontos cégkapcsolat alapján. Ez nem aktivál kampányküldést, és nem szolgál tesztküldési engedélyként.
- A korábbi jegyzeteket nem alakítjuk át; nincs visszatöltés, jelöléstörlés, kontaktátírás, cégösszevonás vagy Sales-lead létrehozás.

## Hatás és adatvédelem
A friss olvasás szerint 664 cég van, a `companies` táblán nincs alkalmazási trigger. A cégolvasási és -szerkesztési policyk tulajdonost, Marketinget, Sales-t és PM-et engednek. **Ezeket nem tágítjuk és nem cseréljük le.** A külön állapotmezők védelme szükséges, mert a jelenlegi általános cégszerkesztési jog önmagában nem védi a marketingállapotot és annak hiteles módosítóját.

Minden új mező nullable és alapérték nélküli; az alkalmazás nem tölti ki őket induláskor. Migráció előtt pontos SQL és adatvesztés nélküli visszaállítási SQL készül, izolált próbával. Az éles alkalmazás csak a migráció saját jóváhagyási kapuján történhet.

## Ellenőrzés és visszaállítás
- Elkülönített TESZT: owner/marketing mentés és visszaolvasás; Sales/PM/no-role tiltás; időpont-, forrás- és módosítóhamisítás tiltása; audit és mentés atomikussága.
- Regresszió: mind az öt állapot, régi jelölés elsőbbsége, hiányzó állapot, átadásazonosító, állapotmentéstől független jegyzet/forrás szerkesztése, Gmail SENT/DRAFT védelem.
- Éles ellenőrzés csak olvasással: cég/kontakt/lead darabszám, teljes régi jegyzetek változatlansága, meglévő policyk és jogok.
- Bejelentkezett owner/Marketing/Sales/PM végigpróba jelenleg **NEM TESZTELHETŐ**: külső Supabase, nincs átadható biztonságos munkamenet. Ezt nem helyettesítjük sikeresnek mondott kijelentkezett próbával.
- Visszaállítás: először az érintett mentési és olvasási utak ellenőrzött visszakapcsolása. A már kitöltött strukturált mezőket és auditot megőrizzük; nem töröljük adatvesztéssel, nem nyitunk vissza jogosultságot. Az új állapotokat elvesztő vak legacy visszaállás tilos.

## Technikai részletek
- `companies`: `marketing_status`, `marketing_status_changed_by`, `marketing_status_changed_at`, `marketing_status_source`, `marketing_handoff_lead_id`; domainvalidálás és módosító/időpont/forrás védelme az adatbázisban.
- Kézi mentés: hitelesített, user-RLS tranzakciós művelet, friss állapotellenőrzéssel, szerveroldali szerepellenőrzéssel és az `activities` meglévő naplóban tartalommentes régi/új állapotaudittal; az eredményt vissza kell olvasni.
- Gmail: meglévő küldési szolgáltatásból hívott, nem klienshívható bizonyítékellenőrző művelet. Módosító csak a hitelesített küldő lehet; CRM-mentési bizonytalanság nem ad állapotváltást vagy újraküldést.
- Érintett írók: marketing workspace állapot/átadás, campaign-list contacted/rejected és Gmail send. Jegyzet-, sales-note- és lead-source-írók nem írhatják felül a strukturált állapotot.
- Érintett olvasók/projekciók: marketing-status közös értelmező, marketing-universe, marketing-daily, Marketing Ma, campaign-list, marketing workspace, közös cégösszefoglaló és Sales dosszié/részletek. Nincs két párhuzamos írható állapotforrás.

## Megállás
Ez az egy funkció kerül átkötésre. A kontakt személy/gyűjtőcím/ismeretlen, forrás és ellenőrzöttség külön következő kapu; most nem készül párhuzamosan. E kör után STOP és tulajdonosi elfogadás, automatikus publikálás nélkül.