
## Eltérés-elemzés — jóváhagyott architektúra vs. jelenlegi megvalósítás

### A jóváhagyott működés (rögzített)

A **`/sales/leads` 3 oszlopos Sales Workspace** az egyetlen operatív munkafelület:

```text
┌───────────────────┬───────────────────────────────┬─────────────────────────┐
│ 1) Pipeline +     │ 2) Lead — marketingtől átvett │ 3) Sales művelet panel  │
│    lead lista     │    teljes előélettel          │                         │
│ (LeadListColumn)  │ (LeadDetailColumn)            │ (LeadActionPanel)       │
└───────────────────┴───────────────────────────────┴─────────────────────────┘
```

A 2. oszlop = ugyanaz a lead, amit a marketing minősített és átadott (jegyzet, minősítő blokk, identity, score, emailek, hívások, dokumentumok, idővonal). A 3. oszlop = kötelező következő lépés + státuszváltás + ajánlat + utánkövetés + szerződés + handoff.

### Mit építettünk valójában — és miben tért el

| # | Eltérés | Hatás |
|---|---|---|
| 1 | Új **`/leads/$id` route** lett az operatív V2 felület (saját header, tabok: Áttekintés / Aktivitás / Ajánlatok / Átadás). | Második operatív munkaterület jött létre a jóváhagyott egyetlen helyett. A `LeadDetailColumn` fejléce „Teljes oldal" linkkel **kifelé navigál** belőle. |
| 2 | `LeadActionBar`, `AssigneePicker`, `NextStepEditor`, `WonDialog`, `LostDialog`, `HandoffDialog`, `LeadStatusStepper`, V2 Quotes verziókezelés — **mindezek csak a `/leads/$id`-n** vannak bekötve. | A 3 oszlopos workspace ezekből semmit nem lát. A 3. oszlop (`LeadActionPanel`) továbbra is a régi „Email / Followup / AI / QuickCreateQuote" sablon, **nincs valós státuszváltás, nincs Won/Lost flow, nincs handoff helyben**. |
| 3 | `LeadDetailColumn` státusz `<select>`-je egy egyszerű dropdown — a `STATUS_TRANSITIONS` állapotgépet **nem** ismeri, a `lost_reason` / `won_at` / `lost_at` mezőket nem kezeli. | A workspace-en belüli státuszváltás megkerüli a Won/Lost confirm dialógust, így `lost_reason` sosem íródik a workspace-ből. |
| 4 | A `LeadDetailColumn` **nem mutatja** a marketing által rögzített minősítő-blokk fő mezőit (felelős név, következő lépés típus / határidő / jegyzet, utolsó státuszváltás). Ezek csak a `/leads/$id` headerében jelennek meg. | A sales a 3 oszlopos workspace-ben nem látja a lead operatív állapotát — kénytelen átnavigálni a `/leads/$id`-re. |
| 5 | `quotes.version` / `is_current` UI **nincs** a 3 oszlopos workspace-ben — csak `QuickCreateQuoteButton` (új ajánlat dialog), a verziókezelés a `/leads/$id` Ajánlatok tabján él. | Két helyen kell ajánlatot kezelni. |
| 6 | Handoff: `LeadActionPanel`-ben csak a **marketing** módú `LeadHandoffPanel` van (átadás értékesítőnek). Sales módban a projekt-handoff (`HandoffDialog` + `projects` insert + `handoff_payload`) **nincs** a panelen. | Sales nem tud helyben projektet indítani megnyert leadből — csak a `/leads/$id` Átadás tabjáról. |
| 7 | `lead_status_history` timeline **nincs** a 3 oszlopos workspace-ben (a `LeadDetailColumn`-ban csak a `followups` idővonal van). | A „teljes előélet" hiányos a fő felületen. |

### Összegzés — egyetlen mondatban

A V2 funkciók **megépültek és működnek**, de **rossz helyre**: egy új `/leads/$id` oldalra, a jóváhagyott 3 oszlopos Workspace 2. és 3. oszlopa helyett. A teendő **nem új fejlesztés**, hanem a meglévő V2 komponensek **áthelyezése** a `LeadDetailColumn` (2. oszlop) és a `LeadActionPanel` (3. oszlop) megfelelő szakaszaiba, hogy a `/leads/$id` redundánssá váljon (a jelenlegi „Teljes oldal" link kivezethető).

---

## Javasolt fejlesztési lépések — összhangba hozás

Minden lépés **meglévő komponensek áthelyezése / bekötése**, nem új felület.

### Lépés 1 — `LeadDetailColumn` (2. oszlop) kibővítése a V2 fej-blokkal

A meglévő header alá, a jegyzet fölé bekerül **a `/leads/$id` headerből már ismert blokk**, ugyanazokkal a komponensekkel:

- `LeadStatusStepper` (vízszintes, kompakt)
- 4 darab `KeyFact` cella: **Felelős** (`AssigneePicker` inline), **Következő lépés** típus, **Határidő**, **Utolsó aktivitás**; `won` / `lost` esetén `won_at` / `lost_at`
- `lead_status_history` timeline szakasz beillesztve a meglévő „Utókövetés idővonal" mellé (vagy összevont „Idővonal" alá, marketing-tab stílusban)
- A jelenlegi nyers státusz `<select>` lecserélve a `LeadActionBar` mini-változatára (vagy elrejtve, a 3. oszlopra hagyva)

