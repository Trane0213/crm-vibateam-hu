-- Szűkítés: a belső AI-felülvizsgálati táblákat kliens csak olvashatja (Tulajdonos RLS), írni csak a szerver tud.
REVOKE ALL ON public.ai_review_config, public.ai_review_runs, public.ai_review_signals FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.ai_review_config, public.ai_review_runs, public.ai_review_signals FROM authenticated;
GRANT SELECT ON public.ai_review_config, public.ai_review_runs, public.ai_review_signals TO authenticated;