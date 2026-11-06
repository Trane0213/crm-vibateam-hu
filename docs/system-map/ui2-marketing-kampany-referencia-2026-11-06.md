# UI–2 — Marketing és kampány, 2026-11-06

## Megvalósítás
- Marketing `/today`: négy felső mutató, bal oldali prioritástábla, jobb gyors műveletek, alul friss levelek/Sales-átadás/kampányfigyelés. A teljes korábbi napi sorok összecsukható részben megmaradtak; pipeline és teljesítmény továbbra elérhető.
- `/campaign-list`: bal cégkeresés, kijelölés, kontaktok, mentett célcégek és előellenőrzés; középen név/célcsoport/tárgy, formázott üzenet, HTML-aláírás és Gmail-import; jobb oldali élő, címzettre értelmezett előnézet; alsó külön meglévő TESZT és ütemezési vezérlők.
- A nem mentett előnézet a meglévő `campaignPreview` és `withCampaignSignature` függvényeket használja; küldés továbbra mentett revízióból, változatlan védelmekkel történik. A kampánylekérési hiba nem tünteti el a korábban elérhető cégkeresőt.

## Érintett kód
- `src/components/today/marketing-home.tsx`
- `src/components/marketing/campaign-draft-precheck.tsx`
- `src/routes/_authenticated/campaign-list.tsx`

## Ellenőrzés
- 779/779 Vitest, 78 fájl PASS; AI acceptance 21/21 PASS.
- Harness legfrissebb build OK (18:57:05 UTC); köztes render-scope típushiba javítva.
- Tényleges route tree betöltés, elkülönített TESZT-válaszokkal: marketing `/today`, Owner és Marketing `/campaign-list`, 1440×1100 és 390×844, 0 összeomlás/pageerror/vízszintes oldaltúlfutás.
- Nem üres visszahívás/feladat/levéllista; összes napi lista megnyitása/visszazárása; mentett kampány újranyitása; címzett-preview, élő tárgy és formázott szöveg; módosított tervezetnél előellenőrzés/ütemezés tiltása PASS.
- Asztali/mobil szerkesztő, külön előnézet és ütemezési sáv képernyőképei vizuálisan összevetve a két feltöltött referenciával. A három kampányoszlop és a marketing fő szerkezete megvalósult; mobilon egymás alatt jelennek meg. A címzett- és prioritástáblák belső görgetése szándékos.
- Képek és futtatott ellenőrző script: `/tmp/browser/ui2/`; ezek ideiglenes ellenőrzési állományok, nem tartós ügyféldokumentumok.

## Fennmaradó eltérések / NEM TESZTELT
- `external_unmanaged`: valódi hitelesített CRM/Gmail/R2, mentés/readback és küldés NEM TESZTELT. A valódi signed-out útvonalak `/auth`-ra irányítanak; TESZT-válasz nem bizonyít éles betöltést.
- Kampányjóváhagyás összesítőhöz nincs meglévő igazolt adatforrás; ezért „—”, nem mintaszám. Kampányfigyelés csak a meglévő aktív cégeket és adatellenőrzési sorokat mutatja, nem kitalált kampányteljesítményt.
- Mentett sablonok, teljes mellékletkezelés, kétirányú Gmail-piszkozat és válaszstatisztika korábbi funkcionális hiányai megmaradtak. Automatikus feldolgozás nem aktív; a mentés nem küldés.
- Élő preview kontaktnevét továbbra csak az eredeti személy/proveniencia szabály engedi; bizonytalan kontakt nem kap igazolt személynevet.
- Root AGENTS mentése méretkorlát miatt nem történt; a meglévő szabályokat nem rövidítettem.
- Commitazonosító nem igazolható; Git-állapotot nem változtattam.

UI–2 RÉSZBEN KÉSZ — megjelenítési kör igazolt, teljes éles elfogadás nem. UI–3 külön engedélyig STOP. DB/RLS/Sales/AI és éles adat változatlan; import, küldés, publikálás nem történt.