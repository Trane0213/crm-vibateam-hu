-- ============================================================================
-- Agent visibility — role-alapú AI agent hozzáférés
-- ============================================================================
-- Új tábla:  public.agent_role_access
-- Cél:       agent (text id) × role (FK roles.id) látható-e (can_view)
-- Írás:      csak owner (is_owner_role)
-- Olvasás:   authenticated
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.agent_role_access (
  agent_id    text         NOT NULL,
  role_id     uuid         NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  can_view    boolean      NOT NULL DEFAULT true,
  created_at  timestamptz  NOT NULL DEFAULT now(),
  updated_at  timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, role_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_role_access TO authenticated;
GRANT ALL ON public.agent_role_access TO service_role;

ALTER TABLE public.agent_role_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_role_access_select_all" ON public.agent_role_access;
CREATE POLICY "agent_role_access_select_all"
  ON public.agent_role_access FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "agent_role_access_write_owner" ON public.agent_role_access;
CREATE POLICY "agent_role_access_write_owner"
  ON public.agent_role_access FOR ALL TO authenticated
  USING (public.is_owner_role(auth.uid()))
  WITH CHECK (public.is_owner_role(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_agent_role_access_role ON public.agent_role_access (role_id);

COMMENT ON TABLE public.agent_role_access IS
  'AI agent láthatóság role szerint. George (crm) a frontendben mindig látható, függetlenül a táblától.';

-- ============================================================================
-- Alapértelmezett láthatóság seed (csak ha még nincs rekord)
--   crm     (George)   → minden szerepkör
--   sales   (Timothy)  → owner, sales
--   pm      (Boss)     → owner, project_manager
--   marketing(Scarlet) → owner, marketing
-- Megjegyzés: a normalizeRole összevonja a salesperson/sales_manager → sales,
-- project_manager/operations_manager → project_manager, marketing_manager → marketing.
-- ============================================================================
INSERT INTO public.agent_role_access (agent_id, role_id, can_view)
SELECT 'crm', r.id, true FROM public.roles r
ON CONFLICT (agent_id, role_id) DO NOTHING;

INSERT INTO public.agent_role_access (agent_id, role_id, can_view)
SELECT 'sales', r.id, true FROM public.roles r
WHERE lower(r.name) IN ('owner','tulajdonos','admin','superadmin','sales','ertekesito','értékesítő','salesperson','sales_manager','sales_rep')
ON CONFLICT (agent_id, role_id) DO NOTHING;

INSERT INTO public.agent_role_access (agent_id, role_id, can_view)
SELECT 'pm', r.id, true FROM public.roles r
WHERE lower(r.name) IN ('owner','tulajdonos','admin','superadmin','project_manager','projektvezeto','projektvezető','pm','operations_manager')
ON CONFLICT (agent_id, role_id) DO NOTHING;

INSERT INTO public.agent_role_access (agent_id, role_id, can_view)
SELECT 'marketing', r.id, true FROM public.roles r
WHERE lower(r.name) IN ('owner','tulajdonos','admin','superadmin','marketing','marketinges','marketing_manager')
ON CONFLICT (agent_id, role_id) DO NOTHING;