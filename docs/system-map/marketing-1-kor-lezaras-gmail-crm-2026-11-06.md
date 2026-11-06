# Gmail–CRM 1. kör biztonságos lezárása (2026-11-06)

Adatforrás: éles DB, kizárólag SELECT (`emails`, `email_threads`, `email_thread_access`, `contacts`, `companies`, `users_profile`, `gmail_sync_runs`). Elemzés: `src/lib/gmail/relink-analysis.ts` (ugyanaz a kód fut a felületen). Semmi nem íródott: adat, checkpoint, jogosultság, RLS, séma, levél, publikálás változatlan.

## 1. Saját Viba-Team céghez mentett szálak (nem „helyesen kapcsolt”)
Viba-Team cég: `b454cd40-…be527`. Összes ide mentett szál: 4542 (info 4102, Pretor 226, Ramon 118, egyéb fiókok 95).

| Kategória | info@ | Ramon | Pretor |
|---|---|---|---|
| Valóban belső (`self_internal`) | 155 | 12 | 24 |
| Pontos kontakt → létező másik cég (`self_other_company`, javítási javaslat) | 26 | 9 | 22 |
| Ellentmondásos / több cég / csak domain / gyűjtőcím (`self_conflict`) | 299 | 14 | 37 |
| Nincs CRM-kontakt (`self_no_contact`) | 3482 | 83 | 115 |
| Körlevél / promóció (`self_bulk`) | 140 | 0 | 28 |

Korábban 4558 info@-szál „kapcsoltnak” látszott; korrigálva csak **445** valódi (nem saját) cégkapcsolat. A körlevél-felismerés csak Gmail-címke és ≥8 címzett alapján dolgozik, ezért a 2026-11-01-i 1625-ös promó-becslés nagy része itt `self_no_contact`-ban van — szándékosan nem találgatunk.

## 2. Többi kategória (nem saját céghez mentett)
| | info@ | Ramon | Pretor |
|---|---|---|---|
| Bizonyos (pontos email, egy cég) | 11 | 0 | 2 |
| Ellenőrizendő | 14 | 0 | 2 |
| Ütközés | 10 | 0 | 2 |
| Kontakt hiányzik | 1449 | 58 | 287 |
| Már kapcsolt (nem saját cég) | 445 | 18 | 11 |
| Belső/teszt | 361 | 5 | 40 |
| Szálak összesen | 6392 | 199 | 570 |

Három postafiók közös szálai: info↔Pretor 1 szál; Ramon 0. Közös üzleti előzmény szálszinten elhanyagolható.

## 3. Pretor szinkronhiány
- `invalid_grant` futások: 2026-09-07 18:15 → 2026-10-29 18:52 UTC (szept. 33 449, okt. 41 447 hibás futás); első hibátlan: 2026-10-30 09:03.
- Tárolt Pretor-levelek hetente: aug. 25–29/hét, **2026-09-08 és 2026-10-25 közt 0 levél** (7 teljes hét), 10-26 hét: 88.
- CRM-oldali hiány bizonyított. Gmail-oldali hiány: **NEM IGAZOLT** — az új DRY-RUN előnézettel igazolható (Gmail-lista ↔ tárolt azonosítók, 100-as lapok).
- Későbbi visszatöltés a meglévő `syncInbox(userId,{backfill:true, query:"after:2026/09/07 before:2026/10/30"})` úttal megoldható: `gmail_message_id` szerinti idempotencia, 45 mp-es futáskorlát, `done=false` jelzés, hibák a futásnaplóban; history-checkpointot nem érint. Korlát: futások közt nincs pageToken-folytatás (újralistáz, ismerteket kihagyja); új szálak a meglévő pontos-email CRM-egyeztetést kapják. Végrehajtó gomb nem készült — külön jóváhagyás kell.

## 4. Elkészült
- Új kategóriák a saját céghez mentett szálakra + tesztek.
- `/import-review/mail`: heti lefedettség, üres hetek `invalid_grant` mintával, DRY-RUN visszatöltési előnézet (tulajdonos, csak olvasás), „Csak több postafiókban közös” szűrő, más postafiók jelvény; meglévő lapozás (50/oldal) és owner-ellenőrzés megmaradt.

## 5. Tesztek
- Vitest `src/lib/gmail` 37/37 PASS (5 új saját-cég eset), TypeScript PASS.
- Valós adatos DRY-RUN számítás (fenti táblák): PASS.
- Bejelentkezett böngészős próba: **NEM TESZTELT** — a sandbox munkamenete nem érvényes, `/auth`-ra irányít.
- Gmail-előnézet élő hívása: **NEM TESZTELT** (lejárt token esetén a meglévő OAuth-segéd frissítheti a tokent).

## 6. Ami blokkolja a tényleges rendezést
Tulajdonosi jóváhagyás kategóriánként (elsőként a 57 `self_other_company` szál), snapshot+rollback SQL, Pretor visszatöltés jóváhagyása, és a 3680 kontakt nélküli saját-cég szálhoz kontaktok felvétele.
