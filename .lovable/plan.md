# Új Sales és Marketing munkaterület – végleges képernyőstruktúra és megvalósítási terv

A kilenc képernyős látványterv az elsődleges minta. Az új felület a régi mellett, külön címeken készül, felhasználónként be- és kikapcsolható. Minden adat a meglévő háttérből jön: ugyanazok a táblák, jogosultságok, Timothy és Scarlet. A látványterv számai és nevei nem kerülnek át valós adatként. Jóváhagyás előtt semmi nem változik.

## 1. Képernyőstruktúra

Bal oldali sötét menü (látványterv szerint), szerepkör szerint szűrve; a tulajdonos mindkét részt látja. Mobilon alsó menü + „Továbbiak”.

```text
Értékesítés                         Marketing
  Ma                                  Ma
  Ügyek (Pipeline, húzható)           Érdeklődők
  Ügyfelek -> Ügyféladatlap           E-mail-kampányok -> Kampány
  Ajánlatok                           Levelezés és piszkozatok
     ├ Kapott Excel árazása           Tartalomtervezés (Scarlet tervezet)
     └ Saját VIBA-ajánlat             Eredmények
  Küldés és szerződés (ajánlatonként)
  Projektek (meglévő oldal)
Timothy / Scarlet: beépített kártya minden képernyőn + a meglévő oldalsó AI-panel
```

A látványterv „Tartalomnaptár” és „Kreatívtár” részei „Tervezett – háttérfejlesztés szükséges” jelöléssel, kattintható funkció nélkül jelennek meg.

## 2. Képernyők, komponensek és háttér-hozzárendelés

| Képernyő | Fő elemek | Meglévő háttér (változatlan) | Hiányzó |
|---|---|---|---|
| Értékesítés – Ma | 6 mutató, Mai teendők, Timothy napi összefoglaló | `useDailyWork`/`dailyWork`, `salesOverview`, `OwnerKpiStrip` számítás, Timothy briefing | „Havi cél” – nincs célérték tárolva (üzleti döntés) |
| Ügyek – Pipeline | oszloponként összeg, húzható kártya, szűrők | pipeline-data, `useUpdateLead`/pipeline mutáció, `STATUS_TRANSITIONS`, nyertté tétel a meglévő projekt-létrehozó ablakon (`sales_mark_won_with_project`) | – |
| Ügyféladatlap | fülek: Cégadatok, Kapcsolattartók, Projektek, Aktivitás, Dokumentumok; Timothy javaslat | companies.functions, customer_kpi_v, contact-provenance, RelatedDocumentsPanel | – |
| Kapott Excel árazása | 5 lépés, eredeti költségvetés árazott táblája tételállapottal | quote-package panel logikája, pricing/package functions, R2 feltöltés, `packageStaleness` | jóváhagyott ártörzs, tartós mentés (P7 migráció) |
| Saját VIBA-ajánlat | Alapadatok → Paraméterek → Kalkuláció → Ajánlat → Ellenőrzés | viba-offer kalkulátor, `quote_create_draft`, tételpanel | valós díjak, kalkuláció mentése |
| Küldés és szerződés | csomag, belső jóváhagyás, Gmail-küldés, utánkövetés, szerződés, PM-átadás | QuoteSendPanel → `/api/gmail/send`, followups, contract-prep, handoff | szerződés-adatmodell, e-aláírás, tartós belső jóváhagyás |
| Marketing – Ma | mutatók, Mai feladatok, Scarlet javaslat | `loadMarketingDaily`, marketing-day-flow | „Havi cél” (döntés) |
| Érdeklődők és kampányok | fülek: Érdeklődők, Kampányok, Címzettek, Kizárási lista | quote-requests functions, web-request-intake, campaign-drafts/safety/delivery, contact-suppression | – |
| Levelezés és tartalom | Levelezés, Piszkozatok, Scarlet e-mail-tervezet | mailbox.functions, gmail-drafts, Scarlet olvasóeszközök | tartalomnaptár, kreatívtár, közösségi publikálás, mérés |

Közös komponensek (egyszer készülnek): munkaterület-váz, lépéssáv, „Következő teendő” kártya, állapotjel (Automatikusan kész / Ellenőrizendő / Hiányzó / Jóváhagyásra vár / Befejezett / Tervezett), mutatókártya, AI-javaslatkártya (a meglévő AI-panelt nyitja előre beírt kéréssel, nem küld magától).

