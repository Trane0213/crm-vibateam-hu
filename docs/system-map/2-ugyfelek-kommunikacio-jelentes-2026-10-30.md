# 2. szakasz – Ügyfelek és Kommunikáció egységesítése (2026-10-30)

Séma, RLS, 1/B szabályok, 1/C végpontok: **változatlan**. Új tábla/mező/jogosultság nincs.

## Módosított / új fájlok
- ÚJ `src/lib/company-activity.ts` – közös céges levél-lekérdezés (céghez kötött szál/levél + kapcsolattartó résztvevős szálak, from/to/cc/bcc), szál-csoportosítás, azonosító szerinti egyesítés, ajánlat/utánkövetés számláló, jogosultsági felirat (`is_email_admin` RPC alapján).
- ÚJ `src/lib/company-activity.test.ts` – 4 szabályteszt.
- `src/routes/_authenticated/customers.$id.tsx` (tulajdonos/sales/PM adatlap):
  - levelek a közös forrásból; szálszám = levelekből derivált csoport (eddig eltérő algoritmus, cc/bcc nélkül);
  - ajánlatok: projekthez **és** a cég leadjeihez kötött (még projekt nélküli) ajánlatok, id szerint egyesítve; "Kötés" oszlop;
  - utánkövetések: `company_id` + projekt + lead szerint, id szerint egyesítve;
  - "Nyitott ajánlat" és "Lejárt utókövetés" a fenti egyesített listákból (a `customer_kpi_v` csak projekten keresztül számol – lásd fennmaradó);
  - nem teljes postafiók-joggal: "*" jelölés + magyarázat, üres lista = "Nincs számodra látható levél".
- `src/components/marketing/marketing-workspace.tsx` (marketing adatlap):
  - levelek ugyanabból a közös forrásból (azonos query key → azonos adat);
  - új "Meglévő lead" mutató (csak megjelenítés; átadási szabály változatlan);
  - jogosultsági felirat mint fent;
  - javítva: levélküldés után rossz kulcsot frissített (`emails/by_company`) → `emails/by_company_aggregate`.
- Visszaállítás: `docs/rollback/2-2026-10-30/` (két eredeti fájl; az új lib + teszt törölhető).

## Idővonal
- Tulajdonosi/sales: a meglévő `ProjectTimeline` – projekt, lead, ajánlat (most lead-kötésűekkel), utánkövetés (most céges/lead-kötésűekkel), szálak (szálanként 1 esemény), hívás, találkozó, projektdokumentum, projektjegyzet. Id szerinti egyesítés miatt nincs dupla esemény.
- Marketing: a meglévő `buildTimeline` (cég, kontakt, levél, céges dokumentum, státusz) – változatlan.
- `activities` táblának nincs cég-kapcsolata, `tasks` csak projekthez kötött → nem kerültek be (séma nélkül nem köthetők).

## Rekordválasztó
Ellenőrizve: a hívás/találkozó/kontakt űrlapok cég- és kontaktmezői már a szerveroldali, lapozott `RecordCombobox`-ot használják (`resource-page.tsx` fk mezők), a kontaktlista cégszűrője és a marketing átadás is. Módosítás nem kellett.

## 12 Raszter (csak olvasás, élő DB)
| Adat | DB-ben | Owner | Marketing | Sales | PM |
|---|---|---|---|---|---|
| 5 kapcsolattartó | 5 | 5 | 5 | 5 | 5 |
| 2 szál / 6 levél | 2/6 | 2/6 | 0* (jog) | 0* (jog) | 0* (jog) |
| 1 lead (new) | 1 | 1 | 1 | 1 (status=new) | 0 (nincs projekt – RLS) |
| ajánlat/utánkövetés/hívás/találkozó/dok | 0 | 0 | – | 0 | 0 |
- Mindkét szál `email_thread_access`-e csak info@ (owner) → nem-owner nézetben a 0 **jogosultsági szűrés**, nem adathiány. Eddig a képernyő "Nincs email aktivitás"-t írt (megjelenítési hiba) – most "*" + magyarázat.
- Adathiány nincs; a 39 vitatott szál / 14 bizonytalan cég érintetlen, átkötés nem történt.

## Tesztek
- Vitest 39/39 (új 4), AI acceptance 12/12, typecheck a módosított fájlokra hibamentes.
- **NEM futott** (nincs biztonságos szerepkörös teszt-session, külső Supabase): élő képernyős próba owner/marketing/sales/PM szerepben; TESZT-cég/kontakt kiválasztás, hívás, jegyzet, meeting rögzítés élőben. Éles adathoz nem nyúltam, levél nem ment ki.

## Fennmaradó / döntést igénylő
- D2-1: `customer_kpi_v`/`customer_360_v` (ügyféllista) csak projekten át számol ajánlatot/utánkövetést → a lista és az adatlap eltérhet. Javítás = nézet-módosítás → hatáselemzés + jóváhagyás kell.
- D2-2: a rejtett levelek darabszáma séma nélkül nem mutatható; számláló SECURITY DEFINER függvény kellene (jóváhagyás).
- Sales a más felelősre osztott, nem "new" leadet nem látja (1/B előtti, változatlan RLS).
- Publikálás szükséges, hogy az éles oldalon is megjelenjen.
