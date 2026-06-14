-- ============================================================================
-- VIBA CRM — email_attachments dedupe + stabil UNIQUE
-- ----------------------------------------------------------------------------
-- Audit: a Gmail API minden messages.get hivasnal UJ attachmentId-t ad
-- ugyanahhoz a fizikai csatolmanyhoz (pl. 19ec20861659bec7 esetén 2 valos
-- xlsx-ből 24 DB sor lett, mert 12 sync x 2 = 24). A meglevő UNIQUE
-- (email_id, gmail_attachment_id) nem ved, mert a gmail_attachment_id
-- futasonkent valtozik. A stabil azonosito a (filename, size_bytes,
-- COALESCE(content_id,''), inline) hármas — ezzel dedupelunk es ezen
-- vezetunk be uj UNIQUE indexet.
-- ============================================================================

BEGIN;

-- 1) Duplikatumok torlese: minden (email_id, filename, size_bytes,
--    COALESCE(content_id,''), inline) csoportbol a LEGREGEBBI sor marad.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY email_id, filename, size_bytes, COALESCE(content_id, ''), inline
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.email_attachments
)
DELETE FROM public.email_attachments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Regi, nem hatekony UNIQUE eltavolitasa.
DROP INDEX IF EXISTS public.uniq_email_attachments_email_gmail_att;

-- 3) Uj stabil UNIQUE: ugyanaz a fizikai csatolmany (filename + size_bytes +
--    content_id + inline) emailenkent csak egyszer kerulhet be.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_email_attachments_email_content
  ON public.email_attachments (
    email_id, filename, size_bytes, COALESCE(content_id, ''), inline
  );

COMMIT;