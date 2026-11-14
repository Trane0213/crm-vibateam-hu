# VIBA-TEAM CRM és AI-asszisztensek — teljes működési leírás és állapotkép

**Készült:** 2026-11-14, 10:30 (Budapest) · **Alapja:** a jelenlegi forráskód (HEAD `e644889`), az élő adatbázis csak olvasó lekérdezése (2026-11-14 09:20 UTC), friss tesztfuttatás, valamint a `docs/system-map/` korábbi jelentései.
**Ennél a leírásnál semmilyen adat, jogosultság, beállítás nem módosult; nem történt küldés vagy publikálás.**

Jelölések: **KÉSZ** = a funkció megvan és automatikus teszt fedi · **RÉSZBEN** = működik, de hiányos · **NEM TESZTELT** = valódi, bejelentkezett szerepkörös végigpróba nem igazolja · **NINCS** = a funkció nem létezik · **KIKAPCSOLVA** = létezik, de nincs engedélyezve.

---

## 1. Vezetői összefoglaló — hogy áll a rendszer

| Terület | Állapot | Röviden |
|---|---|---|
| Bejelentkezés, szerepkörök, oldalvédelem | KÉSZ | 4 szerepkör (Tulajdonos, Projektvezető, Sales, Marketing); minden oldal belépéshez kötött. |
| Napi munka (Ma oldal) mind a 4 szerepkörnek | KÉSZ · NEM TESZTELT | Szerepkörönként külön „Most ezzel kezdj” nézet (1–4. csomag). |
| Érdeklődők, Pipeline, Sales-előkészítés | KÉSZ · NEM TESZTELT | Sales csak a saját felelősségű ügyeit látja; megnyerés csak ellenőrzött úton. |
| Ajánlatkezelő (V2.1) | KÉSZ · RÉSZBEN TESZTELT | Verziók, alternatívák, nyomtatás, igazolt Gmail-küldés. Teljes PDF→Gmail végigpróba NEM TESZTELT. |
| Sales → PM átadás, szerződés-előkészítés | KÉSZ (ellenőrzőlisták) | Szerződés-nyilvántartás, tulajdonosi jóváhagyás, e-aláírás **NINCS**. |
| Projektek, PM napi munka | KÉSZ · NEM TESZTELT | TIG, anyagigény, napi építési napló **NINCS**. Élesben 0 feladat van rögzítve. |
| Jelenlét / bér / kifizetések | KÉSZ · NEM TESZTELT | Jelenlét-projektek nincsenek a CRM-projektekhez kötve (csak névegyezés). |
| Dokumentumtár | KÉSZ · RÉSZBEN | 25 projektfájlból 25 nincs projekthez kötve; a fájlolvasási jog az adatbázisban túl tág. |
| Gmail-postafiókok | MŰKÖDIK | Percenkénti szinkron él; 4 aktív felhasználónak van csatolt fiókja. |
| Marketing, kampányok | RÉSZBEN | 1 kampány, piszkozat állapotban; ügyfélküldés és ütemező **KIKAPCSOLVA**. |
| Weboldali ajánlatkérések | MŰKÖDIK | vibateam.hu → CRM aláírt szinkron él; 19 beküldés; nem lesz belőle automatikusan Sales-lead. |
| AI-asszisztensek (George, Scarlet, Timothy, Boss, Michael) | KÉSZ · RÉSZBEN TESZTELT | Írás csak jóváhagyással (P0). Bejelentkezett szerepkörös végigpróba NEM TESZTELT. |
| Automatikus óránkénti AI-felülvizsgálat | KIKAPCSOLVA | Az ütemezés fut, de a kapcsoló `enabled=false`, 0 futás. |
| OCR (szkennelt dokumentum olvasása) | NINCS | 635 dokumentum „nem támogatott” formátumú. |
| Számlázás, bank, kintlévőség | NINCS | Nincs pénzügyi adatkapcsolat. |
| Automatikus tesztek | KÉSZ | Friss futás: **1090/1090** unit/integrációs teszt, **21/21** AI acceptance. |

**Összkép:** a CRM és az AI napi használatra alkalmas felépítésű, a biztonsági és jóváhagyási kapuk működnek, de a **valódi, bejelentkezett szerepkörös végigpróbák (Tulajdonos/Sales/PM/Marketing) egyik csomagnál sincsenek igazolva**, és több üzleti nyilvántartás (szerződés, TIG, anyagigény, pénzügy) még nem létezik. Ezek tulajdonosi döntést igényelnek (lásd 11. fejezet).

