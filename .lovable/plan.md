# George által koordinált belső felülvizsgálat – négy szakasz

## Aktuális blokkoló és már elkészült részek
**A meglévő `issue_reports` bővítése NEM alkalmazott.** A korábbi terv jóváhagyása után indított migráció a közben érkezett pontosítás miatt végrehajtás előtt megszakadt. Friss sémaellenőrzés: csak a régi hibajegymezők léteznek; a négy kategória mentése, AI-eredet és fejlesztési backlog nem kész.

Megmarad: négy szerepkör kereshető gombszintű súgója, `/help`, George megnyitása, régi működésihiba-beküldés és saját/Owner hibajegylista. Az új kategóriák a felületen előkészíthetők, de mentésüket jóváhagyási jelzés tiltja.

Létezik az AI OS közös `runAgent`, szerepkör/eszköz-metszet, George-handoff, futásnapló és tokenstatisztika. Boss jelenlegi hatásköre valóban projektek/határidők/kockázatok/dokumentumhiány; ezt nem bővítjük. A Timothy napi brief tartós claim/cache mintája újrahasználható, de **nem kész általános óránkénti scheduler**. George nem olvassa eszközzel a friss súgót vagy infrastruktúra-naplókat. A gyökérhiba-kezelő opcionális Lovable-hookja nem igazolt technikai naplóforrás; az előző ellenőrzéskor nem volt hozzáférhető Sentry-kapcsolat.

## 1. szakasz – közös jegyzék, emberi és AI-forrás
**Most csak ezt a szakaszt lehet engedélyezni; a továbbiak nem indulnak automatikusan.**

- A meglévő `/help` és egyetlen `issue_reports` tároló bővítése; nincs második backlog. Használati kérdés / működési hiba / UX-nehézség / fejlesztési javaslat, természetes nyelvű leírás, opcionális reprodukció és várt/tapasztalt eredmény.
- Bejelentő és forráseredet külön: ember / megnevezett meglévő AI / automatikus ellenőrzés. Az AI-javaslat nem emberi megerősítés; a fejlesztési igény nem bizonyított hiba. Bizonyítottság külön: igazolt / nem igazolt / nem vizsgálható.
- Saját/Owner hozzáférés, korrelációazonosító, üzleti hatás, státusz, kezelő; megőrzött eredeti jelentések és visszakövethető kezelési változások. Duplikáció csak összekapcsolás, nem törlés vagy szövegfelülírás. Más dolgozó jegye/azonosítója nem jelenhet meg a saját listában.
- A korábbi SQL-javaslatot célzottan felülvizsgáljuk: a forráseredet, szerver által ellenőrzött AI-forrás és kezelési előzmények még hiányoznak belőle. **Új pontos SQL + hatáselemzés + adatmegőrző rollback után külön migrációs jóváhagyás következik. A régi SQL nem fut változtatás nélkül.**
- Emberi beküldés önmagában menthető, az AI véleményétől függetlenül. AI/automatikus forrásmezőt a dolgozó nem hamisíthat; ezek írása csak később engedélyezett belső review-útvonalon kapcsolható be.
- Teszt: négy szerepkör, saját/idegen/anon/Owner RLS, forráshamisítás, duplikáció/ciklus, immutable eredeti és előzmények, mentési hiba/siker/visszaolvasás, mobil. Hitelesített éles próba elérhetetlenség esetén NEM TESZTELT.

**STOP:** pontos migráció jóváhagyása nélkül nincs új kategóriamentés. Alkalmazás és céltesztek után külön jelentés, 2. szakaszhoz új engedély.

