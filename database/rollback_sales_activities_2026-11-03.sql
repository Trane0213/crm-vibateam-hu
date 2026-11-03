-- Explicit owner-approved backup of exactly three incorrectly completed activities.
-- Apply through the migration tool ONLY if restoration is requested.
-- Existing owner assignment trigger does not change the explicitly supplied assigned_to.
BEGIN;
INSERT INTO public.followups (id,project_id,company_id,quote_id,assigned_agent_id,followup_type,due_date,completed,result,created_at,lead_id,assigned_to) VALUES
('0d733570-433b-4b24-b6c3-950366a8b8b0',NULL,'342a4576-4a1b-561e-985b-302d98a71b9a',NULL,NULL,'meeting','2026-11-04T12:00:00+00',true,'Találkozó Felmérésre','2026-10-30T11:23:22.848063+00','e1d4afb6-3ba6-4ea6-b04e-4ef1a0b045b0','99551050-d92f-4b57-9cf7-b641f1571429'),
('a910add0-f66d-4335-87eb-0b20d74770de',NULL,'342a4576-4a1b-561e-985b-302d98a71b9a',NULL,NULL,'meeting','2026-11-04T12:00:00+00',true,'Bejárás VBF JEGYZŐKÖNYV','2026-10-30T14:17:19.021604+00','e1d4afb6-3ba6-4ea6-b04e-4ef1a0b045b0','99551050-d92f-4b57-9cf7-b641f1571429'),
('346b65f3-6e19-4ad3-9d9b-d4e5eb21911a',NULL,'e127c582-5b86-4281-88c8-038ceef007b2',NULL,NULL,'call','2026-11-05T10:20:00+00',true,NULL,'2026-11-03T10:20:51.899747+00','8e70667a-d30c-425d-81f6-962bafb7a896','401cc133-10bd-494b-aa49-28ee14b3266e');
COMMIT;