---

## 2. Felhasználók és szerepkörök

### 2.1 Élő felhasználók (2026-11-14)
- 5 felhasználói profil, ebből **4 aktív**: 1 Tulajdonos, 1 Projektvezető, 2 Sales; 1 inaktív.
- **Aktív Marketing szerepkörű felhasználó jelenleg nincs** — a Marketing felületet most csak a Tulajdonos látja.
- Ismeretlen vagy hiányzó szerepkör a legszűkebb, Marketing jogkörre esik vissza (`src/lib/permissions.ts`).

### 2.2 Mit lát az egyes szerepkör a fő menüben (`src/lib/nav-config.ts`)
| Szerepkör | Fő menü a „Ma” után | További menük |
|---|---|---|
| **Tulajdonos** | Dashboard, Pipeline, Projektek, Ajánlatok, Jelenlét | Minden ügyfél-, kommunikációs és riportmenü, elveszett ügyek, aktivitás, importellenőrzés, kifizetések, adatminőség, dokumentumtár, minden súgó, Beállítások |
| **Sales** | Sales-előkészítés, Pipeline, Ajánlatok, Projektek | Ügyfelek, cégek, kontaktok, levelek, Sales teendők, elveszett ügyek, súgó, saját Gmail |
| **Marketing** | Érdeklődők feldolgozása, Weboldali ajánlatkérések, Kampányok, Levelek, Hívások | Ügyfelek, cégek, kontaktok, utánkövetések, feladatok, adatminőség, súgó, saját Gmail |
| **Projektvezető** | Projektek, Feladatok, Találkozók, Dokumentumok, Jelenlét | Ügyfelek, kampányok, weboldali kérések, levelek, hívások, aktivitás, adatminőség, súgók, saját Gmail |

A menüben való megjelenés szűkebb, mint az oldal közvetlen elérése; a tényleges adathozzáférést mindig az adatbázis sorszintű szabályai (RLS) döntik el. Az élő adatbázisban **0 egyedi oldalszintű felülírás** van, tehát a kódban rögzített alapszabályok érvényesek.

### 2.3 Alapvető üzleti jogosultsági szabályok
- **Sales** csak a hozzá rendelt leadeket látja; a hozzá nem rendelt lead csak a Tulajdonosé. Felelőst **csak a Tulajdonos** adhat át.
- **Megnyerés** kizárólag „Szerződés” szakaszban, a felelős Sales vagy a Tulajdonos által, érvényes projektvezetővel; a nyert állapot végleges.
- **Ajánlathoz** hozzáfér: Tulajdonos; Sales a saját leadjén/projektjén; PM a saját projektjén; kapcsolat nélküli ajánlatnál a létrehozó. Az ajánlat felelőse a létrehozó.
- **Marketing** saját munkaterületén dolgozik, a találkozók csak olvashatók; cégek és magánszemélyek külön kezelve.
- **Projektvezető** a projekteket, feladatokat, jelenlétet kezeli; kifizetések csak a Tulajdonosnak.
- Szerepkör nélküli felhasználó semmit nem lát.

---

## 3. A CRM moduljai — mire valók és hogy állnak

### 3.1 Ma / napi munka (`/today`) — mind a 4 szerepkör
- **Tulajdonos:** „Most ezzel kezdj”, hat sávos prioritáslista forrással és rekordlinkkel (`?lane=` mélylink), kritikus projektek, szerződés-előkészítés, saját AI-jóváhagyások, George szervezeti jelzései, „Ma történt”, „Követelések: nincs adatkapcsolat”, adatforrások. KPI-k egy közös számítási helyről (`src/lib/owner-kpis.ts`).
- **Sales:** napi prioritáskártya, öt lépéses munkafolyamat, következő teendő, ajánlat-ellenőrzés, Timothy napi összefoglaló (naponta egyszer, Budapest-idő szerint).
- **Marketing:** napi prioritások, hét lépéses munkafolyamat, kampányállapot, Scarlet gyorskérdések.
- **Projektvezető:** Projektjeim ma, mai feladatok és felelősök, jelenlét ma, projekt napi lap, átadási ellenőrzőlista.
- Állapot: **KÉSZ · NEM TESZTELT** (bejelentkezett szerepkörös végigpróba nincs).

