# Sales előkészítő ↔ Pipeline — végrehajtott

## Üzleti logika (jóváhagyva)

- Marketing minősítés → átadás salesnek = lead bekerül a **Sales előkészítő** szakaszába (Leads Workspace). Még NEM pipeline.
- Előkészítőben a sales: hívás / email / találkozó aktivitást rögzít, kitölti a következő lépést.
- Két lehetséges kimenet:
  - **Pipeline-ba** (egyirányú) — csak ha ≥1 aktivitás ÉS van kitöltött következő lépés.
  - **Elveszett** — `lost_stage='pre_pipeline'`, vége.
- **Pipeline** külön menü, külön munkafolyamat — itt fut Kapcsolat → Ajánlat → Utánkövetés → Tárgyalás → Megnyert/Elveszett.
- **Projekt** csak Pipeline → Megnyert után, kizárólag a Pipeline felületről. A Leads Workspace-ben nincs projekt fogalom.

## Adatmodell

Migráció: `database/2026-06-24_leads_pipeline_entry.sql` (alkalmazás manuálisan, ahogy a többi `database/*.sql`).

Új mezők a `public.leads` táblán:
- `pipeline_entered_at timestamptz NULL` — időbélyeg, mikor lett pipeline-ügy. **Egyirányú**: DB trigger tiltja a vissza-nullázást.
- `lost_stage text NULL CHECK (lost_stage IN ('pre_pipeline','pipeline'))` — riport bontáshoz.

Index: `idx_leads_pipeline_entered_at`.

## Frontend

- `src/components/lead-workspace/lead-dossier-column.tsx` — 2. oszlop, read-only dosszié (5 tab: Áttekintés / Kapcsolatok / Emailek / Dokumentumok / Idővonal).
- `src/components/lead-workspace/sales-prep-panel.tsx` — 3. oszlop: 3 blokk (Aktivitás, Következő lépés, Legutóbbi aktivitások) + döntési sáv (Pipeline-ba, Elveszett).
- `src/components/lead-workspace/lead-workspace.tsx` — sales módban a 3 oszlop visszaállítva az új komponensekkel; marketing mód változatlan.
- `src/components/lead-workspace/lead-list-column.tsx` — sales módban szűr: `pipeline_entered_at IS NULL AND status NOT IN ('lost','won')`.
- `src/routes/_authenticated/sales.leads.tsx` (Pipeline menü) — szűr: `pipeline_entered_at IS NOT NULL`.
- `src/components/sales/lost-dialog.tsx` — új `stage` prop, az `onConfirm` payload `lost_stage`-et is tartalmaz.

## Pipeline-ba gomb feltétele

- `activityCount >= 1` (legalább 1 `followups` rekord `followup_type ∈ {call,email,meeting}`)
- `lead.next_step_type` ki van töltve
Hiány esetén disabled, magyarázó szöveg.

## Mi NEM része ennek a körnek

- Pipeline felület (sales.leads.tsx) tartalmi átalakítása — szűrőn kívül változatlan.
- Projekt létrehozás logika átrendezése.
- `lost_stage` szerinti riport felület.
- Új ajánlat / quote workflow.
