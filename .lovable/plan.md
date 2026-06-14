# Sales Workspace — 2. és 3. oszlop végleges működés

A bal oszlop (pipeline + lead lista) változatlan. Ez a terv csak a középső és jobb oszlopot rögzíti, fejlesztés NEM indul a jóváhagyásig.

## Képernyő vázlat

```text
┌─ 1. OSZLOP ──────────┬─ 2. OSZLOP — LEAD ELŐÉLET (READ-ONLY) ────────────┬─ 3. OSZLOP — SALES MŰVELET ─┐
│ Pipeline szűrő       │ ╔═══════════════════════════════════════════════╗ │  KÖVETKEZŐ LÉPÉS            │
│ [Új] [Kapcs] [Aj]    │ ║ Cégnév             [Marketing: Átadható] ║ │  ┌───────────────────────┐  │
│ [Utánk] [Megny]      │ ║ Kapcsolattartó · telefon · email          ║ │  │ Típus: [ ▼ telefon ]  │  │
│ ───────────────────  │ ╚═══════════════════════════════════════════╝ │  │ Mikor: [📅 ___ ]      │  │
│ ● Acme Kft.          │                                                   │  │ Jegyzet:              │  │
│   következő: hívás   │ [Áttekintés][Kapcsolatok][Emailek][Dok.][Idővonal]│  │ [____________________]│  │
│   ma 14:00           │                                                   │  └───────────────────────┘  │
│ ○ Béta Bt.           │ ÁTTEKINTÉS                                        │   [Mentés következő lépés]  │
│   nincs lépés        │ • Iparág, méret, web, cím                         │                             │
│ ○ Gamma Zrt.         │ • Marketing minősítés (badge + dátum)             │  ─────────────────────────  │
│ ...                  │ • Marketing jegyzet (sales note régió)            │  ELSŐ AKTIVITÁS RÖGZÍTÉSE   │
│                      │ • Felelős sales (read-only)                       │  (csak amíg a lead "új")    │
│                      │                                                   │  [📞 Telefon] [✉ Email]    │
│                      │ KAPCSOLATTARTÓK                                   │  [👥 Találkozó][📄 Ajánlat] │
│                      │ • lista (név, pozíció, email, tel)                │  → ez lépteti pipeline-ra   │
│                      │                                                   │                             │
│                      │ EMAILEK                                           │  ─────────────────────────  │
│                      │ • cég-szintű thread lista (in/out, tárgy, dátum)  │  EREDMÉNY RÖGZÍTÉSE         │
│                      │                                                   │  (ha van nyitott lépés)     │
│                      │ DOKUMENTUMOK                                      │  ○ Sikeres / megtörtént     │
│                      │ • fájllista (név, méret, dátum)                   │  ○ Nem sikerült             │
│                      │                                                   │  ○ Áttéve                   │
│                      │ IDŐVONAL                                          │  Jegyzet: [____________]    │
│                      │ • minden esemény időrendben                       │  [Lezárás + új következő]   │
│                      │   (cég létrejött, email, doc, státusz, handoff,   │                             │
│                      │    sales aktivitások)                             │  ─────────────────────────  │
│                      │                                                   │  STÁTUSZ                    │
│                      │                                                   │  [Megnyerés] [Elveszett]    │
└──────────────────────┴───────────────────────────────────────────────────┴─────────────────────────────┘
```

## 2. oszlop — szabályok

- **Csak olvasás.** Nincs mentés gomb, nincs inline szerkesztés, nincs akció gomb sehol.
- **Fejléc:** cégnév + marketing státusz badge + elsődleges kapcsolat egy sorban.
- **5 fül, ebben a sorrendben:** Áttekintés · Kapcsolatok · Emailek · Dokumentumok · Idővonal.
- **Áttekintés** tartalma: cégadatok, marketing minősítés + dátum, marketing sales-note (a `[MKT:SALES_NOTE]` régió tartalma), felelős sales neve (read-only).
- **Idővonal** a meglévő `buildTimeline()`-ból jön, plusz a sales aktivitások (lásd 3. oszlop).
- Nincs benne: státuszváltó, hozzárendelő dropdown, "magamhoz veszem", handoff panel, AI sheet, quality block, auto-fix block — ezek mind eltűnnek innen.