### 3.2 Dashboard és tulajdonosi riport — Tulajdonos
- `/dashboard`: vezetői és ügyfél-KPI-k (ajánlati érték = nettó tételösszeg).
- `/owner-report`: George forrásazonosítós tulajdonosi jelentése; azonos tényeknél nem hív újra AI-t. Élesben 4 tárolt jelentés, az utolsó 2026-11-13 20:33 UTC.

### 3.3 Érdeklődők és Sales-előkészítés (`/leads`) — Tulajdonos, Sales, Marketing
- Háromoszlopos munkaterület: lista, részletek, dosszié; Marketing „feldolgozás”, Sales „előkészítés” módban.
- Elveszett ügyek (`/leads/lost`): áttekintés és újranyitás.
- Leadírás csak a közös mentési útvonalon, aktivitásnaplóval.

### 3.4 Pipeline (`/sales`, `/sales/leads`, `/sales/todo`, `/sales/quotes`) — Tulajdonos, Sales
- Szakaszos tábla, munkalisták, ajánlat-riport; szakaszváltás az engedélyezett átmenetek szerint.
- **„Megnyertük”**: létrehozza a projektet; az ajánlatok, utánkövetések, kapcsolattartó automatikusan a projekthez kapcsolódnak (nem másolódnak).
- A régi `/sales/handoff` oldal megszűnt (felirat jelzi).

### 3.5 Ügyfelek, cégek, kontaktok (`/customers`, `/companies`, `/contacts`) — mindenki
- Ügyféldosszié: kontaktok, projektek, utánkövetések, jegyzetek, kampányok, dokumentumok, levelezés; Marketingnek külön munkanézet. Cégek Excel-exportja.
- Hiány: **cégeknek nincs székhely/számlázási cím mező**, magánszemélyek szerződéses adatai nincsenek.

### 3.6 Ajánlatok (`/quotes`) — Tulajdonos, PM, Sales
- Két munkamód (saját ajánlat / kapott költségvetés), legfeljebb négy lépés; verziók és alternatívák; tulajdonosi sablon-alapértékek; közös előnézet és nyomtatás.
- **Küldés** kizárólag a saját Gmail-fiókból, ellenőrzött útvonalon; „elküldött” állapot csak igazolt Gmail-siker után; utólag Gmailben küldött levél csak élő SENT üzenettel köthető. Elküldött ajánlat zárolt.
- Élő: 11 ajánlat (8 piszkozat, 2 elküldött, 1 tárgyalás), 3 küldésnapló.

### 3.7 Projektek és PM (`/projects`, `/tasks`, `/meetings`) — Tulajdonos, PM, Sales (projekt)
- Projekt adatlap: státusz (csak kivitelezési státuszok), feladatok, kontaktok, csatolt levelek, ajánlatok, dokumentumok, idővonal, **Átadás fül** (11 tételes Sales→PM lista + műszaki átadási lista), szerződés-előkészítési lista.
- Élő: 4 projekt (1 előkészítés, 1 kivitelezés, 2 átadás), mind PM-mel; **0 feladat** rögzítve; a 6. csomag felmérésekor egyik projektnek sem volt címe/határideje.
- **NINCS:** TIG-kiállítás/aláírás, anyagigény-nyilvántartás, önálló napi építési napló, PM-átvétel naplózása.

### 3.8 Jelenlét, bér, kifizetések (`/attendance/...`) — Tulajdonos, PM (kifizetés: Tulajdonos)
- Csoportos és gyors jelenlétrögzítés, időszakos összesítő és bérszámítás, dolgozók és jelenlét-projektek kezelése, kifizetési előzmények, CSV-export, útmutató.
- Élő: 14 dolgozó, 3 jelenlét-projekt, 3 jelenléti bejegyzés.
- Hiány: a jelenlét-projektek **nincsenek összekötve** a CRM-projektekkel.

### 3.9 Dokumentumtár (`/documents`) és rekordszintű dokumentumok — Tulajdonos, PM
- Egységes lista, keresés/szűrés, forrás és kapcsolódó rekord, „NINCS ÖSSZEKÖTVE / NINCS ADAT” jelölés, deduplikációs jelzés; megnyitás aláírt, 5 percig érvényes letöltőlinkkel.
- Dokumentumok megjelennek a Pipeline-ban, lead/dosszién, ügyféllapon, projektlapon is. Sales/Marketing a Dokumentumtárat nem éri el (útmutatást kapnak).
- Élő: 25 projektdokumentum (**mind projekt nélkül**), 11 ügyfél-, 5 ajánlati dokumentum, 1219 levélmelléklet (ez utóbbi nincs a Dokumentumtárban).

