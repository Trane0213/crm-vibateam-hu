-- Disables only this function; preserves leads, activities and P0 lifecycle.
DROP FUNCTION IF EXISTS public.sales_update_approved_next_step(uuid);