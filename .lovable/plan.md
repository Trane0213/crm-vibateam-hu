# Napi marketingmunka – célzott biztonsági javítás

## Ellenőrzés eredménye
36 célteszt és 21 AI-jogosultsági forgatókönyv sikeres, de nem fedik le az alábbi talált hibákat. A Ma és Kampánylista próba bejelentkezésre irányított; a valódi szerepkörös végigpróba továbbra sem elérhető. Friss olvasás: 664 cég, 701 kontakt, 8 lead, 1 kampány, 0 TESZT-küldési napló és 0 tiltás.

## Egy összevont javítási kör
1. **Webes érdeklődés felvétele:** részleges mentés után a már létrejött cég megmaradjon megnyithatónak; újabb kattintás ne hozza létre ismét. Friss egyezésellenőrzés és saját/közös adatfrissítés; bizonytalan eredménynél nincs vak újrapróbálás. Nem lesz automatikus Sales-lead.
2. **Sales-átadás:** siker és részleges hiba után a cég, leadek, Pipeline és marketing napi listák frissüljenek. A már létrejött lead azonosítója megmarad; elavult cégállapot után az új állapot áttekintésével folytatható a státuszpótlás, nem új lead létrehozásával.
3. **Scarlet forráshű olvasása:** DRAFT címke mindig kizárja az elküldött minősítést, SENT mellett is. A meglévő cég-/kontaktolvasás adja át a mentett marketingállapotot és ellenőrzöttség/forrás mezőket, régi jegyzet helyett a strukturált adat elsőbbségével. A napi ajánlás láthatóan különítse el a tiltott vagy hibás emailt, és a közös visszahívást ne állítsa saját feladatnak. Telefonos kapcsolatot az emailtiltás önmagában nem tilt.

## Határok és ellenőrzés
- Meglévő felületek és olvasók, nincs új modul, új küldőút, modellváltás, AI-íróművelet vagy jogosultságbővítés.
- Nincs éles adatjavítás, séma/RLS-változtatás, ügyfélküldés, időzítés vagy publikálás. A teljes konkurens webes felvétel tartós garanciája külön tranzakciós jóváhagyási kapu; e kör nem ígéri ezt.
- Célzott regresszió részleges mentésre, elavult állapotra, adatfrissítésre, SENT+DRAFT és mentett státusz/proveniencia/tiltás esetekre. Egy összevont tesztkör és AI acceptance; elkülönített TESZT-megjelenítés, valódi mentés/modellezés csak biztonságosan elérhető munkamenettel.
- Rövid közös eredményjegyzet, nem tesztelt utak külön megnevezése, majd STOP.

## Technikai részletek
A javítás a meglévő web-request-intake-card, marketing-workspace és use-realtime-sync útvonalakat, valamint AI OS gmail-context/crm olvasókat és loadMarketingDaily adatértelmezést érinti. Új adatmodell helyett mentett azonosítóval védett részleges eredmény és meglévő query-frissítés; RLS-es, korlátozott olvasás változatlan. Visszaállítás: kizárólag e kör kódváltozásainak visszavonása, üzleti adatok és küldési bizonyítékok érintése nélkül.