### 3.10 Marketing és kampányok (`/campaign-list`, `/data-quality`) — Tulajdonos, PM, Marketing
- Kampány munkalista, címzettek, piszkozat-előellenőrzés, egyéni levélírás; adatminőség-, duplikátum- és cégkötés-ellenőrzés.
- Küldési keret: napi 40 foglalás fiókonként; TESZT-küldés csak a megadott TESZT-címekre, kifejezett megerősítéssel. „Előellenőrzött” ≠ küldési engedély.
- Élő: 1 kampány („Hideg Email Kampány”, piszkozat), 0 kiküldési tétel. Ügyfélküldés és automatikus ütemező **KIKAPCSOLVA**; megnyitás/kattintás-követés **NINCS**.

### 3.11 Levelezés / Gmail (`/emails`, `/settings/gmail`) — mindenki (saját fiók)
- Saját Gmail csatlakoztatása, postafiók- és szállista, olvasás, válasz (csak saját feladóval), mellékletek, céghez/projekthez kötés.
- Élő: 7810 levélszál, 12 103 levél (659 az elmúlt 7 napban); utolsó szinkron 2026-11-14 09:20 UTC.
- Kikapcsolt Gmail-fiók nem csatlakozik újra automatikusan; Ramon és info fiók hozzáférése változatlan.

### 3.12 Weboldali ajánlatkérések (`/web-quote-requests`) — CRM-szerepkörök
- vibateam.hu űrlap → CRM aláírt (HMAC) szinkron, ~2 mp, ismétlésvédett. Eredeti beküldés változatlanul megjelenik, ellenőrzött CRM-felvétellel.
- Élő: 19 beküldés (1 az elmúlt héten). Adatbázisból kliens oldalról nem olvasható, csak szerveroldali jogosultság-ellenőrzés után.
- Nyers beküldésből **nem lesz automatikusan Sales-lead**; „feldolgozva” állapot nincs tárolva.

### 3.13 Utánkövetések, hívások, aktivitás, értesítések
- `/followups`, `/calls`, `/meetings`, `/activity`: nyilvántartások és közös idővonal.
- `/notifications`: személyes értesítések (azonnali / összesítő), olvasottság eseményenként; élő: 29 értesítés az elmúlt héten.

### 3.14 Súgó és hibaközpont (`/help`)
- Négy szerepkörös, gombszintű súgó; hibabejelentés saját/Tulajdonosi láthatósággal.
- **Fontos:** bejelentés után a felület automatikusan elindítja George (fizetős) AI-vizsgálatát (`src/components/help/issue-center.tsx`). Élő: 1 bejelentés.

### 3.15 Beállítások (`/settings`) — főként Tulajdonos
Profil, Gmail (mindenkinek); felhasználók, szerepkörök, jogosultság-audit, biztonsági napló, tárhely (R2) állapota, OpenAI-információ, dashboard-státuszok, AI-láthatóság, AI-futásnapló, AI-felülvizsgálat, Google Ads, tudásgráf, weboldal-tudás. Importellenőrzés (`/import-review`, `/import-review/mail`) csak Tulajdonosnak.

---

## 4. Fő munkafolyamatok végig

```text
1. Weboldali űrlap ─► Weboldali ajánlatkérés (CRM) ─► Marketing kézi feldolgozás
                                                     (nem automatikus)
2. Lead ─► Sales-előkészítés ─► Pipeline szakaszok
3. Ajánlat (verzió / alternatíva) ─► igazolt Gmail-küldés ─► utánkövetés
4. „Szerződés” szakasz + szerződés-előkészítési lista (12 tétel)
5. „Megnyertük” (ellenőrzött adatbázis-művelet) ─► a projekt létrejön
6. Átadás fül (11 tétel: cím, határidő, ajánlat, kontakt, dokumentum…)
7. PM napi munka: feladatok, jelenlét, bér   (TIG / anyagigény: NINCS)
```

- Minden ellenőrzőlista-tétel forrásra mutat; hiányzó forrásnál „NINCS ADAT” vagy „NINCS ÖSSZEKÖTVE” jelenik meg, kitalált rekord nem.
- **Szerződés-jóváhagyás és aláírás nincs a rendszerben** — a lista csak előkészít, nem hagy jóvá.

---

## 5. AI-asszisztensek (AI OS)

