# Súgó és közös hibaközpont V1

## Elkészült / elérés
Segítség gomb a közös munkasávban, Továbbiak → Segítség / Probléma jelzése; `/help`. Marketing/Sales/Owner/PM kereshető gombszintű súgó és George megnyitása. A három október 30-i kézikönyv történeti referenciaként megmaradt.

Hibajegy beküldése külön explicit művelet, nem AI-hívás. Saját személy/szerepkör/szerveridő, query/hash nélküli útvonal (a munkasáv Segítség gombjából érintett oldallal), leírás/elvárt/tényleges/kód. Spinner, elutasításnál megmaradó szöveg, siker ID és saját listában visszakeresés. Owner minden jelentést olvas és hat állapotot/megjegyzést kezelhet. Idegen munkatársi jelentés nem látható.

## Kód / adat
Új help-guide, közös RoleHelp és IssueCenter; négy szerepkörsúgó és /help; nav-config/work-navigation belépő; issue-reports-model/functions és tesztek. Egyetlen jóváhagyott issue_reports migráció alkalmazva, explicit GRANT/RLS/metadata guard/dedup UUID. Régi üzleti tábla, AI-motor, szerepkör, Sales/Marketing/PM működés változatlan.

## Ellenőrzés
- 787 Vitest / 80 fájl PASS; végső 16 célzott teszt PASS.
- AI OS acceptance 21 PASS; harness build OK.
- Izolált PostgreSQL: saját/idegen/Owner olvasás, Owner státusz, tiltott önstátusz nulla módosítás, védett metadata, dedup, anon tiltás PASS.
- Eredeti útvonalfán elkülönített TESZT-válasz: négy szerepkör súgó keresés és ügyféloldalra link 1440/390 PASS; hibajegy elutasítás/értékmegőrzés/siker ID/lista visszaolvasás PASS, pageerror nélkül. Ez nem hitelesített éles bizonyíték.
- Hitelesített éles beküldés, Owner státuszmentés, teljes role E2E NEM TESZTELT (external_unmanaged).

## Nyitott és korlátok
George-nak nincs jogosult alkalmazás/infra technikai naplóolvasó eszköze. AI diagnosztika NYITOTT; nincs automatikus vizsgálat/javítás vagy új asszisztens. Manuális vizsgálati megjegyzésben bizonyított/feltételezés/nem vizsgálható külön rögzíthető. Nincs fizetős automatikus hívás.

Nincs standard backend rate-limit; egyedi idő-/darabkorlát a jóváhagyott terv szerint nem aktivált. UUID dedup és nincs automatikus beküldési hurok. A migráció nem hozott új biztonsági jelzést; 16 korábbi jelzés megmaradt.

Nincs titkos tartalom/token gyűjtés, emailküldés/import/publikálás. STOP.