## 2. szakasz – George és specialisták strukturált review-ja
- A friss szerepkörsúgó bounded, read-only elérése George számára a meglévő AI OS-ben. Közvetlen specialista–specialista beszélgetés és új agent nincs.
- George csak indokolt ügyet továbbít Scarletnek / Timothynak / Bossnak, a meglévő szerepkör-, rekord- és eszközjogosultságok metszetében. Háttér-review-ban **kizárólag read-only toolok**, nincs memory/CRM/levél íróművelet vagy jóváhagyási végrehajtás.
- Bemenet: minimális ügy-/forrásazonosító, kategória, normalizált oldalminta, hibakód, idő és engedélyezett vizsgálati referencia. Nincs automatikus nyers üzleti tartalom-, levél-, dokumentum- vagy titokmegosztás. Jogosultság visszavonásánál a review leáll, nem Owner-scope-ra vált.
- Kimenet: vizsgálati lépések, megfigyelt kód, forrás és idő, igazolt tény / feltételezés / nem vizsgálható, következő ellenőrzés, javaslat. LLM-kijelentés önmagában nem bizonyíték; csak releváns, jogosult log vagy izolált teszt igazolhat működést/hibát.
- Naplóhozzáférés híján manuális vizsgálat és nem igazolt jelzés; ez nem blokkolja a bejelentést. Egyetlen opcionális külső technikai forrásként Sentry javasolt, **külön integrációs/adatvédelmi/költségjóváhagyással**. DSN a hibagyűjtéshez nem ad George-nak eseményolvasási jogosultságot; külön read-only kapcsolat szükséges. Fejlesztői MCP nem alkalmazásbeli tool.
- Egyszeri nem tolakodó segítségfelkérés csak valódi megfigyelt hibakódnál, AI-hívás nélkül; nem minden betöltéskor. Titkos gyűjtés nincs. Külső gyűjtés opt-in, allowlistelt metaadat, nincs cookie/token/név/email/request body/replay vagy nyers hibaszöveg.
- Teszt: jogosultsági deny, téves pozitív/negatív, hiányos forrás, anonimizálás, error-boundary fallback és visszajelzett lépések. Fizetős próba csak külön engedéllyel.

**STOP:** hiányzó jogosult log/credential esetén a diagnózis NYITOTT; 3. szakasz külön engedély.

## 3. szakasz – egy óránkénti, kikapcsolható delta-feladat
- **Egyetlen feladat, óránként legfeljebb egyszer:** olcsó read-only delta-check az engedélyezett metaadatokon. Változatlan jelre nincs LLM-hívás; változatlan nyitott jegyet sem elemez újra óránként. Hiányos/hibás olvasás nem azonos a „nincs változás” állapottal.
- Új vagy érdemben változott indokolt ügyekhez célzott review, majd közös George-összesítő. Nem 24×4 chat, nem automatikus CRM-teszt vagy levélküldés. Forrásadatok csak olvashatók; működési lease/cursor/audit és belső javaslat tárolása szükséges, üzleti rekordírás nélkül.
- Tartós tranzakciós run-lock/lease, legfeljebb egy futás, futási UUID és órakulcs; delta watermark csak sikeres feldolgozás után, előző eredmény deduplikálása. Bizonytalan LLM-kimenetel nem automatikusan újrapróbálható.
- Javasolt induló korlátok, külön jóváhagyásra: 20 változásellenőrzési tétel/futás, legfeljebb 2 elemzett ügy/futás, ügyenként legfeljebb 1 releváns specialista + 1 George-összesítés, összesen legfeljebb 4 LLM-hívás/futás és 8/nap. Ez felső korlát, nem cél; változás nélkül nulla.
- Input/context és tokenkeret API-szinten, számlált futási/tokenstatisztika; tényleges költség csak hiteles árazás/usage alapján. Pénzügyi keret hiányában az automatika kikapcsolva marad. Keretkimerülés, 402/403, ismételt 429 → tartós szünet, Owner-feloldás; nincs szolgáltató-/modellváltás.
- Kikapcsolva az alapállapot. Ütemezés és AI külön kapcsolható; nincs automatikus óránkénti bekapcsolás a fejlesztés során.