### 5.1 Felépítés
- Egyetlen AI-rendszer (`src/lib/ai-os/`): közös futtató, eszköznyilvántartás, jóváhagyás, memória, napló. Régi AI-réteg törölve.
- **Modell:** minden agent OpenAI `gpt-6-astra`, Responses API, reasoning *high* (`src/lib/ai-os/model-config.ts`); nincs Lovable/Gemini tartalék.
- Két felület ugyanazzal a beszélgetésrendszerrel: a jobb oldali AI-panel és az `/ai-assistant` oldal. A beszélgetések szövege **a böngészőben** tárolódik (szerveren 56 szál-rekord, 0 üzenet); George ezeket nem olvassa.
- Jogosultság: eszköz csak akkor érhető el, ha az agent, a felhasználó szerepköre és az AI-láthatósági beállítás is engedi; a hívásnál a szerver újra ellenőriz. Az AI csak azt látja, amit a felhasználó maga is láthat.
- Alapelvek (9 szabály, `constitution.ts`): csak eszközből származó tény, „nincs elég adat” kimondása, magyar nyelv, hatással járó művelet csak jóváhagyással, titok védelme, a beolvasott tartalom adat, nem utasítás.

### 5.2 Az agentek
| Agent | Szerep | Ki használhatja (élő beállítás) | Olvas | Írhat (csak jóváhagyással) | Nem tehet |
|---|---|---|---|---|---|
| **George** | Központi navigátor, koordinátor | Mindenki | Keresés, cégek, kontaktok, projektek, leadek, levelek, memória, tudásgráf, weboldal-tudás; szakértő bevonása | Memória | Üzleti adatot nem ír; szakértő válaszát nem találhatja ki |
| **Scarlet** | Marketing | Tulajdonos, Marketing | Cégek, kontaktok, leadek, marketing-levelezés, tudás | — (semmi) | Nem küld levelet, kampányt nem indít |
| **Timothy** | Sales (V3.1) | Tulajdonos, Sales | Leadek és előzmények, ajánlatok és összevetés, utánkövetések, jogosult levelek, dokumentumok, napi prioritás, figyelő jelzések, korábbi nettó egységárak | Előkészítési aktivitás, következő lépés, utánkövetés, kapcsolattartó, Pipeline-szakasz, felelős (csak Tulajdonos), e-mail küldés, megnyerés→projekt | Memóriát nem ír; más postafiókot nem lát; egységárból nem számol költséget/árrést |
| **Boss** | Projektvezetési asszisztens | Tulajdonos, PM | Cégek, projektek, feladatok, utánkövetések, találkozók, tudás | Memória | Projektet/feladatot/határidőt nem módosít |
| **Michael** | Google Ads | Csak Tulajdonos | Fiók, kampányok, kulcsszavak, keresések, költségkeret, konverziók, javaslatok | Kampány szüneteltetése/indítása, költségkeret, negatív kulcsszó, memória; kampány törlése csak „MEGERŐSÍTEM” szóval | Önálló költés nincs |

Megjegyzés: a 2026-11-13-i teljes AI-audit szerint „Michael nem ír” — ez pontatlan; a kódban a fenti, jóváhagyáshoz kötött Ads-műveletek regisztrálva vannak.

### 5.3 Jóváhagyás (P0) — hogyan ír az AI
1. Az AI javaslatot tesz; a szerver rögzíti a pontos, befagyasztott tartalmat (30 perc érvényesség).
2. A felhasználó jóváhagy / elutasít; veszélyes műveletnél be kell írni: **MEGERŐSÍTEM**.
3. A szerver újra ellenőrzi a jogosultságot, egyszer „lefoglalja” a műveletet, és csak a tárolt tartalmat hajtja végre.
4. Siker csak visszaolvasással igazolva; bizonytalan kimenetel (pl. e-mail) **nem ismétlődik** automatikusan.
Élő: 948 AI-futás és 1564 futási lépés van naplózva.

### 5.4 Memória, tudásbázis, dokumentumok
- **Memória:** rekordokhoz kötött (felhasználó, cég, kontakt, lead, projekt, beszélgetés), közös/privát; Scarlet és Timothy nem ír bele. Élő: 16 memóriabejegyzés.
- **Tudásbázis:** 821 dokumentum, 1110 szövegrészlet. Feldolgozási állapot: 148 feldolgozott, 8 részleges, 28 kézi ellenőrzésre vár, 2 hibás, 635 nem támogatott formátum. **OCR nincs.** A tudásbázis nem bővíti a jogosultságot.
- **Tudásgráf és weboldal-tudás:** 176 csomópont, 197 kapcsolat; 123 weboldal-oldal feldolgozva.

