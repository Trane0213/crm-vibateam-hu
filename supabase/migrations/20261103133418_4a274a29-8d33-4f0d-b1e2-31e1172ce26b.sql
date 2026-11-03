REVOKE ALL ON FUNCTION public.quote_items_after() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.quotes_discount_after() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_items_calc() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.quote_recalc_total(uuid) FROM public, anon, authenticated;