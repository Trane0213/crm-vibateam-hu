# CRM rendszer felépítésének áttekintése – terv

Cél: egy átlátható, könnyen érthető dokumentum arról, hogyan épül fel a teljes CRM. Csak olvasó vizsgálat, semmit nem módosítunk.

## Mit tartalmaz majd

1. **Nagy kép ábra** – a fő részek és kapcsolataik: felhasználók → felület → szerveroldali műveletek → adatbázis → külső szolgáltatások (Gmail, Google Ads, OpenAI, vibateam.hu weboldal).
2. **Modul-térkép** – minden modulról egy rövid lap:
   - Cégek, kapcsolattartók, leadek, ajánlatok (Sales)
   - Projektek / PM Today
   - E-mailek és postafiókok
   - Jelenléti rendszer és kifizetések
   - Marketing
   - AI asszisztens és agentek (George, Scarlet, Timothy, Boss, Michael)
   - Website Knowledge és Knowledge Graph
   - Google Ads
   - Beállítások
   Lapanként: mire való, mely oldalakon érhető el, milyen adatokat tárol, ki használhatja, mivel kapcsolódik.
3. **Szerepkörök és jogosultságok táblázat** – tulajdonos, projektvezető, sales, marketing: ki melyik modult látja, mit szerkeszthet.
4. **Fő folyamatok ábrái** – lead → ajánlat → projekt átadás; beérkező e-mail útja; jelenlét → fizetés számítás; AI kérdés → tool-hívás → válasz; weboldal crawl → Knowledge Graph.
5. **Adatbázis-térkép** – a fő táblák csoportosítva modulonként, és hogyan kapcsolódnak.
6. **Állapot és megfigyelések** – modulonként: működik / hiányos / félkész, plusz rövid kódminőségi észrevételek (túl nagy fájlok, duplikációk). Biztonság: a gyors adatbázis-ellenőrzés hibát nem talált; friss mély vizsgálat nincs, ezt a Security fülön érdemes elindítani.

## Formátum

- Egy letölthető dokumentum (PDF) a fenti fejezetekkel.
- Mellette ábrák (folyamat- és architektúra-diagramok), amik a chatben is megjelennek.

Javítás vagy kódmódosítás nem történik; a megfigyelések alapján utána közösen döntünk.