### 5.5 George szervezeti jelzések, AI-felülvizsgálat, tulajdonosi jelentés
- **Szervezeti jelzések** (5. csomag): élő, AI-hívás és írás nélküli osztályozás — hiányos átadás, lejárt Sales/projekt teendő, bizonyíték nélküli „elküldött” ajánlat, panasz/hiba, dokumentum- és importhiány; felelős, állapot, következő lépés. Csak Tulajdonos.
- **Óránkénti AI-felülvizsgálat:** az ütemezés (`ai-review-hourly`, minden óra 7. perc) él, de a kapcsoló **kikapcsolva** (`enabled=false`, nincs jóváhagyó), 0 futás, 0 jelzés. Beállított keretek: napi 6 vizsgálat, napi 1,5 millió token. Bekapcsolás tulajdonosi költségdöntés.
- **Tulajdonosi AI-jelentés:** igény szerint, forrásazonosítókkal; azonos tényeknél 0 AI-hívás.

### 5.6 Élő AI-használat
- Az utolsó sikeres futások: Timothy napi összefoglaló ma 09:18 UTC; George 2026-11-13 20:33; Scarlet 2026-11-06; Boss gpt-6-astra modellel még nem futott (utolsó futás 2026-06, régi modellel); Michael utolsó futása 2026-08-22.
- **2026-11-12 19:11–19:15 UTC között az OpenAI-fiók kifogyott a kreditből (429-es hiba)**; azóta a futások ismét sikeresek. Javasolt a keret figyelése.
- 2026-11-13-án 2 Timothy-futás hibával zárult; egy beragadt napi összefoglaló tulajdonosi jóváhagyással lezárva.

### 5.7 AI-minőség és tesztek
- `bun run ai:acceptance`: statikus jogosultsági/szerepkör-ellenőrzés, ma **21/21 OK** (5 agent). Ez nem méri a válaszok tartalmi pontosságát.
- Timothy 300 esetes kockázati katalógus: 145 determinisztikusan megfelelt, 155 NEM TESZTELT; valódi modellmintán 12-ből 9 helyes (75%) — a 95%-os cél **nincs igazolva**.

---

## 6. Integrációk és háttérfolyamatok

| Integráció / folyamat | Állapot | Megjegyzés |
|---|---|---|
| Gmail OAuth és szinkron | MŰKÖDIK | `gmail-incremental-sync` percenként fut; titokkal védett belépési pont; tartós hiba esetén 24 órás visszatartás. |
| Gmail küldés | MŰKÖDIK | Csak saját, aktív fiókból; ajánlatnál idempotens, igazolt naplóval. |
| Cloudflare R2 fájltár | MŰKÖDIK | Feltöltés/letöltés 5 perces aláírt linkkel, szerveroldali ellenőrzéssel; méretkorlát 50 MB (kimenő melléklet 20 MB). |
| vibateam.hu → CRM űrlapszinkron | MŰKÖDIK | HMAC-aláírás, ±5 perc időablak, ismétlésvédelem. |
| OpenAI | MŰKÖDIK | Kreditfüggő (lásd 5.6). |
| Google Ads | BEKÖTVE (Tulajdonos) | Michael jóváhagyásos műveletekkel. |
| Weboldal-tudás feltérképezés | MŰKÖDIK | Kézi indítás vagy Netlify-webhook. |
| Valós idejű frissítés | MŰKÖDIK | Egy közös csatorna 14 táblára, 0,6 mp-es összevonással. |
| Óránkénti AI-felülvizsgálat | KIKAPCSOLVA | Lásd 5.5. |
| Kampány-ütemező | KIKAPCSOLVA | Nincs ügyfélküldési engedély. |
| Számlázás / bank / Billingo | NINCS | — |
| E-aláírás | NINCS | Szolgáltatóválasztás nyitott. |

---

