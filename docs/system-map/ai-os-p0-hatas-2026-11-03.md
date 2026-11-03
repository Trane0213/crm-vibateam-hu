# AI OS P0 – migráció előtti hatáselemzés

Jóváhagyott terv: AI OS P0 (2026-11-03). Az üzleti adatok és meglévő üzleti RPC-k változatlanok.

## Ellenőrzött pillanatkép
`agent_run_steps`: 11 mező; PK id; UNIQUE(run_id,step_no); FK agent_runs(id), ON DELETE CASCADE. kind: llm/tool/handoff/approval/error.
`agent_runs`: status running/ok/error/cancelled. A lépések és futások RLS-e aktív. authenticated saját futást és annak lépéseit olvassa; írási policy nincs. A meglévő grantok mindhárom API-szerepre teljesek, de az RLS megakadályozza a kliensírást. A migráció nem lazítja ezt.

## Változás
Az agent_run_steps nullable jóváhagyási életciklus-mezőkkel bővül. A régi sorok NULL mezőkkel megmaradnak. Kizárólag service_role által hívható létrehozás/döntés/lezárás RPC-k; a szerver a hívót és aktuális jogosultságot ellenőrzi az admin RPC előtt. A tulajdonos az agent_runs.user_id, nem kliensadat.
Atomikus sorzáras foglalás és egyszer használható token. Nincs új tábla, üzleti RPC vagy kliensírási policy. Az eredeti bemenetet, eszközt, agentet és forrásfutást trigger védi az átírástól. A döntés és eredmény ugyanazon naplósorhoz tartozik. Lejárat 30 perc, szerveridővel.

## Kockázatok és védelem
- Külső művelet/naptómentés nem közös tranzakció: megszakadás esetén az eredmény nem igazolt, a művelet nem indítható újra. Nincs pontosan-egyszer teljesülési ígéret.
- Foglalás előtti DB-hiba: nincs üzleti írás. Foglalás utáni bizonytalan kimenet: nincs automatikus replay.
- Timothy meglévő tranzakciója változatlan; a P0 legfeljebb egyszer indítja, nem módosítja Sales invariánsait.
- Meglévő, tartós azonosító nélküli jóváhagyás nem végrehajtható.
- Nincs éles kampány/ügyfél/projekt tesztmódosítás, nincs publikálás.

## Visszaállítás
Első lépés a jóváhagyási végrehajtás letiltása (a döntési szerverfüggvény megtagadja az approve ágat), majd a P0-sorok biztonságos exportja. Folyamatban lévő sor mellett a mellékelt rollback megszakad. A rollback csak új RPC-ket/triggert/indexet/mezőket bont le, meglévő naplósort és üzleti adatot nem töröl. A régi approvedToolCallIds bypass visszaállítása tilos. A kibővített naplók megőrzése biztonságosabb, mint a destruktív séma-rollback.