## 3. oszlop — szabályok

Három fix blokk, fentről lefelé, semmi más:

### 1) Következő lépés (mindig látszik)
- Típus (telefon / email / találkozó / ajánlat), időpont, jegyzet.
- Egy mentés gomb. A `leads.next_step_*` mezőkbe ír (már létezik).

### 2) Első aktivitás (csak amíg nincs sales aktivitás)
- 4 gomb: Telefon · Email · Találkozó · Ajánlat.
- Kattintásra rögzít egy aktivitást (dátum = most, típus = választott), és **ekkor lép a lead a "kapcsolat alatt" pipeline-ba** (status: `contacted`).
- Ez a "pipeline mikor indul" szabály egyetlen érvényesítési pontja. Marketing handoff önmagában nem rakja pipeline-ba.

### 3) Eredmény + lezárás (csak ha van nyitott következő lépés vagy aktivitás)
- Sikeres / Nem sikerült / Áttéve + jegyzet.
- Lezárja az aktuális lépést és egyből új "következő lépés" űrlapot kínál.

Alul két végállapot gomb: **Megnyerés** és **Elveszett** (a meglévő `LeadActionBar` logika átemelve, csak ez a két állapot marad gombként; köztes státuszok a sales aktivitásokból automatikusan adódnak).

## Pipeline átmenetek (rögzített szabály)

| Trigger | Új státusz |
|---|---|
| Marketing handoff | `new` (még NEM pipeline) |
| Első sales aktivitás rögzítve | `contacted` |
| Ajánlat-aktivitás rögzítve | `proposal` |
| Utánkövetés aktivitás | `followup` |
| Megnyerés gomb | `won` |
| Elveszett gomb | `lost` |

Sales nem vált státuszt kézzel dropdown-ból. A státusz a rögzített aktivitásokból következik.

## Mit törlünk / mit hagyunk

**Törlendő a workspace-ből (külön route-on maradhat info-nézetnek):**
- `lead-action-panel.tsx` jelenlegi tartalma (kvalitás, auto-fix, handoff, AI) — szétszedjük.
- `lead-quality-block`, `lead-auto-fixes-block`, `lead-handoff-panel`, `ai-sheet` — nem jelennek meg a workspace-ben.
- Státuszváltó dropdown a workspace-ből kikerül.

**Marad külön menüpontként, info-nézetként:** Ajánlatok, Emailek, Hívások, Találkozók, Dokumentumok. Ezek nem munkafelületek, csak listák.

## Technikai vázlat (csak jóváhagyás után)

- `LeadDetailColumn` újraírva: header + 5 tab, mind read-only. Adatforrások már megvannak (`companies`, `contacts`, `emails`, `company_documents`, `buildTimeline`).
- `LeadActionPanel` újraírva: 3 blokk (NextStep / FirstActivity / Outcome) + Won/Lost lábléc.
- Új tábla NEM kell. Sales aktivitás a meglévő `followups` táblába megy (`followup_type` + `result` + `completed`), és egy szerver-oldali trigger / mutation lépteti a `leads.status`-t a fenti táblázat szerint.
- `next_step_*` mezők változatlanok.

## Mit kérek jóváhagyásra

1. A fenti 2. oszlop tartalom és sorrend (5 tab, read-only) — OK?
2. A fenti 3. oszlop 3 blokkos szerkezet — OK?
3. A pipeline-trigger szabály (első aktivitás = `contacted`) — OK?
4. Marad-e a Megnyerés/Elveszett gomb a 3. oszlop alján, vagy az is csak aktivitásból következik?

Jóváhagyás után indul a fejlesztés, addig egyetlen sor kód sem változik.