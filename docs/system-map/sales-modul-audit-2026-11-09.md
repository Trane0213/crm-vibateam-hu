# Értékesítő modul – read-only audit (2026-11-09 17:15 UTC)

Csak olvasás: kód, adat, jogosultság, küldés, publikálás változatlan.

## Ellenőrizve – PASS
- Sales célzott tesztek: 8 fájl / 33 teszt PASS (napi munka, láthatóság, következő lépés, előkészítő aktivitás, nettó ajánlatérték, owner KPI).
- Build/runtime napló: nincs hiba.
- RLS: Sales SELECT = `assigned_to = auth.uid()`; Sales UPDATE WITH CHECK `assigned_to = auth.uid()` → Sales nem adhat át ügyet másnak. Felelős nélküli nyitott lead nincs (0).
- DB-őrök élnek: kötelező felelős nyitott ügynél, elvesztés oka kötelező, won terminális és projekt nélkül nem állítható, Pipeline-belépés és következő lépés őr, státusznapló.

## Adatkép
- 8 lead: 1 új, 1 ajánlat-előkészítés, 2 utánkövetés, 3 megnyert, 1 elvesztett. 3 TESZT-cég.
- 1 aktív Sales-felhasználó, 5 ügy; Owner 2; Marketing 1 (TESZT, megnyert).
- Ajánlat: 7 (5 piszkozat, 1 kiküldött, 1 tárgyalás). Leadhez kötött ajánlat mind piszkozat.
- Utánkövetés: 7, lejárt nyitott 0.

## Figyelmet igénylő tételek (nem javítva)
1. **Viv Zrt.** – 11-03-án „Ajánlat kiküldve” státuszba került, ma 14:32-kor Sales megnyerte, de a CRM-ben csak piszkozat ajánlat van, kiküldési bizonyíték nincs. Valószínű CRM-en kívüli küldés vagy nem összekötött Gmail-levél. Kézi ellenőrzés: kiment-e és összeköthető-e a meglévő `quoteLinkSentEmail` úttal.
2. **KONTEXA Kft.** – Ajánlat-előkészítés, következő lépés 11-03 óta lejárt (6 nap), ajánlat nincs. A Sales Ma lejárt tételként kell mutassa – bejelentkezett megjelenés NEM TESZTELT.
3. **Sopron Út 66. Társasház** – 10-29 óta „új”, Pipeline-on kívül, következő lépés nélkül.
4. **Szabályrés gyanú (nem bizonyított):** a „quote_sent” státuszhoz az adatbázis nem követel kiküldött ajánlatot (1. pont ezt mutatja). Marketing UPDATE policy USING `status='new'`, WITH CHECK státuszt nem korlátoz. Sales-invariánsok zároltak – csak tulajdonosi döntéssel vizsgálható tovább.
5. 2 piszkozat ajánlat lead/projekt nélkül (Owner felelős) – takarítási döntés.

## NEM TESZTELT
- Bejelentkezett Sales végigpróba (Ma, Pipeline, ügy-munkafelület, ajánlat, utánkövetés): a böngészős munkamenet itt nem adható át (external_unmanaged), chatben megosztott jelszót nem használtam.
