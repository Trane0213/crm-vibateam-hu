# Pipeline audit + teszt lead végigfuttatása

## Cél
Ellenőrizni, hogy a Sales pipeline (lead → ajánlat → megnyert → projekt átadás PM-nek) minden lépésében van-e felelős, és nincs-e benne régi, beragadt kód vagy működés.

## 1. Csak olvasó átvizsgálás (semmi nem módosul)
- Pipeline lépések és státuszok összevetése a kódban és az adatbázisban (lead státuszok, kötelező „következő lépés", megnyert → projekt kötelező).
- Felelősök: minden lépésnél kié a lead (sales felelős), az utánkövetés, az ajánlat, és a projekt (projektvezető). Megnézem, a jelenlegi 17 leadből hánynak nincs felelőse vagy következő lépése, és van-e beragadt (régóta nem mozdult) lead.
- Régi kód keresése: párhuzamos / dupla mentési utak, nem használt oldalak és függvények, a régi AI réteg maradványai, régi státusznevek, amik már nem léteznek.
- Az adatbázis-szabályok (triggerek) egyeznek-e azzal, amit a felület enged.

## 2. Teszt lead végigfuttatása (jóváhagyás után)
Egy egyértelműen jelölt teszt lead: „AUDIT TESZT – törölhető".
1. Létrehozás → ellenőrzés: kapott-e felelőst, megjelenik-e a pipeline-ban és a Ma oldalon.
2. Státuszléptetés minden fázison → minden lépésnél: kötelező mezők, következő lépés, státusztörténet rögzül-e.
3. Utánkövetés és ajánlat hozzáadása → felelős látszik-e.
4. Megnyert → projekt létrejön-e, projektvezető hozzárendelődik-e, PM Today-ben megjelenik-e.
5. Negatív próbák: megnyerés projekt nélkül, felelős nélküli lépés — a rendszer helyesen tiltja-e.
6. Takarítás: a teszt lead, projekt és kapcsolódó rekordok törlése a végén (a törlés is jóváhagyó kártyán megy).

## 3. Eredmény
Rövid magyar jelentés: mi működik, hol hiányzik felelős, mi régi/beragadt kód, javasolt javítások sorrendben. Javítást nem végzek automatikusan — az külön döntés.

## Technikai megjegyzés
A lezárt Sales backend szabályokat nem módosítom; a teszt a meglévő `sales_mark_won_with_project` és triggerek útját használja.
