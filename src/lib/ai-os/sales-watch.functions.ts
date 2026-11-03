import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/middleware';
export const readSalesWatch = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { loadSalesWatch } = await import('./sales-watch.server');
    return loadSalesWatch(context.supabase, context.userId);
  });