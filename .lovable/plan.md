
# Marketing UX Overhaul Plan

A cél: a marketinges reggel belépve azonnal lássa, mit kell csinálnia. Nem új motor, nem backfill – a meglévő D1–D8 logikára épülő, marketinges szemléletű UI réteg.

## 1. /today – Marketing napi munkafelület
Három fő blokk, a technikai panelek (System Alerts, Backfill stb.) eltávolítva vagy admin nézetbe áthelyezve.

- **Mai feladatok**: Lejárt utánkövetések · Ma esedékes · Új érdeklődők (24h) · Átadásra váró leadek. Minden sorban: lead név, cég, hőmérséklet pötty, gyors akciók (Email / Telefon / Megnyitás).
- **Lead pipeline**: 6 oszlopos kanban-style badge sor (Új, Kapcsolatfelvétel, Minősítés, Átadható, Átadott, Elveszett) – darabszámok, kattintható.
- **Marketing teljesítmény**: 7/30 napos új leadek, átadási arány %, email aktivitás, válaszadási arány.

Új komponens: `src/components/today/marketing-daily-board.tsx` (cseréli az eddigi homepage tartalmát; SystemAlertsPanel és HistoricalBackfillPanel eltűnik innen).

## 2. Lead Workspace – 3 oszlop
Új layout `src/components/lead-workspace/lead-workspace-shell.tsx`:
- **Bal**: lead lista (szűkebb, sürgősség szerint rendezve, hőmérséklet pötty + score badge).
- **Közép**: lead adatlap (kompakt – cég, kapcsolat, score, adatminőség kis sávban, aktivitási timeline).
- **Jobb**: Akció panel – Email küldés · Telefon · Utánkövetés ütemezése · Átadás értékesítésnek (gomb, ha átadható). Felül kis chip-sor: Score / Hőmérséklet / Adatminőség / Utolsó aktivitás.

Auto-fixes és Quality block kerül a jobb oldali akció panel alá kollapszálva, ne dominálja a középső adatlapot.

## 3. AI Asszisztensek routing audit
Hiba: George kártya Timothy chatet nyit. Átnézzük:
- `src/components/ai-assistants/*` és bárhonnan, ahol agent kártya/avatár van.
- Központosítjuk az agent definíciókat (`src/lib/ai/agents.ts`-be, ha még nincs): id, név, avatar, system prompt.
- Minden kártya `agentId`-t ad át az opener-nek; opener ugyanazt az `agentId`-t használja a chat ablakhoz. Egyetlen forrás.

## 4. Ügyfelek lista
`src/routes/_authenticated/customers.index.tsx` oszlopok:
- Cég · Kategória · Város · Weboldal · Kapcsolattartók # · Leadek # · Utolsó aktivitás.
- Üres projekt/ajánlat oszlopok eltávolítva.
- Adatminőség és duplikáció badge a sor végén kis ikonként, nem külön nagy oszlopként.

## 5. Cégek lista
`src/routes/_authenticated/companies.index.tsx`:
- Keresősáv + szűrők: kategória, város, adatminőség (Jó / Hiányos / Konfliktus).
- Oszlopok: Cégnév · Kategória · Weboldal · Város · Kapcsolattartók # · Leadek # · Adatminőség %.

## 6. Kapcsolattartók
`src/routes/_authenticated/contacts.index.tsx` átszerkesztés:
- Oszlopok: Név · Cég · Email · Telefon · Szerepkör · Utolsó aktivitás · Leadek #.
- Konfliktus / linkelési badge: kis ikon a név mellett, részletek a sor drawer-ben/detail oldalon.

## 7. Adatminőség
`src/routes/_authenticated/data-quality.tsx`:
- Dashboard fejléc: 4 KPI kártya (Hiányzó cégek, Hiányzó kapcsolattartók, Duplikációk, Javítható rekordok).
- A `HistoricalBackfillPanel` átkerül egy collapse-olt "Admin műveletek" szekcióba az oldal aljára.
- Tab-ok megmaradnak, de tömörebb fejléccel.

## 8. Marketing Súgó
`src/routes/_authenticated/help.marketing.tsx` átalakítás interaktív szekciókra (accordion + példa kártyák):
- Lead feldolgozás lépésről lépésre
- Minősítési kritériumok
- Mikor add át értékesítésnek (checklist)
- Email sablonok (kimásolható szövegblokkok)
- Telefon script
- Workflow ábra (egyszerű ASCII/SVG)

## 9. Egységes design
Új közös primitívek (`src/components/marketing-ui/`):
- `KpiCard`, `StatusPill` (lead státusz színek), `TempDot` (hideg/meleg/forró), `ActionButton`, `SectionHeader`, `FilterBar`.
- Alkalmazva minden marketing oldalon a konzisztencia érdekében.

## Műszaki megjegyzések
- Csak frontend / presentation változások. Üzleti logika, motorok, DB érintetlen.
- Meglévő `useQualityOverview`, `crm-surface`, `lead-scoring` hookokat újrahasznosítjuk.
- A HistoricalBackfillPanel megmarad (admin nézetben), nem töröljük.
- A `data-lovable-blank-page-placeholder` és üres oszlopok a customers/contacts oldalakon eltűnnek.

## Elfogadási kritérium
A marketinges /today oldalon belépve 5 másodperc alatt látja: lejárt followupjai, mai dolga, átadható leadjei és heti teljesítménye – további kattintás nélkül.

Jóváhagyod, és nekiállhatok? Vagy van olyan blokk (pl. AI agent fix, /today, vagy lead workspace), amit előbbre vennél / kihagynál?
