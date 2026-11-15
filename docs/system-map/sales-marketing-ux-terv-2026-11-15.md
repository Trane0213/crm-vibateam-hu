# VIBA CRM – Sales és Marketing: rendszeraudit és átfogó UX/UI-terv (1. szakasz, 2026-11-15)

Csak terv és elkülönített prototípus. Éles felület, adatbázis, jogosultság, kötelező üzleti lépés NEM változott; nincs e-mail, publikálás, fizetős szolgáltatás.
Jelölés: **[E]** ellenőrzött (forráskód/teszt/izolált próba), **[K]** következtetés, **[N]** nem igazolt / részleges / nem létező.

## 1. Rendszeraudit – összefoglaló
- Sales/Marketing képernyők: 23 oldal (leads, sales x6, quotes x3, customers/companies/contacts, emails, calls, followups, meetings, campaign-list, web-quote-requests x2, today). [E]
- Gombok: kb. 40 az oldalakon + 84 a Sales/Pipeline/Marketing/lead-munkafelület komponensekben. [E]
- AI: Timothy (Sales) és Scarlet (Marketing) a közös AI OS-en; 32 CRM-eszköz; írás csak P0 jóváhagyással (következő lépés, utánkövetés, kapcsolattartó/felelős, Pipeline-lépés, kiküldés, előkészítő aktivitás). [E] Bejelentkezett élő modellfutás nem igazolt. [N]
- Kötelező szabályok (megőrzendők) [E]: Pipeline-lépések kizárólag `STATUS_TRANSITIONS` szerint; Megnyert csak `sales_mark_won_with_project` (Szerződés szakasz, PM-kijelölés), terminális; Sales csak saját (assigned) leadet lát; felelős-átadás Owner-only; ajánlat-hozzáférés `can_access_quote`; összegek DB-triggerből; kiküldés csak `/api/gmail/send` idempotens úton, siker Gmail SENT bizonyítékkal; kampány napi 40/fiók, csak TESZT-címek; nyers webes igény nem Sales-lead; duplikátum jelölés, nem összevonás.

### Párhuzamos / duplikált elemek [E]
| Elem | Duplikáció | Javaslat |
|---|---|---|
| /leads és „Sales-előkészítés”, „Lead munkafelület”, „Érdeklődők feldolgozása” | ugyanaz az oldal 3 menünévvel | egy belépés: Sales → Ügyfelek/Pipeline, Marketing → Érdeklődők |
| /sales, /sales/todo, /sales/quotes | riport-nézetek a Ma és Ajánlatok mellett | Ma és Ajánlatok szűrői; riport szakértői nézetben |
| /customers, /companies, /contacts | három lista | egy „Ügyfelek” cég/magánszemély/kontakt szűrővel (meglévő /customers) |
| Ajánlat 4 fül | „Összeg” és „Ellenőrzés” átfedő mezők | 3 lépés egy oldalon (prototípus a CRM-ben: `?nezet=egyszeru`) |
| /ai-assistant + beépített panel | két belépés ugyanahhoz a chathez | beépített panel elsődleges, oldal megmarad |

### Hiányzó / részleges funkciók [N]
- Pipeline drag-and-drop: **nincs** (kártyás tábla van, lépés lenyílóból). Megvalósítható a meglévő mutációval.
- Tartalomnaptár, kreatívkezelés, tartalomjóváhagyás: **nincs adatmodell** (nincs ilyen tábla). Közösségi publikálás/Meta-mérés: **nincs integráció**.
- Szerződés-adatmodell, elfogadott ajánlat jelölése, e-aláírás: **nincs** (P7 ellenőrzőlista csak UI).
- Jóváhagyott díjtörzs (D4–D5): **nincs** → Timothy nem áraz, csak hiányt jelez.
- Tartós kalkuláció-/csomagjóváhagyás mentése: migrációs terv kész, **nem futtatva** (D2).
- Google Ads: létezik, de Owner-only (Michael) — Marketing eredményoldalon nem jeleníthető meg jogosultságváltás nélkül.

## 2. Képernyő- és menüleltár (terv)
| Munkakör | Most (fő+AI+Továbbiak) | Terv: fő menü |
|---|---|---|
| Értékesítő | 5 + 5 + kb. 12 | Ma · Pipeline · Ügyfelek · Ajánlatok · Timothy |
| Marketing | 6 + 5 + kb. 15 | Ma · Érdeklődők · Tartalomnaptár* · Kampányok · Eredmények |
*adatmodell-döntésig „Nem létező funkció” jelöléssel.

