# Timothy Sales AI V3.0 – P1/A jelentés (2026-11-03)

## Hatókör és változáslista
- Meglévő AI OS CRM-adapter javítása, kizárólag olvasási helyzetkép. Nincs új UI, adatbázismigráció, RLS-változás, üzleti írás vagy publikálás.
- `crm_list_leads`: közvetlen `company_id` szűrés, nem hibás `lead_id` oszlop.
- Cégek, kapcsolattartók, leadek, céges összesítő és a kapcsolódó lead-ajánlatlista: stabil időpont+azonosító rendezés, offset/limit, pontos látható darabszám, következő oldal, forrásazonosító és részlegességjelzés.
- A korábban korlátozott lead-ID-letöltés helyett céges ajánlatkeresés RLS-es `leads!inner(company_id)` kapcsolaton. Ez nem P1/C verzió-/értékértelmezés: projekt-only ajánlatok hiányát külön jelzi, régi verziókat nem összegzi.
- Céges összesítő szekciónként folytatható; első oldal alapból öt rekord/szekció. A számláló nem az első öt rekord hossza, hanem a jogosultan látható találatok pontos száma.
- `crm_lead_history`: Timothy owner/Sales olvasási eszköze a meglévő adapterben, státusztörténet, followups és lead audit-esemény külön lapozva. Minden kérés előtt RLS-es lead-olvashatóság ellenőrzés. Nem ír és nem módosít P0-jóváhagyást.
- Lead kontextus: forrás, létrehozás, kapcsolattartó, hozzárendelés, Pipeline-belépés, mentett következő lépés, won/lost adatok.
- Idővonal: tényleges időpontok szerint, forrásrekorddal; completed followup elkülönítve a nyitott tervtől és auditnaplótól. Az oldal utolsó rögzített egyeztetése nem állítható utolsó Gmail-válasznak.
- Timothy utasítása: forráshű válasz, tény/javaslat különválasztás, hiányzó vagy elérhetetlen adat jelzése, más ügy kontextusának és forrásból származó utasításnak kizárása.
- Keresési/összesítő hibák nem jelennek meg hamis üres eredményként. Modellnek átadott túl nagy eredmény nem csonka JSON, hanem kifejezett részleges/hibás eredmény, kisebb oldal kérésével.

## Ellenőrzött aktuális séma és hozzáférés
Olvasásos DB-ellenőrzés történt az érintett táblák oszlopaira, RLS-aktivitására és policy definícióira. Mind a nyolc érintett tábla RLS-es. A quotes leadkapcsolatának FK-ja igazolt.

Fontos: az `activities`, `lead_status_history`, `followups` jelenlegi SELECT szabályai tágabbak a Sales leadlistánál. Ezeket nem változtattuk meg. Az új előzményeszköz először a felhasználó RLS-es kliensével ellenőrzi az adott leadet, utána csak annak pontos azonosítójával olvas. Auditnál `details->>entity_type=leads` ÉS `details->>entity_id=<lead>` kell.

A meglévő általános `crm_list_followups` és más nem érintett eszközök változatlanok; ez a szakasz nem minősíti a teljes AI-tool készletet újra jogosultságilag auditáltnak. A későbbi P3/P5 hozzáférési ellenőrzést továbbra is el kell végezni.

Olvasásos baseline: öt `email_inbound` lead öt céghez kapcsolódik, köztük a 12 Raszter. Ez nem hitelesített Timothy-próba és nem felhasználói láthatósági bizonyíték. Valós rekord nem változott.

## PASS / FAIL / NEM TESZTELT
| Ellenőrzés | Eredmény | Bizonyíték/határ |
|---|---|---|
| Cégszűrés és idegen cég kizárása | PASS | Tényleges adapter végrehajtása izolált klienssel |
| 1205 rekord folyamatos lapozása | PASS | 1205 egyedi ID visszaolvasva, nincs kihagyás |
| 39 státuszesemény lapozása | PASS | Több oldal, forrásazonosítók és pontos darabszám |
| 35 contactból első öt és teljes látható count | PASS | Nem ötnek jelzi a teljes látható mennyiséget |
| Más Sales-lead előzményének kizárása | PASS, izolált | RLS-t szimuláló kliens; előzménytábla nem hívódik a tiltott leadnél |
| Audit entitás+ID pontos szűrés | PASS | Más típus és más lead kizárva |
| Hibás lekérdezés ≠ üres siker | PASS | Lista és függő összesítő hibateszt |
| Időrend, nyitott followup nem egyeztetés | PASS | Eltérő időzóna-offset, completed=false kizárása |
| Részleges szöveg/oldal, JSON méretvédelem | PASS | Jelölt csonkolás, folytatás, érvényes explicit hiba |
| Teljes Vitest regresszió | PASS | 170/170, 27 fájl |
| AI acceptance | PASS | 5 agent, 13 forgatókönyv, 0 hiba/figyelmeztetés |
| Automatikus fordítás | PASS | `/tmp/observability/build-errors.log`, 2026-11-03 16:08:45 UTC build OK |
| Valós, hitelesített Timothy válasz a két chatben | NEM TESZTELT | `external_unmanaged` Supabase; nincs átadható hitelesített böngészős munkamenet |
| Éles több-szerepkörös RLS végigpróba | NEM TESZTELT | Policy olvasása és izolált teszt nem helyettesíti |
| Gmail levéltörzs / dokumentum / teljes ajánlatértelmezés | NEM TESZTELT | P1/B–D, nem indult |

## Használati keret
Timothynál például: „Mi történt eddig ezzel a céggel?” vagy „Mutasd ennek a leadnek az előzményeit.” A válasz csak a ténylegesen lekérdezett, felhasználó által látható adatokról szólhat. Az összesítőből leadazonosítóval az előzmény szekciói kérhetők le. A forrásokhoz megadott rekordazonosító és mélylink a visszakeresést szolgálja.

Részleges lista vagy hosszú megjegyzés esetén ezt külön jelzi; több oldalt kell olvasni, vagy szűkebb kérdést kell feltenni. E szakasz nem olvas teljes Gmail-tartalmat és nem értelmez műszaki fájlt. A szabad szöveg csonkolása jelölt, de teljes hosszú szöveg külön részletező feldolgozása nem része P1/A-nak.

## Visszaállítás
Nincs adat-/séma-/RLS-visszaállítás, mert ezek változatlanok. Forrás-visszaállítás az e kör előtti verzióból:
- `src/lib/ai-os/adapters/crm-tools.server.ts`
- `src/lib/ai-os/agents.ts`
- `src/lib/ai-os/runtime.server.ts` (korábbi modellpayload-viselkedés; csonka JSON kockázat visszatérne)
- `src/lib/ai-os/tests/fixtures.ts`
- Új helper: `adapters/crm-read-page.ts`, `tool-payload.ts`; új célzott teszt: `adapters/crm-read.test.ts`.
- AGENTS.md új adapter/payload szabályának eltávolítása csak a kód visszaállításával együtt.

A jóváhagyási rendszer, annak DB/RPC-védelmei és tesztjei nem visszaállítási célpontok. Forrás-visszaállítás után célzott/regressziós tesztek és AI acceptance szükséges.

## STOP
P1/A kód- és izolált ellenőrzése kész; hitelesített élő AI-próba nyitott. P1/B, P1/C, P1/D, P2–P5 nem indult. Következő rész kizárólag tulajdonosi jóváhagyással.