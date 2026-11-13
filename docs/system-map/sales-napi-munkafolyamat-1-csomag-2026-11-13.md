# Sales napi munkafolyamat és felület — 1. nagy munkacsomag (2026-11-13)

Állapot: **RÉSZBEN KÉSZ** — kód, unit tesztek, típusellenőrzés és AI acceptance PASS; bejelentkezett felület **NEM TESZTELT** (`LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`).
A brief két fájlja (VIBA_CRM_AI_UTANI_…, VIBA_GEORGE_…) nem volt elérhető; a chatben megadott megbízás alapján készült.

## Felmérés (read-only)
- Útvonalak: `/today` (Sales Ma: `sales-home.tsx`), `/leads` (Sales-előkészítés: `lead-workspace` + `sales-prep-panel`), `/sales/leads` (Pipeline kanban + ügyadatlap), `/quotes`, `/quotes/$id` (4 lépéses ajánlat), `/sales/todo`, `/sales`, `/sales/quotes`, `/leads/lost`.
- Szabályforrások (változatlan): `STATUS_TRANSITIONS`, `canEnterPipeline`, `sales_mark_won_with_project` RPC, `quote_status` guard, `/api/gmail/send` + `quote_sends`, `can_access_quote`, `leads_select_sales` RLS.
- Szerződés: nincs külön szerződés-adatmodell; meglévő: lead `contract` szakasz, ajánlat `accepted` állapot, ajánlatdokumentum `contract_terms`, projektdokumentum `contract` kategória. Elektronikus aláírás nincs.

## Változások (csak felület + megjelenítési modell)
| Képernyő | Változás |
|---|---|
| Sales Ma | „Most ezzel kezdj” kártya (napi prioritás első ügye + ok); 5 lépéses munkafolyamat-sáv darabszámmal; hibánál Újrapróbálás; napi sorok Pipeline-ügynél közvetlenül a Pipeline-adatlapra visznek. |
| Pipeline | Mobilon szakaszfülek (egy oszlop), oszlopleírás, hibaüzenet + Újrapróbálás, `?lead=` mélylink közvetlen megnyitással; token-színek. |
| Pipeline ügyadatlap | „Következő teendő” kártya egy fő gombbal (ajánlat létrehozása / megnyitása / engedélyezett szakaszváltás / Megnyertük / előkészítés); az ügy aktuális ajánlatai listában; duplikált piszkozat előtti figyelmeztetés; Szerződés-előkészítés ellenőrzőlista (tájékoztató, nem ment); „Mit hol intézek?” összecsukva; mobilon egymás alatti blokkok. |
| Műveletsáv | Csak engedélyezett szakaszok a menüben („tiltott” elemek eltűntek); „Megnyertük” magyarázattal. |
| Megnyertük ablak | Érthető, visszavonhatatlanságot jelző szöveg; mobilon egy oszlop; siker/hiba üzenet a következménnyel. |
| Ajánlat adatlap | 3. lépés „Ellenőrzés és kiküldés” kiküldés előtti ellenőrzőlistával (mentett adat alapján, kötelező/ajánlott); „Nem mentett módosítás” jelzés + böngészőbezárás-figyelmeztetés; elfogadott ajánlatnál szerződés-tájékoztató és Pipeline-link (Sales/Owner); „Lead” → „Ügy”. |
| Sales-előkészítés | Pipeline-ba lépés feltételei látható pipalistaként; Pipeline-ban lévő ügynél „Megnyitás a Pipeline-ban” gomb; mobilon lista → ügy nézet „Vissza a listához” gombbal. |
| Sales áttekintés / shell | Nyers státuszkódok helyett magyar nevek, betöltés/hiba állapot; fül-nevek: Pipeline, Ajánlat-riport; „Sales-előkészítés” gomb. |
| Súgó | Sales: frissített Pipeline-gombok, új „Ajánlat ellenőrzése és kiküldése” és „Szerződés-előkészítés” lépés. |

Új fájlok: `src/lib/sales/sales-flow.ts` (+teszt), `src/components/sales/sales-flow-ui.tsx`, `src/components/quotes/quote-readiness-card.tsx`, `src/lib/quotes/form-dirty.ts` (+teszt).
Módosított: `sales-home.tsx`, `sales-worklists.tsx`, `pipeline-board.tsx`, `pipeline-detail-sheet.tsx`, `pipeline-data.ts`/`-types.ts` (+`contact_id` olvasás), `create-project-dialog.tsx`, `lead-action-bar.tsx`, `lead-status-stepper.tsx`, `next-step-cell.tsx`, `sales-shell.tsx`, `lead-workspace.tsx`, `sales-prep-panel.tsx`, `constants.ts` (token-színek), `workspace-view.ts` (+teszt), `quotes.$id.tsx`, `sales.index.tsx`, `sales.leads.tsx`, `help-guide.ts`.

Nem változott: adatbázis-séma, RLS, jogosultság, státuszgép, mentési/küldési/megnyerési út, AI, titkok, éles adat. Nem történt küldés, publikálás, telepítés.

## Tesztek
- Új: 25 Sales-folyamat teszt (következő teendő, figyelmeztetések, csak engedélyezett átmenet, kiküldés-ellenőrzés, szerződés, e-aláírás nincs, menü, mélylink), 2 napi fókusz/darabszám teszt, 3 nem mentett módosítás teszt.
- Teljes: 895/895 unit (90 fájl) PASS; AI acceptance 21/21 PASS; `tsgo` típusellenőrzés PASS.
- Böngésző: /today, /leads, /sales/leads, /quotes/:id 1440 és 390 px — kijelentkezve /auth-ra irányít, 0 oldalhiba. **Bejelentkezett Sales/Owner felület NEM TESZTELT.**

## Mi működik ténylegesen vs csak kód
- Ténylegesen igazolt: a szabálylogika tesztekkel, típus- és fordítási helyesség, oldalbetöltés hibamentessége kijelentkezve.
- Csak kód (élőben nem próbált): minden új felületi elem bejelentkezve, mélylink-megnyitás, ellenőrzőlisták valós adattal, mobil nézetek valós adattal.

## Fennmaradó hiányok (külön jóváhagyás kell)
1. Szerződés-adatmodell (szerződés-státusz, tulajdonosi jóváhagyás, aláírt példány az ügyhöz kötve) — nincs; most csak tájékoztató lista.
2. Elektronikus aláírás — nincs, nem szimulált.
3. Tulajdonosi szerződés-jóváhagyási lépés — nincs adatmodell.
4. Bejelentkezett végigpróba Sales és Owner szerepkörrel.
5. Pipeline-kártyán ajánlatonkénti következő teendő (most az adatlapon látszik).

## Visszaállítás
Csak felületi kód: `git revert <commit>` visszaállítja; adat- vagy sémaváltozás nincs, így adatvisszaállítás nem szükséges.

## Következő nagy csomag
Marketing napi munkafelület (nem kezdődött el).
