-- =====================================================================================================
-- P7 — ÖSSZEVONT ÉLES MIGRÁCIÓS TERV (P2–P6 perzisztencia).  STÁTUSZ: TERV — NEM FUTTATVA.
-- Csak kifejezett tulajdonosi jóváhagyás után, egyetlen tranzakcióban futtatható. Előtte: mentés/snapshot.
-- Izolált próba: scripts/qa/p7-migration-pglite.ts (PGlite, kitalált TESZT-sorok, a valós függvények másolatával).
--
-- Tartalom (döntési lista 1., 2., 13., 14–16. és P2/3. pont):
--   A) quotes.pricing_mode          — árazási mód rögzítése (nullable, meglévő sorokat nem érint)
--   B) quote_calculations           — változtathatatlan számítási pillanatképek: P3 árazás, P4 tervellenőrzés, P6 kalkuláció
--   C) quote_package_approvals      — változtathatatlan belső ajánlatcsomag-jóváhagyás (P5; a P5-jelentés SQL-jének javított változata)
--   D) pricing_rate_cards (+ items) — VIBA ártörzs/díjtörzs verzióval: Sales/Owner tervezet, CSAK Owner hagyja jóvá; jóváhagyott verzió változtathatatlan
--   E) package_processing_jobs.token — oszlopszintű elrejtés a kliens elől (P2 megfigyelés)
-- NEM része (külön döntés): a /api/gmail/send jóváhagyáshoz kötése, díj-/normaértékek feltöltése, félbehagyott
-- feltöltések ütemezett takarítása, Cloudflare-feldolgozó, quote_create_draft módosítása.
--
-- Review-javítás a korábbi tervekhez képest: a P5/P6 jelentés `can_access_quote(quote_id)` hívása nem létezik —
-- a valós függvény `can_access_quote(_lead_id, _project_id, _created_by)`; itt a meglévő quote_documents-minta szerint
-- EXISTS (quotes q … can_access_quote(q.lead_id, q.project_id, q.created_by)) szerepel. A B/C táblákba a kliens NEM ír:
-- csak a szerverfüggvény (szolgáltatásszerepkör) a csomag/kalkuláció ÚJRASZÁMOLÁSA és egyezése után, így a kliens
-- nem rögzíthet tetszőleges ujjlenyomatot vagy összeget. A DB-őrök ettől függetlenül is ellenőrzik a sorokat.
-- =====================================================================================================
BEGIN;

-- Közös: Tulajdonos vagy Sales (a meglévő is_owner_role / crm_role_of függvényekkel; új jogosultság nem keletkezik).
CREATE OR REPLACE FUNCTION public.p7_is_owner_or_sales(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (public.is_owner_role(_uid) OR public.crm_role_of(_uid) = 'sales')
$$;
REVOKE ALL ON FUNCTION public.p7_is_owner_or_sales(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.p7_is_owner_or_sales(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.p7_immutable_row() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION '%: a rögzített sor nem módosítható és nem törölhető', TG_TABLE_NAME USING ERRCODE = 'check_violation';
END $$;

-- ---------------------------------------------------------------- A) quotes.pricing_mode
-- Nullable, alapérték nélkül: meglévő sor nem változik, trigger nem fut. Kiküldött (zárolt) ajánlaton a meglévő
-- quotes_lock_guard miatt utólag nem állítható (helyes: a kiküldött ajánlat módja nem változhat).
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS pricing_mode text;
ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_pricing_mode_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_pricing_mode_check
  CHECK (pricing_mode IS NULL OR pricing_mode IN ('subcontractor_labor','full_construction','house_sqm','hourly','custom'));

-- ---------------------------------------------------------------- B) quote_calculations
CREATE TABLE public.quote_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('received_budget_pricing','plan_review','viba_offer_calc')),
  calc_id text NOT NULL CHECK (calc_id ~ '^[a-f0-9]{8,64}$'),
  engine_version text NOT NULL CHECK (char_length(engine_version) BETWEEN 1 AND 40),
  source_sha256 text CHECK (source_sha256 IS NULL OR source_sha256 ~ '^[a-f0-9]{64}$'),
  pricing_mode text CHECK (pricing_mode IS NULL OR pricing_mode IN ('subcontractor_labor','full_construction','house_sqm','hourly','custom')),
  input jsonb NOT NULL,
  result_summary jsonb NOT NULL,
  net_huf numeric(14,0) CHECK (net_huf IS NULL OR net_huf >= 0),
  complete boolean NOT NULL,
  created_by uuid NOT NULL,                       -- auth.users id; a szerverfüggvény a hívó azonosítóját írja
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, kind, calc_id),
  CHECK (pg_column_size(input) <= 262144 AND pg_column_size(result_summary) <= 524288)
);
CREATE INDEX quote_calculations_quote_idx ON public.quote_calculations (quote_id, created_at DESC);
GRANT SELECT ON public.quote_calculations TO authenticated;
GRANT ALL ON public.quote_calculations TO service_role;
ALTER TABLE public.quote_calculations ENABLE ROW LEVEL SECURITY;
-- Belső árazási adat: csak Tulajdonos/Sales, és csak a számára látható ajánlaton (PM/Marketing nem látja — mint a P3–P6 panelek).
CREATE POLICY quote_calculations_select ON public.quote_calculations FOR SELECT TO authenticated
  USING (public.p7_is_owner_or_sales(auth.uid())
    AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.can_access_quote(q.lead_id, q.project_id, q.created_by)));
