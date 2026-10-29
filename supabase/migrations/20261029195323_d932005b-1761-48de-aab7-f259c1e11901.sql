-- 1) Kivitelezési projekt-státuszrendszer
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_viba_check;
UPDATE public.projects SET status = CASE
  WHEN status IN ('uj_megkereses','ajanlat_keszul','ajanlat_kikuldve','utankovetes','megnyert') THEN 'atadas'
  WHEN status = 'elvesztett' THEN 'felfuggesztve'
  ELSE status END;
ALTER TABLE public.projects ALTER COLUMN status SET DEFAULT 'atadas';
ALTER TABLE public.projects ADD CONSTRAINT projects_status_viba_check
  CHECK (status = ANY (ARRAY['atadas','felmeres','elokeszites','kivitelezes','muszaki_atadas','lezart','felfuggesztve']));

-- 2) Megnyert lead adatainak összekapcsolása a projekttel (nincs másolat, csak hivatkozás)
CREATE OR REPLACE FUNCTION public.projects_link_lead_records()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_contact uuid;
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.quotes SET project_id = NEW.id WHERE lead_id = NEW.lead_id AND project_id IS NULL;
  UPDATE public.followups SET project_id = NEW.id WHERE lead_id = NEW.lead_id AND project_id IS NULL;
  SELECT contact_id INTO v_contact FROM public.leads WHERE id = NEW.lead_id;
  IF v_contact IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_contacts WHERE project_id = NEW.id AND contact_id = v_contact) THEN
    INSERT INTO public.project_contacts(project_id, contact_id, role) VALUES (NEW.id, v_contact, 'donteshozo');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_projects_link_lead_records ON public.projects;
CREATE TRIGGER trg_projects_link_lead_records AFTER INSERT OR UPDATE OF lead_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.projects_link_lead_records();

-- Utólagos összekapcsolás a meglévő projektekre
UPDATE public.quotes q SET project_id = p.id FROM public.projects p
  WHERE p.lead_id IS NOT NULL AND q.lead_id = p.lead_id AND q.project_id IS NULL;
UPDATE public.followups f SET project_id = p.id FROM public.projects p
  WHERE p.lead_id IS NOT NULL AND f.lead_id = p.lead_id AND f.project_id IS NULL;
INSERT INTO public.project_contacts(project_id, contact_id, role)
  SELECT p.id, l.contact_id, 'donteshozo' FROM public.projects p JOIN public.leads l ON l.id = p.lead_id
  WHERE l.contact_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.project_contacts pc WHERE pc.project_id = p.id AND pc.contact_id = l.contact_id);

-- 3) Élő frissítés (RLS továbbra is szűri, ki mit kap meg)
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['leads','quotes','followups','projects','tasks'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;