## 7. Biztonság és adatvédelem
- Minden oldal belépéshez kötött; az adatokat az adatbázis sorszintű szabályai védik, szerepkör nélkül semmi nem látható.
- Gmail-tokenek a böngészőből nem olvashatók; csak szerveroldali, jogosított kliens kezeli.
- Weboldali ajánlatkérések közvetlen adatbázis-elérés nélkül, csak szerveroldalon olvashatók.
- Fájlokhoz csak olyan letöltőlink készül, amelynek rekordját a felhasználó láthatja.
- Ismert gyengeség: a **projekt- és ügyfél-dokumentumok olvasási szabálya túl tág** (minden PM/Sales/Marketing minden projekt fájlját láthatja adatbázisszinten); a felület szűr, de ez nem biztonsági garancia. Javítás döntésre vár.
- Utolsó dokumentált biztonsági pillanatkép (2026-11-06): 53 jelzés (46 hiba, 6 figyelmeztetés, 1 info) — nem friss, újrafuttatás javasolt. Ugyanekkor a kódstílus-ellenőrző (lint) 15 251 hibát jelzett (nem működési hiba, de karbantartási adósság).

---

## 8. Élő adat-pillanatkép (2026-11-14 09:20 UTC, csak olvasás)

| Adat | Darab |
|---|---|
| Leadek | 10 (1 új, 1 ajánlat-előkészítés, 2 utánkövetés, 4 megnyert, 2 elveszett) |
| Cégek / kontaktok | 664 / 701 |
| Ajánlatok / tételek / küldések | 11 / 3 / 3 |
| Projektek / feladatok | 4 / 0 |
| Utánkövetések / aktivitások | 9 / 396 |
| Levélszálak / levelek / mellékletek | 7810 / 12 103 / 1219 |
| Viba-Team.kft céghez kötött levélszál | **4605** (11-01: 4267; 11-06: 4543 — nő, a szinkron tovább ide köt) |
| Dokumentumok (projekt / ügyfél / ajánlat) | 25 (mind projekt nélkül) / 11 / 5 |
| Weboldali ajánlatkérések | 19 |
| Nyitott importellenőrzési tételek | 74 (14 cég, 39 levélszál, 21 hibás e-mail-cím) |
| Projektjelöltek | 11 |
| Kampányok | 1 (piszkozat) |
| Jelenlét: dolgozók / bejegyzések | 14 / 3 |
| AI-futások / tudásbázis-dokumentumok / értesítések (7 nap) | 948 / 821 / 29 |

---

## 9. Tesztállapot
- **Friss futás (2026-11-14 09:21 UTC):** 99 tesztfájl, **1090/1090 sikeres**; AI acceptance **21/21 OK**.
- Csomagonként a tesztszám folyamatosan nőtt (895 → 913 → 935 → 954 → 990 → 1020 → 1050 → 1090), regresszió nélkül.
- Böngészős ellenőrzések minden csomagnál **izolált, kitalált TESZT-adatokkal, írások tiltásával** készültek asztali és mobil méretben.
- **NEM TESZTELT, minden csomagra:** valódi bejelentkezett Tulajdonos/Sales/PM/Marketing végigpróba, valódi adatbázis-jogosultság (RLS) negatív esetei éles fiókkal, tényleges mentés és visszaolvasás, R2-letöltés, Gmail-küldés, „Megnyertük” éles beküldése, kampány TESZT-küldés.

---

## 10. Fejlesztési előzmények (legutóbbi csomagok)
| Csomag | Commit | Tartalom |
|---|---|---|
| AI OS 2.0, 10 szakasz | `93c03ff` (összesítő) | Tudásbázis, dokumentumfeldolgozás, George–szakértő együttműködés, értesítési központ, AI-felülvizsgálat, tulajdonosi jelentés, átláthatóság |
| 1. Sales napi munka | `0cba1be` | Következő teendő, ajánlat-ellenőrzés, mobil Pipeline |
| 2. Marketing napi munka | `192dc26` | Prioritások, kampányállapot, Scarlet gyorskérdések |
| 3. PM napi munka | `057a034` | Projektjeim ma, feladatok, jelenlét, átadási lista |
| 4. Tulajdonosi napi munka | `0b0e80d` | Hat sávos prioritás, követelések „nincs adatkapcsolat” |
| 5. George szervezeti jelzések | `4e8e0e8` | Élő, AI nélküli jelzések |
| 6. Sales → PM átadás | `e7f0aa0` | 11 tételes átadási lista, Owner-only PM-kijelölés |
| 7. Szerződés-előkészítés | `f97312f` | 12 tételes lista, döntési terv (nem élesített) |
| 8. Szerepkörös dokumentumelérés | `0fab5a6` (+`e644889`) | Egységes dokumentumlista és megnyitás |

Visszaállítás csomagonként: `git revert <commit>`. Adatbázis-szintű visszaállítási pillanatképek: `docs/rollback/` (történeti, nem teljes mentés).

