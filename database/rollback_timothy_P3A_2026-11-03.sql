-- Disable P3/A tool first; all activity/audit rows retained.
DROP FUNCTION IF EXISTS public.sales_record_approved_prep_activity(uuid);