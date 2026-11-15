CREATE OR REPLACE FUNCTION public.quote_discard_unsent(p_quote_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE q quotes%ROWTYPE; prev uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Bejelentkezés szükséges' USING ERRCODE = '42501'; END IF;
  SELECT * INTO q FROM quotes WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND OR NOT can_access_quote(q.lead_id, q.project_id, q.created_by) THEN
    RAISE EXCEPTION 'Az ajánlat nem található, vagy nincs jogosultságod a törléséhez' USING ERRCODE = '42501';
  END IF;
  IF q.sent_at IS NOT NULL OR q.locked_at IS NOT NULL OR EXISTS (SELECT 1 FROM quote_sends WHERE quote_id = q.id) THEN
    RAISE EXCEPTION 'Kiküldött ajánlat nem törölhető' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM quote_documents WHERE quote_id = q.id)
     OR EXISTS (SELECT 1 FROM document_packages WHERE quote_id = q.id)
     OR EXISTS (SELECT 1 FROM knowledge_documents WHERE quote_id = q.id) THEN
    RAISE EXCEPTION 'Az ajánlathoz feltöltött dokumentum tartozik, ezért nem törölhető — vond vissza' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM followups WHERE quote_id = q.id) THEN
    RAISE EXCEPTION 'Az ajánlathoz utánkövetés tartozik, ezért nem törölhető — vond vissza' USING ERRCODE = 'check_violation';
  END IF;
  DELETE FROM quote_items WHERE quote_id = q.id;
  DELETE FROM quotes WHERE id = q.id;
  IF q.is_current THEN
    SELECT id INTO prev FROM quotes
     WHERE group_id = q.group_id AND alternative_key = q.alternative_key
     ORDER BY version DESC LIMIT 1;
    IF prev IS NOT NULL THEN UPDATE quotes SET is_current = true WHERE id = prev; END IF;
  END IF;
  INSERT INTO activities(user_id, action, details)
  VALUES (auth.uid(), 'delete', jsonb_build_object('entity_type', 'quotes', 'entity_id', q.id,
    'payload', jsonb_build_object('title', q.title, 'version', q.version, 'status', q.status,
      'lead_id', q.lead_id, 'project_id', q.project_id, 'restored_current', prev)));
  RETURN jsonb_build_object('deleted', q.id, 'restored_current', prev);
END $$;

REVOKE ALL ON FUNCTION public.quote_discard_unsent(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.quote_discard_unsent(uuid) TO authenticated;