## 3. Munkafolyamat-térkép (meglévő automatizmusokkal)
```text
Weboldal/HMAC ─► quote_requests (Marketing/Owner) ─► minősítés + duplikátumjelzés
   ─► átadás Sales-nek (felelős: Owner) ─► Pipeline: Új → Kapcsolat alatt → Ajánlat előkészítés
   ─► Ajánlat: [A] Kapott Excel: feltöltés → P3 árazó / P4 tervellenőrzés / P5 csomag → nettó
            [B] Saját VIBA: P6 m²/rezsi/egyedi kalkuláció → quote_items → sablon/PDF
   ─► Ellenőrzőlista + belső jóváhagyás-előkészítés (elavulás-védelem, P7)
   ─► Kiküldés: /api/gmail/send (kézi megerősítés) ─► Ajánlat kiadva ─► Utánkövetés (Timothy-tervezet)
   ─► Szerződés (12 tételes előkészítés, Owner-döntés) ─► Megnyert + projekt (RPC) ─► PM-átadás
Marketing: Ma ─► Érdeklődők ─► Kampány (címzett → levél/aláírás → TESZT-küldés → jóváhagyás → napi 40/fiók) ─► Eredmények
```
A két ajánlattípus külön marad: kapott Excelnél saját sablon és tételszerkesztő rejtve; saját ajánlatnál nincs Excel-árazó. [E]

## 4. Egységes VIBA designrendszer
- Színek: navy #0B1B3A (menü), villamoskék #1E6BFF (fő művelet), cián #22D3EE (AI és „Következő teendő”); státusz: zöld kész, borostyán figyelem, piros késés, szaggatott szürke = nem létező funkció.
- Betűk: Space Grotesk címek, Inter szöveg.
- Minta minden képernyőn: cím + egy mondatos állapot → **Következő teendő kártya egy gombbal** → munkaterület → összecsukott „Szakértői beállítások”.
- Gombszabály: képernyőnként 1 fő gomb (kék), a többi körvonalas; tiltott művelet nem jelenik meg, a nem engedélyezett lépés okkal együtt jelez.
- Kanban: húzás csak a szabály szerinti szakaszba; tiltott ejtésnél ok megjelenítése. Naptár: napok közti húzás.
- Helybeni szerkesztés (következő lépés, kontakt) oldalváltás nélkül; AI-kitöltés mindig ellenőrizendő javaslat.
- Mobil: alsó 5 pontos menü, egy oszlop, Kanban vízszintes lapozással, 44 px érintési cél.

## 5–6. Látványtervek és kattintható prototípus
`/mnt/documents/sales-marketing-terv/`: `prototipus.html` (önálló, TESZT-adat, nincs hálózat/mentés) és `kepek/` — 13 képernyő × asztali + mobil = 26 kép.
Sales: Ma, Pipeline, Ügyfél-adatlap, Ajánlatok, Új ajánlat típusválasztó, Kapott Excel ajánlat, Saját VIBA-ajánlat, Utánkövetés + szerződés. Marketing: Ma, Érdeklődők, Tartalomnaptár, Kampány, Eredmények.

## 7. Régi és új folyamatok (kódból számolt BECSLÉS, nem mérés)
| Folyamat | Képernyő most → terv | Művelet most → terv | Kézi bevitel most → terv | Automatizált | Kötelező jóváhagyás |
|---|---|---|---|---|---|
| Napindítás → első teendő | 2–3 → 1 | 3–4 → 1 | 0 → 0 | dailyWork megmarad | – |
| Pipeline-lépés | 2 (lista+adatlap) → 1 | 3 → 1 húzás | 0–1 → 0–1 | szabályellenőrzés + napló megmarad | Megnyert: RPC + PM |
| Kapott Excel ajánlat | 4 fül → 1 oldal | 14–16 → 7–8 | 5–8 → 0–2 | P3/P4/P5 megmarad | belső jóváhagyás, kézi küldés |
| Saját VIBA-ajánlat | 4 fül → 1 oldal | 12–14 → 6–8 | 6–10 → 2–3 | P6 + duplikációvédelem | kézi küldés |
| Utánkövetés | 3 → 1 | 5 → 2 | 1–2 → 0 (Timothy-tervezet) | P0 jóváhagyás | küldés kézi |
| Érdeklődő → Sales | 2–3 → 1 | 5–6 → 2 | 3–5 → 0–2 (AI-kitöltés) | duplikátumjelzés | felelős: Owner |
| Kampány | 4–5 → 1 (3 lépés) | 10+ → 5–6 | változatlan | precheck, napi keret | TESZT + jóváhagyás |
Időmegtakarítást nem állítunk; felhasználói mérés a bejelentkezett pilotban (D1).

