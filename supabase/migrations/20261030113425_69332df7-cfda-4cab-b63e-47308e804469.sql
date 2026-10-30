CREATE OR REPLACE VIEW public.customer_kpi_v WITH (security_invoker=on) AS
 WITH proj AS (
         SELECT p.company_id, (count(*))::integer AS total_projects,
            (count(*) FILTER (WHERE (p.status = ANY (ARRAY['uj_megkereses'::text, 'felmeres'::text, 'ajanlat_keszul'::text, 'ajanlat_kikuldve'::text, 'utankovetes'::text, 'kivitelezes'::text]))))::integer AS active_projects
           FROM projects p WHERE (p.company_id IS NOT NULL) GROUP BY p.company_id
        ), quo_links AS (
         SELECT p.company_id, q.id FROM quotes q JOIN projects p ON p.id = q.project_id
          WHERE p.company_id IS NOT NULL AND q.status = ANY (ARRAY['draft'::text, 'sent'::text, 'negotiation'::text])
         UNION
         SELECT l.company_id, q.id FROM quotes q JOIN leads l ON l.id = q.lead_id
          WHERE l.company_id IS NOT NULL AND q.status = ANY (ARRAY['draft'::text, 'sent'::text, 'negotiation'::text])
        ), quo AS (
         SELECT company_id, (count(*))::integer AS open_quotes FROM quo_links GROUP BY company_id
        ), fup_open AS (
         SELECT f.* FROM followups f
          WHERE COALESCE(f.completed, false) = false AND f.due_date IS NOT NULL AND f.due_date < now()
        ), fup_links AS (
         SELECT f.company_id, f.id FROM fup_open f WHERE f.company_id IS NOT NULL
         UNION
         SELECT p.company_id, f.id FROM fup_open f JOIN projects p ON p.id = f.project_id WHERE p.company_id IS NOT NULL
         UNION
         SELECT l.company_id, f.id FROM fup_open f JOIN leads l ON l.id = f.lead_id WHERE l.company_id IS NOT NULL
        ), fup AS (
         SELECT company_id, (count(*))::integer AS overdue_followups FROM fup_links GROUP BY company_id
        ), act AS (
         SELECT customer_activity_v.customer_id, max(customer_activity_v.event_date) AS last_activity_at
           FROM customer_activity_v GROUP BY customer_activity_v.customer_id
        )
 SELECT c.id AS customer_id, COALESCE(proj.total_projects, 0) AS total_projects, COALESCE(proj.active_projects, 0) AS active_projects,
    COALESCE(quo.open_quotes, 0) AS open_quotes, COALESCE(fup.overdue_followups, 0) AS overdue_followups, act.last_activity_at
   FROM ((((companies c LEFT JOIN proj ON ((proj.company_id = c.id))) LEFT JOIN quo ON ((quo.company_id = c.id)))
     LEFT JOIN fup ON ((fup.company_id = c.id))) LEFT JOIN act ON ((act.customer_id = c.id)));