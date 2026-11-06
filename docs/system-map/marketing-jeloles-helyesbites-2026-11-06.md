# Megkeresésjelölések célzott helyesbítése

Tulajdonosi külön jóváhagyással, 2026-11-06 15:03 UTC körül **121 cég megjegyzésében** helyesbítettük a hibás automatikus megkeresésblokkot: 120 csak piszkozat, 1 belső/TESZT. Nem „még soha nem megkeresett” állapotot írtunk: a történeti lefedettség hiányos, a külső küldés nem igazolt.

- Friss, háromfiókos SENT/nem-DRAFT címzettellenőrzés: a jóváhagyott 121 cég egyike sem kapott új külső tárolt SENT-bizonyítékot.
- Előzetes pontos snapshot, új jegyzet és feltételes rollback: `database/marketing-note-correction-2026-11-06/`. A módosítás előtt a 121 azonosító és teljes régi jegyzet közös ellenőrzőösszege egyezett; más állapot esetén nulla módosítás lett volna.
- A helyesbítés csak a nyolcsoros hibás blokkot cserélte; előtte/utána levő jegyzet és marketingállapot megmaradt. A 121 új jegyzet teljes szövegét és cégnév-változatlanságát mentett elvárt értékhez ellenőriztük: egyezés.
- Utána: **664 cég, 701 kontakt, 8 Sales-lead; 121 helyesbített blokk, 82 korábbi SENT-bizonyítékos jelölés megmaradt.** A 82 megjegyzés üzleti „hideg” minősítését nem módosítottuk; SENT önmagában nem bizonyít üzleti célt.
- Kontakt, cégazonosság, szálkapcsolat, kampány, RLS/séma, Gmail-token/checkpoint változatlan. Nem történt küldés, visszatöltés vagy publikálás.
- Kapcsolódó tesztek: **22 PASS**; aktuális automatikus fordítás: build OK. Bejelentkezett UI-/szerepkörpróba **NEM TESZTELT**, nincs átadható biztonságos munkamenet az external_unmanaged háttérhez. SQL-mentés/visszaolvasás igazolt, nem felületi végigpróba.

A rollback kizárólag pontos javított jegyzetegyezésnél állítja vissza az adott régi szöveget; későbbi szerkesztésnél nem ír rá. Nem futtattuk. A korábbi általános `rollback_gmail_megkereses_2026-11-06.sql` továbbra sem használható erre. **STOP**, további adatlap/kampány/AI-kör nem indult.