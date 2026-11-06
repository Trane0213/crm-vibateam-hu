# Marketing 1. kör – Gmail–CRM összerendelés, DRY-RUN (2026-11-06)

Csak SELECT; éles levél, szál, cégkapcsolat, checkpoint, jogosultság nem változott. Tesztfiók (viktor.csotai@gmail.com) kizárva.

| Postafiók | Saját tárolt levél | Szál | Már kapcsolt | Pontos kontakt → 1 cég (kapcsolatlan) | Több cég | Nincs CRM-kontakt | Csak belső/teszt |
|---|---|---|---|---|---|---|---|
| info@ | 9 824 | 6 391 | 4 558 | 12 | 0 | 1 461 | 360 |
| ramon.dencsi@ | 281 | 199 | 136 | 0 | 0 | 58 | 5 |
| pretor.laszlo@ | 717 | 570 | 239 | 2 | 0 | 289 | 40 |

Megjegyzés: a „már kapcsolt” öröklés; az info@ Viba-Team alá kötött ~4 267 szála ide számít, de a korábbi audit szerint nagyrészt téves (külön kezelendő, tömegesen nem írható át). Az alkalmazás nézete további szűrést ad (körlevél, gyűjtőcím, domain-only → Ellenőrizendő), ezért ott a „Biztosan kapcsolható” szám ≤ a fenti.

## Valódi szinkronhibák vs. hiányzó kontakt
- **pretor.laszlo@: 2026-09-07 – 2026-10-29 között ~74 900 futás `invalid_grant` (lejárt Google-engedély).** Ebben az ~7 hétben a levelek valószínűleg hiányoznak; a friss last_sync_at ezt NEM pótolja. Blokkoló: történeti visszatöltés (backfill) kell erre az időszakra — külön jóváhagyással.
- info@: 546, ramon: 37 futásban 404 („history expired” újraindítás / törölt üzenet); 25× 401, 8× időtúllépés.
- A kapcsolatlan szálak döntő része NEM szinkronhiba, hanem hiányzó CRM-kontakt (1 461 / 58 / 289).

## Kód
- `src/lib/gmail/relink-analysis.ts` + teszt: pontos e-mail → certain; mentett cég → linked; több cég/eltérés → conflict; domain, gyűjtőcím, körlevél, cég nélküli kontakt → review; tárgy fallback a szálra; kimenő utáni válasz felismerés.
- `relink-review.functions.ts`: tulajdonosi, csak olvasó; postafiók saját üzenetei; jelzi, ha a szál másik fiókban is van.
- Nézet: `/import-review/mail` (Adatellenőrzés alatt), fiók/kategória/keresés szűrés, 50-es lapozás 1000 fölött is.
- Checkpoint-javítás (`sync-incremental.server.ts`): félbeszakadt history-lapozás, határidő miatt feldolgozatlan vagy átmeneti hibás üzenet esetén a history checkpoint nem lép előre (404-es törölt üzenet végleges). Csak a következő publikálás után lép életbe.

## Ellenőrzés
623/623 Vitest (11 új), típusellenőrzés PASS. Bejelentkezett böngészős próba NEM TESZTELT (nincs munkamenet). Marketing szál-hozzáférés nem bővült. 2. kör nem indult.