## 8. Szakaszos megvalósítási terv (mindegyik után STOP)
1. **Sales mag**: fő menü 5 pontra, Ma „Következő teendő”, egyszerű ajánlatnézet alapértelmezetté, Pipeline drag-and-drop a meglévő `useUpdateLead`/Pipeline mutációval. Elfogadás: tiltott lépés nem menthető; ajánlat 0 fülváltás; mobil vízszintes túlcsordulás nincs.
2. **Ügyfél-adatlap egyesítése** (/customers alá, helybeni szerkesztés), utánkövetés-tervezet a képernyőn.
3. **Marketing mag**: Ma, Érdeklődők AI-kitöltéssel (javaslat, nem írás), kampány 3 lépésben.
4. **Adatmodell-függő** (csak döntés után): tartalomnaptár/jóváhagyás, szerződés-nyilvántartás, díjtörzs, tartós jóváhagyás (D2).
Kockázat: bejelentkezett próba hiánya; díjtörzs nélkül az automatikus árazás csak hiánylista.

## 9. Önellenőrzés és tesztesetek
Izolált prototípus-próba (Playwright, asztali 1280 + mobil 390) [E]:
- 26 képernyőkép, 0 oldalhiba, 0 vízszintes túlcsordulás.
- Pipeline: tiltott húzás (Új → Szerződés) **blokkolva** okkal; engedélyezett (Új → Kapcsolat alatt) átmegy.
- Kapott Excel: Feltöltés → Timothy → Ellenőrzés sorrend; hiányzó ár mellett a jóváhagyás **nem lehetséges**.
- Két ajánlattípus külön belépéssel. Naptár-húzás működik; nem létező funkció jelölve.
CRM-ben (korábbi kör) [E]: egyszerű ajánlatnézet Sales/Owner/mobil; 1439/1439 teszt, 21/21 AI.

| Folyamat | Normál | Hiányzó adat | Timothy nem tudja | Kötelező ellenőrzés | Nem odavaló funkció | Párhuzamos bevitel | Következő lépés |
|---|---|---|---|---|---|---|---|
| Kapott Excel | feltöltés→árazás→ellenőrzés | nincs fájl → 1. lépés | ok + kézi árazás szakértőiben | belső jóváhagyás, elavulás, kézi küldés | saját sablon rejtve | nettó csak egy helyen | mindig kártya |
| Saját VIBA | m² → tételjavaslat → PDF | díjtörzs hiány → „Díjtörzsre vár” | javaslat nélkül kézi tétel | duplikáció/ütközés-védelem | Excel-árazó rejtve | tételírás egy úton | kártya |
| Pipeline | húzás szabály szerint | következő lépés nélkül figyelmeztet | – | STATUS_TRANSITIONS, Megnyert RPC | Megnyert nem húzható | egy mutáció | kártyán |
| Érdeklődő | minősít → átad | duplikátum → jelölés | AI-kitöltés üres → kézi | nem lesz automatikusan lead | – | cég/kontakt egyszer | kártya |
| Kampány | TESZT → jóváhagyás | nincs aláírás → blokkol | Scarlet tervezet nélkül kézi | napi 40, TESZT-címek | éles küldés gomb rejtve | egy üzenetmentés | kártya |
A CRM-be épített változatok bejelentkezett tesztje még NEM történt meg [N].

## 10. Összesített tulajdonosi döntési lista
1. **D1** Bejelentkezett TESZT-pilot Ramonnal és Ownerrel (mérés a becslések helyett).
2. **Pipeline drag-and-drop** engedélyezése a meglévő szabályokkal (UI-változás, üzleti szabály változatlan).
3. **Tartalomnaptár/kreatív/jóváhagyás adatmodell** — új tábla + RLS → külön jóváhagyás; addig „nem létező” jelölés.
4. **Közösségi publikálás / Meta-mérés** integráció — külső, esetleg fizetős; most nem.
5. **Marketing eredményoldalon Google Ads adat** — ma Owner-only; láthatóság bővítése jogosultsági döntés.
6. **Szerződés-nyilvántartás és e-aláírás** (P7 nyitott).
7. **D4–D5 díjtörzs** és **D2 tartós jóváhagyás migráció**.
8. **Ügyféllisták egyesítése** /customers alá (menüváltozás, adat nem).
