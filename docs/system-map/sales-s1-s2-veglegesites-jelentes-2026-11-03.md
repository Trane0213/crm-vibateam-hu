# Sales S1–S2 jóváhagyott javítások – 2026-11-03

## Eredmény

| Ellenőrzés | Eredmény | Bizonyíték / korlát |
|---|---|---|
| Saját Sales ügyek, tulajdonos teljes csapat | PASS automatikusan | saját felelősre szűrt nyitott leads; tulajdonos csapatszintű lista; RLS változatlan |
| Budapest napi besorolás | PASS | 23:30/00:30 és tavaszi/őszi óraátállítás teszt |
| Hiba nem 0 | PASS kódellenőrzés | Ma/Teendők/felső sáv hibát ír; betöltés alatt „—” / Betöltés |
| Napi munkalisták és felső sáv közös forrás | PASS | közös useDailyWork/dailyWork, azonos saját/csapat szűrés; 1000-es lapozás, nincs 200 soros limit |
| P1–P5 prioritás és ügylink | PASS kódellenőrzés | lejárt → mai → új → válaszra váró → hiányos; /leads?lead=UUID |
| Aktivitás csak Hívás/E-mail | PASS | strict szerverinput elutasítja meeting és bármely kliensidő mezőjét |
| Megtörtént aktivitás szerveridővel | PASS automatikusan | due_date és created_at ugyanaz a szerveridő, completed=true, jegyzet megmarad |
| Következő lépés változatlan | PASS | next-step-editor és next-step-input nem módosult; Találkozó is megmarad |
| Pipeline meglévő feltétel | PASS | ≥1 teljesített aktivitás, mentett típus+határidő; léptetés előtt friss read, üzleti DB szabály változatlan |
| Három jóváhagyott törlés | PASS éles DB | 10→7 followups, cél UUID-kből 0 maradt, minden leads és többi followups változatlan a tranzakcióban |
| Unit regresszió | PASS | 16 tesztfájl, 91/91 (8 új: 3 aktivitás + 5 napi szabály) |
| AI acceptance | PASS | 12 forgatókönyv, 0 hiba, 0 figyelmeztetés |
| Automatikus fordítás | PASS | observability: build OK 12:32:58 UTC |
| Nyilvános böngészős indulás | PASS | /today → /auth, 0 runtime hiba |
| Bejelentkezett TESZT ügy end-to-end | NEM TESZTELT | külső Supabase, external_unmanaged, nincs elérhető biztonságos munkamenet; sem Ramon, sem valós ügy nevében nem teszteltünk |
| Éles publikálás | NEM TÖRTÉNT | kód az előnézetben, a célzott adattörlés az éles DB-ben már végrehajtva |

## Törölt aktivitások

- `0d733570-433b-4b24-b6c3-950366a8b8b0` – Sopron út 66., meeting, 2026-11-04 12:00 UTC.
- `a910add0-f66d-4335-87eb-0b20d74770de` – Sopron út 66., meeting, 2026-11-04 12:00 UTC.
- `346b65f3-6e19-4ad3-9d9b-d4e5eb21911a` – VIV, call, 2026-11-05 10:20 UTC.

Teljes, minden oszlopot visszaállító mentés: `database/rollback_sales_activities_2026-11-03.sql`.
Törlés előtti hatáselemzés: `sales-activities-delete-impact-2026-11-03.md`.
Kapcsolódó followup_events 0 volt, ezért nem veszett el kapcsolt esemény.
Összes lead 8 maradt; négy importált ügy Pipeline-ban, Sopron new/előké­szítő; VIV follow_up és 2026-11-05 08:00 UTC következő lépése változatlan.

## Érintett kód

- `src/components/lead-workspace/sales-prep-panel.tsx`
- `src/lib/sales/prep-activity.ts` és `.functions.ts`, `.test.ts`
- `src/lib/sales/daily-work.ts`, `.test.ts`, `use-daily-work.ts`
- `src/components/today/sales-worklists.tsx`, `sales-home.tsx`, `owner-home.tsx`
- `src/components/pulse-bar.tsx`
- `src/routes/_authenticated/sales.todo.tsx`, `today.tsx`, `help.sales.tsx`
- Migráció: három UUID-ra szűrt törlés, nincs séma/RLS/trigger módosítás.

Dokumentáció: Sales kézikönyv v1.1, AGENTS és roadmap. Működő Marketing, ajánlatkezelés, lead-státuszok és jogosultsági modell nem módosult. A nem Sales/owner felső sáv korábbi viselkedése megmaradt.

## Következő ellenőrzés és korlát

Saját bejelentkezésből, TESZT ügyön: Hívás → „Nem vette fel” → Rögzítés → visszaolvasott szerveridő; következő lépés dátum/idő mentés; Pipeline-feltétel és Ma/felső sáv számlálók egyezése. Ügyfélkapcsolatfelvételt nem szabad végezni teszteléshez.

A migráció 15 korábbról fennmaradt ellenőrzési jelzést adott, új jelzést nem: RLS policy nélkül (a quote_requests-nél szándékos), 3 változó függvénykeresési út, 1 public kiterjesztés, 9 security-definer végrehajtási jelzés, kiszivárgott jelszavak elleni védelem kikapcsolva. Ezek nem módosultak, külön engedélyezett biztonsági ellenőrzésben kezelhetők.

STOP: nincs további modulfejlesztés és nincs automatikus éles publikálás.