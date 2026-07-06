-- =====================================================================
-- Phase 3 / Ajánlat editor v1 — fej-mezők
--
-- Idempotens. Csak új nullable oszlopokat ad a public.quotes tábl ához,
-- meglévő adatok érintése nélkül. Nem futtat backfill-t, nem módosít
-- RLS-t, nem érint más táblát. Frontend a mezőket opcionálisan kezeli,
-- így a migráció előtti és utáni állapot is működőképes.
--
-- Mezők:
--   title            text          — ajánlat rövid megnevezése (pl. "AC szerelés — Kovács")
--   valid_until      date          — ajánlat érvényességi határideje
--   notes            text          — belső / ügyfélnek szánt megjegyzés (print oldalon látszik)
--   discount_percent numeric(5,2)  — 0..100 közötti kedvezmény, print oldal levonja
--   tax_percent      numeric(5,2)  — ÁFA (%), print oldal hozzáadja (default: 27)
-- =====================================================================

BEGIN;

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS title            text,
  ADD COLUMN IF NOT EXISTS valid_until      date,
  ADD COLUMN IF NOT EXISTS notes            text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS tax_percent      numeric(5,2);

-- Értéktartomány védelem (idempotens: csak akkor rakja fel, ha nincs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotes_discount_percent_range'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_discount_percent_range
      CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotes_tax_percent_range'
  ) THEN
    ALTER TABLE public.quotes
      ADD CONSTRAINT quotes_tax_percent_range
      CHECK (tax_percent IS NULL OR (tax_percent >= 0 AND tax_percent <= 100));
  END IF;
END $$;

COMMIT;