## 3. Működési szabályok
- Írás csak a meglévő útvonalakon: lead `useUpdateLead`/Pipeline, ajánlat a meglévő mentés, küldés csak a meglévő Gmail-útvonal kézi megerősítéssel.
- Húzáskor a tiltott lépést a felület nem engedi, és megmondja, miért; a „Nyert” mindig a meglévő projektvezető-választó ablakot nyitja.
- A felület csak elrejt, soha nem ad több jogot, mint a mostani szabályok.
- Nincs szimulált működés: amihez nincs háttér, az „Tervezett” jelölést kap.

## 4. Megvalósítási sorrend (minden szakasz után STOP és jóváhagyás)
1. **Alap**: új címek, sötét menü, be/ki kapcsoló, közös komponensek. Régi oldalak változatlanok.
2. **Értékesítés – Ma + Pipeline** (húzással).
3. **Ügyféladatlap**.
4. **Kapott Excel árazása** és **Saját VIBA-ajánlat** – két külön képernyő.
5. **Küldés, utánkövetés, szerződés, átadás**.
6. **Marketing – Ma, Érdeklődők, Kampányok**.
7. **Levelezés, piszkozatok, Scarlet tartalomtervezet**; tervezett modulok jelölése.
8. **Teljes ellenőrzés**: szerepkörönként navigáció, jogosultság, mobilnézet, a hét munkafolyamat; ezután döntés az alapértelmezetté tételről.

## 5. Üzleti döntések (összesítve)
1. Havi cél (Sales és Marketing): ki adja meg és milyen értékkel – addig a mutató „nincs beállítva”.
2. Kötelező belső jóváhagyás minden ajánlatküldés előtt?
3. Tartalomnaptár/kreatívtár adattárolás indulhat-e (külön engedélyhez kötött módosítás).
4. Google Ads adatok láthatósága a Marketingnek.
5. Hiteles VIBA ártörzs és a korábban elkészített adatbázis-módosítás engedélyezése.
6. Szerződés-nyilvántartás és e-aláírás (fizetős lehet).
7. Bejelentkezett tesztelés időpontja veled és Ramonnal.

## Technikai részletek
- Útvonalak: `src/routes/_authenticated/munka.tsx` (layout + `<Outlet />`), `munka.sales.ma.tsx`, `munka.sales.pipeline.tsx`, `munka.sales.ugyfel.$id.tsx`, `munka.sales.ajanlat.$id.excel.tsx`, `munka.sales.ajanlat.$id.sajat.tsx`, `munka.sales.ajanlat.$id.kuldes.tsx`, `munka.marketing.ma.tsx`, `munka.marketing.erdeklodok.tsx`, `munka.marketing.kampany.$id.tsx`, `munka.marketing.levelezes.tsx`; `head()` mindegyiken.
- Komponensek: `src/components/workspace-v2/*` (shell, sidebar, step-bar, next-action, status-badge, kpi-card, ai-suggestion); nézetadapterek tiszta függvényként `src/lib/workspace-v2/*`, unit tesztekkel.
- Kapcsoló: localStorage felhasználónként (`useWorkspaceV2`), „Új felület” gomb a régi oldalsávban és vissza.
- Route-hozzáférés: `permissions.ts` `canAccessRoute` kiegészítése a `/munka/sales/*` és `/munka/marketing/*` előtagokkal, a megfelelő régi oldalak szerepköreit tükrözve; `nav-config.test.ts` bővítés.
- Pipeline-húzás: `@dnd-kit/core`; a cél oszlop a `STATUS_TRANSITIONS`-ből számolt, a mentés a meglévő pipeline-mutációval, `["leads"]`/`["pipeline"]` invalidálás és aktivitásnapló.
- Meglévő panelek (QuotePackagePanel, QuoteItemsPanel, QuoteSendPanel, campaign-*-control, RelatedDocumentsPanel) beágyazva, nem másolva.
- Ellenőrzés szakaszonként: `bunx vitest run`, `bun run ai:acceptance`, Playwright mock-auth TESZT (bejelentkezett éles próba nem elérhető, külön jelölve).
- Nincs migráció, RLS- vagy jogosultságváltozás, nincs publikálás.
