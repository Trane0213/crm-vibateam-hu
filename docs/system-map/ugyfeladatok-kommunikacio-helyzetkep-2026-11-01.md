# Ügyféladatok és kommunikáció – 2026-11-01 helyzetkép

Csak olvasásos ellenőrzés: 2026-11-01, kb. 20:30 UTC. Élő adat, RLS, kód, import nem módosult, publikálás nem történt.
Jelölés: **NYITOTT**, **RENDEZETT**, **BIZTOSAN JAVÍTHATÓ**, **BIZONYTALAN** (kézi döntés), **NEM ÉRINTENDŐ**.

## 1. A 2026-10-29-i importellenőrző lista aktuális állapota

Forrás: `import_review_items` (batch `viba-excel-2026-10-29`), `project_candidates` és `leads`.

| Tétel | Régi szám | Mai DB | Állapot |
|---|---|---|---|
| Bizonytalan cég (`kind=company`) | 14 | 14 `open` | NYITOTT |
| Vitatott levélszál (`kind=email_thread`) | 39 | 39 `open` | NYITOTT |
| Hibás e-mail (`kind=invalid_email`) | 21 | 21 `open`; a kontaktok közül 15 `email_invalid=true` | NYITOTT; legalább 6 cím nem tartozik CRM-kontakthoz |
| Projektjelölt (`project_candidates`) | 11 | 11 `review`, egyiknél sincs `project_id` | NYITOTT |
| Importált Sales-lead | 5 | 5 db `email_inbound` / `new` (2026-10-29) | NYITOTT: a Sales még nem minősítette őket |

**Egyik tétel sem rendeződött az import óta.** A régi számok ma is pontosak, ezt a fenti lekérdezés tényszerűen igazolja.

### 1/a. A 14 bizonytalan cég: van-e már hasonló nevű cég?
Csak jelölés, nem egyesítés.

- **LEHETSÉGES DUPLIKÁCIÓ (10), egy vagy több hasonló nevű cég már létezik:**
  ATENOR (kétszer is!), Biggeorge→BNRG, CB Építő→Cb-épitető, Colas→Colas Út Zrt, GRABARICS, Indotek→Indotek Group, KÉSZ (két jelölt), STETTIN-HUNGARIA, Tamásy/Europabau→Tamásy kft, ÚTNET/Tópark→útnet Kft.
- **NINCS EGYEZÉS (4):** LANGBAU, MFB-Ingatlanfejlesztő, Molnár-Ház, Rezideo.
- Review-tétel UUID-k: lásd az `import_review_items` táblát, `kind='company' and status='open'`.

## 2. A Viba-Team.kft-hez kötött levélszálak

A Viba-Team.kft (`b454cd40-3473-4653-9424-9cc5bbebe527`) cégnél 4267 levélszál van, a teljes 6778-ból. A cégnek mindössze 1 kontaktja van, és egyik szála sincs leadhez kötve.

| Osztály | Szálak száma | Szabály | Javaslat |
|---|---|---|---|
| Belső (csak @vibateam.hu résztvevő) | 107 | nincs külső cím | NEM ÉRINTENDŐ (helyesen Viba-Team) |
| Promóciós / hírlevél / értesítés | 1625 | Gmail CATEGORY_PROMOTIONS/UPDATES/SOCIAL/FORUMS címke vagy noreply/hírlevél feladó | BIZTOSAN JAVÍTHATÓ: céghez kötés megszüntetése, `company_id → NULL` |
| Pontos e-mail egyezés más cég kontaktjával (1 cég) | 101 | külső résztvevő = egy másik cég kontaktjának címe | BIZTOSAN JAVÍTHATÓ: átkötés arra a cégre, egyenként listázva |
| Pontos egyezés több céggel | 1 | – | BIZONYTALAN |
| Csak domain-egyezés más céggel | 306 | céges domain, nem freemail | BIZONYTALAN: cégenkénti mintavétel után |
| Nincs bizonyíték | 2127 | magán gmail/freemail vagy ismeretlen domain | BIZONYTALAN / NEM ÉRINTENDŐ (marad, amíg nincs bizonyíték) |

A pontos egyezések között a legtöbb szál a Begavillhez tartozik (8 db, `564c63b4-…`). Ezt 4-4 szállal követi többek között az Atlasz-Tech, a Tendler Baut, a Stonerose, a LAKI, a Virtual Bau, a Magna Industrial és a Régió General.

Tömeges, 4000 szálas átkötés **nem** javasolt.

**A 39 vitatott szál:** a review-tételek nem tartalmaznak szálazonosítót, csak cégnév-javaslatot (pl. „Iconicteam.kft”). Ezért a döntés kizárólag kézi, cégenkénti egyeztetéssel hozható meg.

