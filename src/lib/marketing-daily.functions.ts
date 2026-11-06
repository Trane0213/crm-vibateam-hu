import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
export const getMarketingDaily = createServerFn({method:'GET'}).middleware([requireSupabaseAuth]).handler(async ({context})=>{
  const { loadMarketingDaily } = await import('./marketing-daily');
  return loadMarketingDaily(context.supabase,context.userId);
});