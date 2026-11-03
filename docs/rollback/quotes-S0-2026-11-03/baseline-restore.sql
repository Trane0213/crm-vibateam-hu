-- Ajánlatkezelés V2.0 – S0 kiinduló állapot (2026-11-03 13:31 UTC). NEM futtatandó automatikusan.
-- Csak tulajdonosi jóváhagyással, ha egy későbbi S1–S8 lépés visszaállítása szükséges.

-- 1) RLS policyk eredeti állapota
DROP POLICY IF EXISTS quotes_write ON public.quotes;
CREATE POLICY quotes_write ON public.quotes FOR ALL TO authenticated
  USING (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','sales']))
  WITH CHECK (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','sales']));
DROP POLICY IF EXISTS quote_items_write ON public.quote_items;
CREATE POLICY quote_items_write ON public.quote_items FOR ALL TO authenticated
  USING (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','sales']))
  WITH CHECK (is_owner_role(auth.uid()) OR crm_role_of(auth.uid()) = ANY (ARRAY['project_manager','sales']));
-- Megjegyzés: S0-kor egyik táblán sincs trigger; később hozzáadott triggereket a saját rollbackjük kezeli.

-- 2) Adatsorok (4 quote, 2 item) – upsert az S0-kori értékekre
INSERT INTO public.quotes (id,project_id,version,status,created_by,total_amount,created_at,lead_id,is_current,title,valid_until,notes,discount_percent,tax_percent) VALUES
('c9684593-dbe6-4203-9a85-98dc7ff2cd2d',NULL,1,'draft','44d7a3e7-25b7-47bc-96e9-86fafe695fae',NULL,'2026-10-30T10:01:31.214872+00',NULL,true,NULL,NULL,NULL,NULL,NULL),
('6eaab55c-7336-495b-8eea-6eb20d32a271','3c69f3f3-4d03-4587-b3fe-8f4035e2bb70',1,'draft','44d7a3e7-25b7-47bc-96e9-86fafe695fae',NULL,'2026-10-30T13:11:04.227685+00','43b05791-5a41-4e33-ba3b-336dd2af77bd',true,'TESZT – Sales S2 ajánlat',NULL,NULL,NULL,27),
('da53c565-559b-4600-b870-7ddf0a61923d',NULL,1,'draft','6d8ee400-9b59-4a3a-830e-2899124ebb04',NULL,'2026-11-03T10:52:52.182026+00','8e70667a-d30c-425d-81f6-962bafb7a896',true,'teszt','2026-11-04',NULL,0,NULL),
('7874be50-3c2c-49fc-8a98-1c9f5d7ce6e2',NULL,1,'draft','44d7a3e7-25b7-47bc-96e9-86fafe695fae',NULL,'2026-11-03T12:48:32.639617+00',NULL,true,NULL,NULL,NULL,NULL,NULL)
ON CONFLICT (id) DO UPDATE SET project_id=EXCLUDED.project_id,version=EXCLUDED.version,status=EXCLUDED.status,created_by=EXCLUDED.created_by,total_amount=EXCLUDED.total_amount,lead_id=EXCLUDED.lead_id,is_current=EXCLUDED.is_current,title=EXCLUDED.title,valid_until=EXCLUDED.valid_until,notes=EXCLUDED.notes,discount_percent=EXCLUDED.discount_percent,tax_percent=EXCLUDED.tax_percent;

INSERT INTO public.quote_items (id,quote_id,name,quantity,unit,unit_price,total_price,created_at) VALUES
('b20ad108-0630-491e-92bd-8478f241b78a','6eaab55c-7336-495b-8eea-6eb20d32a271','TESZT tétel klíma',2,'db',100000,0,'2026-10-30T13:11:12.722202+00'),
('36b31ff8-5872-4af0-bb46-0eeac2635dde','da53c565-559b-4600-b870-7ddf0a61923d','alapszereles',1,'5',6000,0,'2026-11-03T10:55:15.161143+00')
ON CONFLICT (id) DO UPDATE SET quote_id=EXCLUDED.quote_id,name=EXCLUDED.name,quantity=EXCLUDED.quantity,unit=EXCLUDED.unit,unit_price=EXCLUDED.unit_price,total_price=EXCLUDED.total_price;