CREATE OR REPLACE FUNCTION public.quote_calculations_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE q record;
BEGIN
  SELECT locked_at, quote_kind INTO q FROM public.quotes WHERE id = NEW.quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote_calculations: ismeretlen ajánlat' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF q.locked_at IS NOT NULL THEN RAISE EXCEPTION 'quote_calculations: kiküldött (zárolt) ajánlathoz nem rögzíthető új számítás' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.kind = 'viba_offer_calc' AND q.quote_kind IS DISTINCT FROM 'viba_offer' THEN RAISE EXCEPTION 'quote_calculations: VIBA-kalkuláció csak saját VIBA-ajánlathoz' USING ERRCODE = 'check_violation'; END IF;
  IF NEW.kind <> 'viba_offer_calc' AND q.quote_kind IS DISTINCT FROM 'received_budget' THEN RAISE EXCEPTION 'quote_calculations: árazás/tervellenőrzés csak kapott költségvetéses ajánlathoz' USING ERRCODE = 'check_violation'; END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER quote_calculations_guard BEFORE INSERT ON public.quote_calculations FOR EACH ROW EXECUTE FUNCTION public.quote_calculations_guard();
CREATE TRIGGER quote_calculations_immutable BEFORE UPDATE OR DELETE ON public.quote_calculations FOR EACH ROW EXECUTE FUNCTION public.p7_immutable_row();

-- ---------------------------------------------------------------- C) quote_package_approvals
CREATE TABLE public.quote_package_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  offer_net_huf numeric(14,0) NOT NULL CHECK (offer_net_huf > 0),
  priced_document_id uuid NOT NULL REFERENCES public.quote_documents(id) ON DELETE RESTRICT,
  scope_document_id uuid NOT NULL REFERENCES public.quote_documents(id) ON DELETE RESTRICT,
  calculation_id uuid REFERENCES public.quote_calculations(id) ON DELETE RESTRICT,
  acks text[] NOT NULL CHECK (acks @> ARRAY['excel_reviewed','scope_reviewed']::text[]
    AND acks <@ ARRAY['excel_reviewed','scope_reviewed','findings_ack','partial_plans_ack']::text[]),
  approved_by uuid NOT NULL,                      -- auth.users id; csak a szerverfüggvény írja
  approved_role text NOT NULL CHECK (approved_role IN ('owner','sales')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quote_id, fingerprint)
);
CREATE INDEX quote_package_approvals_quote_idx ON public.quote_package_approvals (quote_id, created_at DESC);
GRANT SELECT ON public.quote_package_approvals TO authenticated;
GRANT ALL ON public.quote_package_approvals TO service_role;
ALTER TABLE public.quote_package_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_package_approvals_select ON public.quote_package_approvals FOR SELECT TO authenticated
  USING (public.p7_is_owner_or_sales(auth.uid())
    AND EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.can_access_quote(q.lead_id, q.project_id, q.created_by)));