**Szükséges kapuk:** külső időzítő és végpont-hitelesítés, szolgáltatói költségkeret, pontos tartós claim/cursor/limit migráció. A meglévő privát `ai_memory` claim-minta és `agent_runs`/`agent_run_steps` napló újrahasználata előnyben; pontos reserved-key/RLS terv szükséges, a meglévő AI-memóriát nem keverjük a review-állapottal. Második backlog nincs.

E projekt külső Supabase-án nem készítünk új `pg_cron`→`pg_net` HTTP-időzítést. Támogatott út: külső scheduler hívja a saját hitelesített TanStack végpontot. A meglévő Gmail cron nem használható fel erre és változatlan marad. Scheduler hitelesítés szolgáltatói aláírással vagy dedikált `AI_REVIEW_SCHEDULER_SECRET` megosztott titokkal; nem a Gmail kulcsával. Most nem kérünk titkot és nem indítunk időzítőt.

**STOP:** izolált lock/delta/dedup/limit/leállítás tesztek után külön engedély kell az aktiváláshoz; publikálás külön kapu.

## 4. szakasz – Owner összesítő és fejlesztési jóváhagyás
- George központi belső összesítője: napi rövid változásjelentés, heti priorizált javaslat, ugyanazon jegyekből, nem új backlogból. Üres napon nincs új összefoglaló LLM-hívás. A napi/heti összesítés ugyanazon óránkénti feladat esedékességi része, nem további scheduler.
- Azonnali belső jelzés csak **súlyos és igazolt rendszerszintű** problémánál, ismétlésvédelemmel. Egyéb esemény nem külön értesítés; értesítési csatorna meglévő belső felület, nem éles e-mail.
- Konkrét jegy/ref., tényleges ismétlődésszám és lefedettség, érintett munkakör, üzleti hatás, reprodukálhatóság/forrás, javasolt javítás, bizonytalanság. Indokolt becslés csak emberi vagy ellenőrzött forrással, egyébként „nincs megalapozott becslés”.
- Owner szűrhet/priorizálhat/jóváhagyhat vagy halaszthat. Jóváhagyott fejlesztési javaslat **nem** jogosít automatikus kód-/adat-/jogosultság-/levélmódosításra; megvalósítás külön kör.
- Teszt: csak Owner összesítő, saját jegyhez saját válasz, riasztási küszöb/deduplikáció, hamis igazolás és becslés tiltása, napi/heti esedékesség, küldés nélküli regresszió.

**STOP:** eredmények és fennmaradó NEM TESZTELT működések jelentése; nincs automatikus továbblépés.

## Technikai alapok és elfogadás
Újrahasznosítandó források: `src/lib/ai-os/{agents,tool-registry,runtime.server,runtime.functions}.ts`, `daily-sales.server.ts`, `briefing.functions.ts`, `audit-view.functions.ts`, meglévő `issue-reports.*`, `/help` és szerepkörsúgók. A napi brief mintái és korlátozott snapshotok nem bizonyítanak teljes rendszerlefedettséget.

Minden szakasz célzott unit/role/RLS teszt, érintett regresszió, AI acceptance és preview ellenőrzés; modellek változatlanok. Valós diagnózis kizárólag jogosult forrásból, élő üzleti adatot módosító teszt tilos. Hitelesített éles próba jelenleg nem biztosított; ezt NEM TESZTELT-ként jelöljük.

Ebben a tervezési körben nem módosítunk forráskódot, adatbázist, titkot vagy időzítést. A terv jóváhagyása után elsőként a `roadmap.md` és a tartós követelmények frissülnek, majd az **1. szakasz pontos, forráseredettel kiegészített migrációs javaslata** készül és kerül külön jóváhagyásra.

**Tervezési szakasz KÉSZ; ügytároló-bővítés továbbra is BLOKKOLT a felülvizsgált pontos SQL jóváhagyásáig. Mehet kizárólag az 1. szakasz?**