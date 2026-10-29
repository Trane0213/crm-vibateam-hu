# Teljes CRM működési audit – terv

Cél: átfogó, csak olvasó audit a teljes rendszerről. Semmit nem módosítunk; a végén részletes jelentés készül, és utána közösen döntünk a javításokról.

## Mit vizsgálok (modulonként)

1. **Bejelentkezés és jogosultságok** – szerepkörök (tulajdonos, projektvezető, sales, marketing), ki mit lát, mely oldalak védettek.
2. **Cégek, kapcsolattartók, leadek, ajánlatok** – lista, adatlap, szűrés, Excel export, Sales→PM átadás.
3. **Projektek (PM modul)** – PM Today, projekt adatlap, feladatok.
4. **E-mailek** – postafiók-fülek, szálak szűrése, válasz/továbbítás, szinkron.
5. **Jelenléti rendszer** – rögzítés, összesítő, fizetés-számítás (napok × napidíj + bérlet − előleg), kifizetések nézet.
6. **AI rendszer** – George, Scarlet, Timothy, Boss, Michael: jogosultságok, tool-hívások, acceptance tesztek futtatása (`ai:acceptance`).
7. **Website Knowledge és Knowledge Graph** – crawl futások, node/edge számok, publisher.
8. **Google Ads (Michael)** – kapcsolat állapota, adatlekérések.
9. **Marketing modul.**
10. **Biztonság** – a legutóbbi gyors adatbázis-ellenőrzés nem talált hibát; mély biztonsági vizsgálat nincs friss, ezt a Security fülön érdemes elindítani. Biztonsági szempontból nem nyilvánítom „biztonságosnak” az appot nélküle.
11. **Kódminőség** – túl nagy fájlok (pl. Website Knowledge beállítások ~1300 sor, Marketing workspace ~1150 sor), duplikált segédfüggvények, félbehagyott átállások, elnyelt hibák, teljes táblák betöltése lapozás nélkül, hiányzó tesztek a kritikus folyamatokon.

## Hogyan

- Kód átolvasása modulonként, valós adatlekérdezések (rekordszámok, utolsó futások), hibanaplók átnézése.
- Ahol lehet, élő kattintásos ellenőrzés a felületen bejelentkezve.
- Meglévő tesztek és AI acceptance tesztek lefuttatása.

## Eredmény

Egyetlen jelentés, modulonként: **működik / hibás / hiányos / félkész**, súlyossággal (kritikus, fontos, apró), és egy rövid, sorrendbe tett javítási javaslat. Kódmódosítás csak a te jóváhagyásod után.