-- DB-őr a szolgáltatásszerepkörű írásra is: a jóváhagyó tényleg Owner/Sales, az ajánlat nem zárolt, kapott költségvetéses,
-- a mentett nettó egyezik, a két dokumentum ehhez az ajánlathoz tartozik és a megfelelő típusú.
CREATE OR REPLACE FUNCTION public.quote_package_approvals_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE q record; real_role text;
BEGIN
  real_role := CASE WHEN public.is_owner_role(NEW.approved_by) THEN 'owner' WHEN public.crm_role_of(NEW.approved_by) = 'sales' THEN 'sales' END;
  IF real_role IS NULL OR real_role <> NEW.approved_role THEN RAISE EXCEPTION 'quote_package_approvals: a jóváhagyó nem Tulajdonos/Sales, vagy a szerepkör nem egyezik' USING ERRCODE = 'insufficient_privilege'; END IF;
  SELECT locked_at, quote_kind, manual_net_amount INTO q FROM public.quotes WHERE id = NEW.quote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'quote_package_approvals: ismeretlen ajánlat' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF q.locked_at IS NOT NULL THEN RAISE EXCEPTION 'quote_package_approvals: kiküldött (zárolt) ajánlat nem hagyható jóvá' USING ERRCODE = 'check_violation'; END IF;
  IF q.quote_kind IS DISTINCT FROM 'received_budget' THEN RAISE EXCEPTION 'quote_package_approvals: csak kapott költségvetéses ajánlat' USING ERRCODE = 'check_violation'; END IF;
  IF q.manual_net_amount IS NULL OR round(q.manual_net_amount) <> NEW.offer_net_huf THEN RAISE EXCEPTION 'quote_package_approvals: a mentett nettó nem egyezik a csomag nettójával' USING ERRCODE = 'check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quote_documents d WHERE d.id = NEW.priced_document_id AND d.quote_id = NEW.quote_id AND d.document_type = 'priced_budget')
     OR NOT EXISTS (SELECT 1 FROM public.quote_documents d WHERE d.id = NEW.scope_document_id AND d.quote_id = NEW.quote_id AND d.document_type = 'technical_scope') THEN
    RAISE EXCEPTION 'quote_package_approvals: az árazott Excel / lehatárolás nem ehhez az ajánlathoz tartozik' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.calculation_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.quote_calculations c WHERE c.id = NEW.calculation_id AND c.quote_id = NEW.quote_id) THEN
    RAISE EXCEPTION 'quote_package_approvals: a számítás más ajánlathoz tartozik' USING ERRCODE = 'check_violation';
  END IF;
  NEW.created_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER quote_package_approvals_guard BEFORE INSERT ON public.quote_package_approvals FOR EACH ROW EXECUTE FUNCTION public.quote_package_approvals_guard();
CREATE TRIGGER quote_package_approvals_immutable BEFORE UPDATE OR DELETE ON public.quote_package_approvals FOR EACH ROW EXECUTE FUNCTION public.p7_immutable_row();

-- ---------------------------------------------------------------- D) pricing_rate_cards + pricing_rate_card_items
-- Értéket a migráció NEM tölt fel (nincs kitalált díj). Sales/Owner tervezetet készít, CSAK Owner hagyja jóvá vagy vonja vissza.
CREATE TABLE public.pricing_rate_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 120),
  version integer NOT NULL CHECK (version >= 1),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  valid_from date, valid_to date,
  note text CHECK (note IS NULL OR char_length(note) <= 2000),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid, approved_at timestamptz,
  UNIQUE (label, version),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK ((status = 'draft' AND approved_by IS NULL AND approved_at IS NULL) OR (status <> 'draft' AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE public.pricing_rate_card_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.pricing_rate_cards(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('material','labor_rate','labor_norm','m2_package','hourly_role','surcharge','fee')),
  code text NOT NULL CHECK (char_length(trim(code)) BETWEEN 1 AND 80),
  label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 300),
  unit text NOT NULL CHECK (char_length(trim(unit)) BETWEEN 1 AND 20),
  basis text CHECK (basis IS NULL OR basis IN ('sell','cost')),
  huf numeric(14,2) CHECK (huf IS NULL OR (huf > 0 AND huf <= 100000000)),
  pct numeric(7,3) CHECK (pct IS NULL OR (pct >= 0 AND pct <= 500)),
  hours numeric(10,3) CHECK (hours IS NULL OR (hours > 0 AND hours <= 10000)),
  conditions jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_note text NOT NULL CHECK (char_length(trim(source_note)) BETWEEN 1 AND 500),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (card_id, kind, code),
  CHECK (num_nonnulls(huf, pct, hours) = 1),
  CHECK (huf IS NULL OR basis IS NOT NULL)
);
CREATE INDEX pricing_rate_card_items_card_idx ON public.pricing_rate_card_items (card_id, kind);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pricing_rate_cards, public.pricing_rate_card_items TO authenticated;
GRANT ALL ON public.pricing_rate_cards, public.pricing_rate_card_items TO service_role;
ALTER TABLE public.pricing_rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_rate_card_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY pricing_rate_cards_select ON public.pricing_rate_cards FOR SELECT TO authenticated USING (public.p7_is_owner_or_sales(auth.uid()));
CREATE POLICY pricing_rate_cards_insert ON public.pricing_rate_cards FOR INSERT TO authenticated
  WITH CHECK (public.p7_is_owner_or_sales(auth.uid()) AND created_by = auth.uid() AND status = 'draft');
CREATE POLICY pricing_rate_cards_update ON public.pricing_rate_cards FOR UPDATE TO authenticated
  USING (public.is_owner_role(auth.uid()) OR (status = 'draft' AND created_by = auth.uid() AND public.p7_is_owner_or_sales(auth.uid())))
  WITH CHECK (public.p7_is_owner_or_sales(auth.uid()));
CREATE POLICY pricing_rate_cards_delete ON public.pricing_rate_cards FOR DELETE TO authenticated
  USING (status = 'draft' AND (public.is_owner_role(auth.uid()) OR (created_by = auth.uid() AND public.p7_is_owner_or_sales(auth.uid()))));
