-- Visszaállítás: customer_kpi_v a 2. szakasz D2-1 előtti állapotra (security_invoker megmarad).
CREATE OR REPLACE VIEW public.customer_kpi_v WITH (security_invoker=on) AS
 WITH proj AS (
         SELECT p.company_id, (count(*))::integer AS total_projects,
            (count(*) FILTER (WHERE (p.status = ANY (ARRAY['uj_megkereses'::text, 'felmeres'::text, 'ajanlat_keszul'::text, 'ajanlat_kikuldve'::text, 'utankovetes'::text, 'kivitelezes'::text]))))::integer AS active_projects
           FROM projects p WHERE (p.company_id IS NOT NULL) GROUP BY p.company_id
        ), quo AS (
         SELECT p.company_id, (count(*))::integer AS open_quotes
           FROM (quotes q JOIN projects p ON ((p.id = q.project_id)))
          WHERE ((p.company_id IS NOT NULL) AND (q.status = ANY (ARRAY['draft'::text, 'sent'::text, 'negotiation'::text])))
          GROUP BY p.company_id
        ), fup AS (
         SELECT p.company_id, (count(*))::integer AS overdue_followups
           FROM (followups f JOIN projects p ON ((p.id = f.project_id)))
          WHERE ((p.company_id IS NOT NULL) AND (COALESCE(f.completed, false) = false) AND (f.due_date IS NOT NULL) AND (f.due_date < now()))
          GROUP BY p.company_id
        ), act AS (
         SELECT customer_activity_v.customer_id, max(customer_activity_v.event_date) AS last_activity_at
           FROM customer_activity_v GROUP BY customer_activity_v.customer_id
        )
 SELECT c.id AS customer_id, COALESCE(proj.total_projects, 0) AS total_projects, COALESCE(proj.active_projects, 0) AS active_projects,
    COALESCE(quo.open_quotes, 0) AS open_quotes, COALESCE(fup.overdue_followups, 0) AS overdue_followups, act.last_activity_at
   FROM ((((companies c LEFT JOIN proj ON ((proj.company_id = c.id))) LEFT JOIN quo ON ((quo.company_id = c.id)))
     LEFT JOIN fup ON ((fup.company_id = c.id))) LEFT JOIN act ON ((act.customer_id = c.id)));