---

## 11. Nyitott hiányok és tulajdonosi döntésre váró témák

### 11.1 Adatminőség (éles adat, csak jóváhagyással tisztítható)
1. **Viba-Team.kft alá kötött 4605 levélszál** — tételes, azonosító szerinti áttekintés; előtte pillanatkép és visszaállítási eljárás. Tömeges művelet tilos; a korábbi „1625 biztosan leválasztható / 101 átköthető” besorolás **nem végrehajtási engedély**.
2. 74 nyitott importtétel: 14 bizonytalan cég (10 lehetséges duplikátum), 39 vitatott levélszál (azonosító a címben megvan), 21 hibás e-mail-cím.
3. 11 projektjelölt és 5 importált, minősítésre váró Sales-lead.
4. 25 projekt nélküli dokumentum kézi hozzárendelése tételes lista alapján.
5. Jelenlét-projektek összekötése a CRM-projektekkel.

### 11.2 Új nyilvántartások (adatbázis-bővítés kell, külön engedéllyel)
6. Szerződés-nyilvántartás, tulajdonosi döntésnapló, elfogadott ajánlatváltozat jelölése.
7. E-aláírás szolgáltatója.
8. Cégcím és magánszemélyes szerződéses adatok (előbb adatvédelmi vizsgálat).
9. TIG, anyagigény, napi építési napló; PM-átvétel naplózása.
10. Cím és határidő bekérése már a megnyeréskor.
11. Pénzügyi kapcsolat (számla, befizetés, kintlévőség).

### 11.3 Jogosultság
12. Projekt- és ügyfél-dokumentumok olvasásának szűkítése projekthez/felelőshöz.
13. Dokumentumtár Sales-hozzáférése (csak a 12. után).
14. Levélmellékletek megjelenítése a Dokumentumtárban.

### 11.4 AI és költség
15. Óránkénti AI-felülvizsgálat bekapcsolása (költségkeret jóváhagyása).
16. OCR bekapcsolása szkennelt dokumentumokra.
17. Hibabejelentés automatikus, fizetős George-vizsgálatának megtartása vagy kézire állítása.
18. OpenAI-kreditkeret figyelése (11-12-én elfogyott).
19. Timothy 95%-os pontossági cél mérése valódi esetekkel.

### 11.5 Marketing
20. Ügyfélkampány-küldés és ütemező engedélyezése; kampányszöveg mentése; TESZT-küldés végigpróbája.
21. Weboldali ajánlatkérés „feldolgozva” állapota.
22. Marketing szerepkörű munkatárs felvétele (jelenleg nincs aktív).

### 11.6 Átvétel
23. **Bejelentkezett, szerepkörös végigpróba** mind a négy szerepkörrel, TESZT-rekordokon, a küldések/éles írások előzetes jóváhagyásával.
24. Publikálás: az utóbbi csomagok kódja a tesztkörnyezetben van; hogy az éles oldalon mi fut, publikáláskor kell eldönteni.

---

## 12. Dokumentációs jegyzék
- **Részletes csomagjelentések:** `docs/system-map/` (pl. `sales-pm-atadas-6-csomag-2026-11-14.md`, `szerzodes-elokeszites-7-csomag-2026-11-14.md`, `dokumentumtar-szerepkoros-8-csomag-2026-11-14.md`, `ai-os-2-0-10-szakasz-osszesitett-atadas-2026-11-13.md`, `levelszal-dry-run-2026-11-06.md`).
- **Kézikönyvek (2026-10-30, történeti):** `docs/manuals/` — Marketing, Sales, Tulajdonosi, Ajánlatkezelő V2.1.
- **Integráció:** `docs/integrations/website-lead-sync-api-v1.md`.
- **AI-minőség:** `docs/qa/` (Timothy kockázati katalógus és mintaeredmények).
- **Műszaki szabályok:** `AGENTS.md`, `src/lib/ai-os/README.md`.
- A beépített súgó (`/help`) a napi használat elsődleges útmutatója.

## 13. Pontosítások a korábbi jelentésekhez
- Michael tud jóváhagyásos Ads-műveletet végezni (a 11-13-i audit szerint nem — ez pontatlan).
- A hibabejelentés **indít** automatikus George-vizsgálatot (a 11-06-i súgójelentés szerint még nem — azóta változott).
- Az AI alapelvek száma 9 (a README még 7-et ír).
- A Viba-Team céghez kötött levélszálak száma azóta nőtt: 4605.
