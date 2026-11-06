-- Freeze writes only; preserve every block and audit. Do not restore a send path
-- that ignores active blocks. No dropped columns, deleted rows or changed RLS.
revoke execute on function public.company_set_marketing_block(uuid,boolean,text,uuid) from authenticated;