**Postafiókok:**
- A `gmail_accounts` tábla 0 soros. A szálak 5 tulajdonos-fiókra oszlanak: 6017 + 446 + 187 + 65 szál, továbbá 63 tulajdonos nélküli.
- Kikapcsolt fiókot nem csatlakoztattam újra.
- A Ramon- és az info-fiók hozzáférése (`email_thread_access`, 6784 sor) változatlan.

## 3. Céges adatlap és webes megkeresések
- A Marketing és a tulajdonosi/Sales adatlap ugyanazt a közös idővonal-forrást használja (`src/lib/company-activity.ts`, 2. szakasz), és ugyanabból a `customer_kpi_v` nézetből számol. Új eltérést nem találtam. A bejelentkezett felhasználói felületet nem teszteltem (**NOT TESTED**).
- A `quote_requests` táblát kizárólag a `/web-quote-requests` oldalak olvassák. Céges adatlapra, idővonalra vagy KPI-ba nem kerül, ezért nem keveredhet ügyfélcégekkel. **PASS**
- A Sales leadek száma 8, egyik sem a webes nyers megkeresésekből keletkezett. A 2 `web_form` lead TESZT, és még a 10-30-i Sales-próbából való. **PASS**
- A 16 történeti webes megkeresés forrásdátuma 2026-06-25 és 2026-10-05 közé esik: lakossagi 12, chat 2, general 1, tarsashazi 1.
  - **E-mail- vagy cégnév-egyezés egyik esetben sincs.**
  - **1 LEHETSÉGES telefonos egyezés:** `00ad6a88-88b9-4db0-ba51-c8e3e21f1fbc` (lakossagi, 07-14). A telefonszám a DANIEL-GENERAL Kft. és a Viba-Team.kft egy-egy kontaktjánál is szerepel, így akár belső vagy ismert szám is lehet. Kézi ellenőrzés kell, automatikus összekötés nem.
- A weboldal-projekt 7 bizonytalan rekordja (`docs/CRM-LEAD-SYNC-RECONCILIATION-2026-11-01.md`) **külön lista**. Nem azonos a fenti 14 bizonytalan céggel, és nem is került a CRM-be.

## 4. Kritikus hibák
- **Kritikus kódhibát nem találtam.**
- **A legnagyobb adatminőségi kockázat** a 4267 Viba-Team.kft-hez kötött levélszál. Emiatt a Viba-Team adatlap és idővonal félrevezető, az ügyfélcégek levelezése pedig hiányos. A hiba adatszintű, nem kódszintű.

## 5. Priorizált tisztítási munkalista (tulajdonosi döntésre)

| # | Tétel | Db | Besorolás | Visszaállítás |
|---|---|---|---|---|
| 1 | Promóciós/hírlevél szálak leválasztása a Viba-Teamről | 1625 | BIZTOSAN JAVÍTHATÓ | előtte `(id, company_id)` mentés CSV/tábla-pillanatkép; rollback = régi `company_id` visszaírása id alapján |
| 2 | Pontos e-mail egyezésű szálak átkötése a megfelelő cégre | 101 | BIZTOSAN JAVÍTHATÓ (listás jóváhagyással) | ugyanaz a pillanatkép |
| 3 | A 14 bizonytalan cég: 10 lehetséges duplikáció egyesítése/elvetése, 4 új vagy elvetendő | 14 | BIZONYTALAN | review-tétel státusz visszaállítható; cégegyesítés előtt kapcsolati pillanatkép |
| 4 | A 39 vitatott szál kézi cégenkénti döntése | 39 | BIZONYTALAN | pillanatkép |
| 5 | Domain-egyezésű szálak mintavételes ellenőrzése | 306 | BIZONYTALAN | pillanatkép |
| 6 | Hibás e-mailek: 15 kontakt jelölve, 6 cím nem tartozik CRM-kontakthoz | 21 | BIZONYTALAN (lezárás vagy kontaktjelölés) | review-státusz |
| 7 | Az 5 importált `email_inbound` lead Sales-minősítése | 5 | BIZONYTALAN (Sales döntése) | lead-státusztörténet |
| 8 | A 11 projektjelölt elfogadása vagy elvetése | 11 | BIZONYTALAN (tulajdonos/PM) | `review_status` |
| 9 | 1 webes rekord telefonos egyezésének ellenőrzése | 1 | BIZONYTALAN | – |
| 10 | Belső szálak; szálak, amelyekre nincs bizonyíték; 16 webes nyers megkeresés | 107 / 2127 / 16 | NEM ÉRINTENDŐ | – |

Végrehajtás csak tulajdonosi jóváhagyás után, tételenként, TESZT-mentés és pillanatkép mellett. Kikapcsolt Gmail-fiók nem csatlakoztatható újra, a postafiók-hozzáférések nem változtathatók.
