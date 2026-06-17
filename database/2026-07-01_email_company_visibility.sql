-- ============================================================
-- VIBA CRM — Email aktivitás cég-szintű láthatóság (2026-07-01)
--
-- A 2026-06-14 patch per-mailbox szigorítást vezetett be: a felhasználó
-- csak azokat a threadeket látta, amelyek `email_thread_access`-ben az ő
-- `user_id`-jére voltak rögzítve. Ez azt jelentette, hogy ha egy céggel
-- több VIBA mailbox (info@, toth.attila@, …) kommunikált, akkor egy adott
-- felhasználó csak a saját mailbox-szálait látta — a Marketing Workspace
-- Email aktivitás panel 0 üzenetet mutatott akkor is, ha a thread
-- ténylegesen a céghez volt rendelve (`email_threads.company_id`).
--
-- Új szabály: a kommunikáció tulajdonosa a CÉG, nem a küldő felhasználó.
-- Ezért ha egy thread bármely cégrekordhoz (`company_id`) vagy leadhez
-- (`lead_id`) van kötve, akkor minden authenticated CRM felhasználó látja
-- a teljes threadet és minden hozzá tartozó üzenetet/csatolmányt.
-- A per-user `email_thread_access` szabály megmarad fallback-ként a céghez
-- még nem kötött (személyes) szálakra.
-- Idempotens, többször futtatható.
-- ============================================================

-- 1) Helper: hozzáférhet-e a CRM-felhasználó a threadhez? -----
CREATE OR REPLACE FUNCTION public.can_access_email_thread(_thread_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_email_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.email_thread_access a
      WHERE a.thread_id = _thread_id AND a.user_id = _user_id
    )
    OR EXISTS (
      -- Cég- vagy lead-szintű kommunikáció: minden authenticated CRM
      -- felhasználó lát mindent, ami egy üzleti rekordhoz van kötve.
      SELECT 1 FROM public.email_threads t
      WHERE t.id = _thread_id
        AND (t.company_id IS NOT NULL OR t.lead_id IS NOT NULL)
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_email_thread(uuid, uuid) TO authenticated;

-- 2) emails SELECT policy: cégre kötött üzenet mindenkinek -----
-- Az `emails` táblán előfordulhat olyan sor, ami már `company_id`-vel
-- van kötve, de a thread-én még nem futott le a backfill. A policy
-- mindkét utat fedi: thread-szintű VAGY közvetlen `emails.company_id`.
DROP POLICY IF EXISTS "emails_select_per_user" ON public.emails;
CREATE POLICY "emails_select_per_user"
  ON public.emails FOR SELECT TO authenticated
  USING (
    public.is_email_admin(auth.uid())
    OR company_id IS NOT NULL
    OR lead_id    IS NOT NULL
    OR (thread_id IS NOT NULL AND public.can_access_email_thread(thread_id, auth.uid()))
  );

DROP POLICY IF EXISTS "emails_write_per_user" ON public.emails;
CREATE POLICY "emails_write_per_user"
  ON public.emails FOR ALL TO authenticated
  USING (
    public.is_email_admin(auth.uid())
    OR (thread_id IS NOT NULL AND public.can_access_email_thread(thread_id, auth.uid()))
  )
  WITH CHECK (true);

-- 3) email_attachments SELECT policy: kövesse az emails láthatóságát
DROP POLICY IF EXISTS "email_attachments_select_per_user" ON public.email_attachments;
CREATE POLICY "email_attachments_select_per_user"
  ON public.email_attachments FOR SELECT TO authenticated
  USING (
    public.is_email_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.emails e
      WHERE e.id = email_attachments.email_id
        AND (
          e.company_id IS NOT NULL
          OR e.lead_id IS NOT NULL
          OR (e.thread_id IS NOT NULL AND public.can_access_email_thread(e.thread_id, auth.uid()))
        )
    )
  );

-- 4) Backfill: hiányzó emails.company_id pótlása a thread alapján
-- (ha a thread már céghez van kötve, az üzenetei is örököljék)
UPDATE public.emails e
   SET company_id = t.company_id
  FROM public.email_threads t
 WHERE e.thread_id = t.id
   AND t.company_id IS NOT NULL
   AND e.company_id IS DISTINCT FROM t.company_id;

-- 5) Backfill: thread → company a kapcsolattartók email címe alapján
-- (ha a thread résztvevője egy ismert kapcsolattartó, és a thread még
--  nincs céghez kötve, akkor egyértelmű egyezés esetén bekötjük)
WITH email_to_company AS (
  SELECT lower(c.email) AS email, MIN(c.company_id) AS company_id
    FROM public.contacts c
   WHERE c.email IS NOT NULL
     AND c.company_id IS NOT NULL
   GROUP BY lower(c.email)
  HAVING COUNT(DISTINCT c.company_id) = 1
), thread_match AS (
  SELECT DISTINCT t.id AS thread_id, etc.company_id
    FROM public.email_threads t
    JOIN LATERAL unnest(coalesce(t.participants, '{}')) AS p(addr) ON TRUE
    JOIN email_to_company etc ON etc.email = lower(p.addr)
   WHERE t.company_id IS NULL
)
UPDATE public.email_threads t
   SET company_id = tm.company_id
  FROM thread_match tm
 WHERE t.id = tm.thread_id;

-- 6) Backfill ismétlés: most már az újonnan céghez kötött thread-ek
-- üzeneteit is örökíti
UPDATE public.emails e
   SET company_id = t.company_id
  FROM public.email_threads t
 WHERE e.thread_id = t.id
   AND t.company_id IS NOT NULL
   AND e.company_id IS DISTINCT FROM t.company_id;

-- ============================================================
-- Email aktivitás cég-szintű láthatóság lezárható.
-- ============================================================