CREATE POLICY pricing_rate_card_items_select ON public.pricing_rate_card_items FOR SELECT TO authenticated USING (public.p7_is_owner_or_sales(auth.uid()));
CREATE POLICY pricing_rate_card_items_write ON public.pricing_rate_card_items FOR ALL TO authenticated
  USING (public.p7_is_owner_or_sales(auth.uid()) AND EXISTS (SELECT 1 FROM public.pricing_rate_cards c WHERE c.id = card_id AND c.status = 'draft'))
  WITH CHECK (public.p7_is_owner_or_sales(auth.uid()) AND EXISTS (SELECT 1 FROM public.pricing_rate_cards c WHERE c.id = card_id AND c.status = 'draft'));
-- Állapotgép (szolgáltatásszerepkörre is): draft → approved (csak Owner, jóváhagyó = hívó) → retired (csak Owner).
-- Jóváhagyott/visszavont verzió tartalma nem változik; jóváhagyott kártya tételei nem írhatók.
CREATE OR REPLACE FUNCTION public.pricing_rate_cards_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN RAISE EXCEPTION 'pricing_rate_cards: új díjtörzs csak tervezet lehet' USING ERRCODE = 'check_violation'; END IF;
    NEW.created_at := now(); NEW.updated_at := now(); RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'pricing_rate_cards: jóváhagyott/visszavont díjtörzs nem törölhető' USING ERRCODE = 'check_violation'; END IF;
    RETURN OLD;
  END IF;
  IF NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'pricing_rate_cards: azonosító mezők nem módosíthatók' USING ERRCODE = 'check_violation'; END IF;
  IF OLD.status = 'draft' AND NEW.status = 'approved' THEN
    IF auth.uid() IS NULL OR NOT public.is_owner_role(auth.uid()) THEN RAISE EXCEPTION 'pricing_rate_cards: díjtörzset csak Tulajdonos hagyhat jóvá' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pricing_rate_card_items i WHERE i.card_id = OLD.id) THEN RAISE EXCEPTION 'pricing_rate_cards: üres díjtörzs nem hagyható jóvá' USING ERRCODE = 'check_violation'; END IF;
    NEW.approved_by := auth.uid(); NEW.approved_at := now();
  ELSIF OLD.status = 'approved' AND NEW.status = 'retired' THEN
    IF auth.uid() IS NULL OR NOT public.is_owner_role(auth.uid()) THEN RAISE EXCEPTION 'pricing_rate_cards: díjtörzset csak Tulajdonos vonhat vissza' USING ERRCODE = 'insufficient_privilege'; END IF;
    IF (to_jsonb(NEW) - ARRAY['status','updated_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','updated_at']) THEN RAISE EXCEPTION 'pricing_rate_cards: visszavonáskor csak az állapot változhat' USING ERRCODE = 'check_violation'; END IF;
  ELSIF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL THEN RAISE EXCEPTION 'pricing_rate_cards: jóváhagyási mezők csak jóváhagyáskor' USING ERRCODE = 'check_violation'; END IF;
  ELSE
    RAISE EXCEPTION 'pricing_rate_cards: nem engedélyezett állapotváltás (% → %)', OLD.status, NEW.status USING ERRCODE = 'check_violation';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER pricing_rate_cards_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pricing_rate_cards FOR EACH ROW EXECUTE FUNCTION public.pricing_rate_cards_guard();
CREATE OR REPLACE FUNCTION public.pricing_rate_card_items_guard() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM public.pricing_rate_cards WHERE id = COALESCE(NEW.card_id, OLD.card_id);
  IF st IS DISTINCT FROM 'draft' THEN RAISE EXCEPTION 'pricing_rate_card_items: csak tervezet díjtörzs tételei írhatók' USING ERRCODE = 'check_violation'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.card_id <> OLD.card_id THEN RAISE EXCEPTION 'pricing_rate_card_items: a tétel nem helyezhető át másik díjtörzsbe' USING ERRCODE = 'check_violation'; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER pricing_rate_card_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pricing_rate_card_items FOR EACH ROW EXECUTE FUNCTION public.pricing_rate_card_items_guard();

-- ---------------------------------------------------------------- E) package_processing_jobs.token elrejtése
-- A kliens egyetlen olvasása (processing.server.ts csomagjelentés) nem kéri a tokent; a feldolgozó-folyamat szolgáltatásszerepkörrel fut.
REVOKE SELECT ON public.package_processing_jobs FROM authenticated;
GRANT SELECT (id, file_id, package_id, status, attempt, requested_by, dispatched_at, heartbeat_at, finished_at, error_code, error_detail, created_at, updated_at)
  ON public.package_processing_jobs TO authenticated;

COMMIT;