A meglévő marketing minősítő blokk (`LeadQualityBlock`, `LeadAutoFixesBlock`, identity, score, jegyzet, cég/kapcsolattartó) **változatlan** — ez adja a „marketing által átadott előélet" részt.

### Lépés 2 — `LeadActionPanel` (3. oszlop) sales-mód kibővítése V2 műveletekkel

A meglévő ProcessStrip + Email + Followup + Hívás + AI panel **megmarad**. Sales módban ezek alatt új szekciók:

- **„Kötelező következő lépés"** — `NextStepEditor` beillesztve (kötelezően nyitott, ha nincs `next_step_type` megadva: a meglévő amber banner ide kerül).
- **„Státusz"** — `LeadActionBar` (állapotgép szerinti gombok) + `WonDialog` / `LostDialog` trigger.
- **„Ajánlat"** szekció kibővítése: meglévő `QuickCreateQuoteButton` mellé a V2 **verzió-lista** és **„Új verzió" / „Aktuálissá tesz"** gombok (a `/leads/$id` Ajánlatok tabjából átemelve).
- **„Projekt átadás"** — sales módban a meglévő `LeadHandoffPanel` helyett (vagy mellett, `status='won'` esetén) a V2 `HandoffDialog` trigger + ha már van projekt, a strukturált `handoff_payload` riport.

### Lépés 3 — `/leads/$id` redundancia megszüntetése

- A `LeadDetailColumn` fejlécében lévő **„Teljes oldal" link eltávolítása** (vagy a `/leads/$id` route redirect a `/sales/leads?lead=<id>`-ra, hogy régi bookmarkok ne 404-ezzenek).
- A `/leads/$id` route fájl **megmarad** átmenetileg, de minden V2 komponens már az 1–2. lépésben a workspace-ből hivatkozott — a route csak `Navigate` redirectet tartalmaz.
- A duplikáció megszűnése **után**, külön körben törölhető a fájl és a `lookup` URL-ek átírása. Ezt nem keverem ebbe a sprintbe, mert az „eltérés helyrehozása" a cél, nem a takarítás.

### Lépés 4 — Cache- és állapot-egységesítés

- A V2 mutációk már `["leads","detail",id]`, `["lead-status-history",id]`, `["projects"]`, `["quotes"]` kulcsokat invalidálnak — a `LeadDetailColumn` és `LeadActionPanel` ugyanezeket a kulcsokat használja (`useQuery(["leads","detail",leadId])`), így automatikusan frissülnek, nincs új hook szükséges.
- A `LeadDetailColumn` saját státusz `<select>`-jének `updateLead.mutate({ status })` hívását le kell cserélni a `LeadActionBar`-on belüli állapotgép-aware hívásra, hogy ne lehessen érvénytelen átmenetet kezdeményezni.

### Mit NEM csinálunk ebben a körben (szándékosan)

- Nem nyitunk meg új route-ot, nem hozunk létre új tabos felületet.
- Nem nyúlunk a Dashboard / Todo / `/sales/leads` listához / Quotes / Handoff oldalakhoz (csak belépési pont marad).
- Nem írjuk át a backend mutációkat — a V2 komponensek a meglévő `supabase.from(...).update(...)` hívásokat hozzák magukkal.
- Nem törlünk fájlt — a `/leads/$id` route redirectté egyszerűsítése külön takarítási kör.

---

## Akceptancia

- A `/sales/leads` 3 oszlopos workspace-ben a 2. oszlopon látszik: státusz-stepper, felelős (assignee picker), következő lépés, határidő, utolsó aktivitás, `won_at`/`lost_at`, és a `lead_status_history` timeline — a marketing minősítő blokk és a jegyzet érintetlenül.
- A 3. oszlopon (sales mód) elérhető: `NextStepEditor`, `LeadActionBar` állapotgéppel, `WonDialog`, `LostDialog`, ajánlat verziókezelés, `HandoffDialog` projekt-indítással — minden a workspace-en belül, oldalváltás nélkül.
- A workspace-ből végigvihető a `new → contacted → quote_prep → quote_sent → contract → won → handoff` folyamat, **anélkül**, hogy a `/leads/$id` oldalra kellene menni.
- A `LeadDetailColumn` „Teljes oldal" linkje eltűnik; aki mégis `/leads/$id`-re navigál, a workspace-re kerül.
