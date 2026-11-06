import { it, expect, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { refreshMarketingWork } from './marketing-refresh';
it('handoff and partial intake refresh Pipeline, leads, company, daily and matching reads', async () => {
  const invalidateQueries = vi.fn(async () => {});
  await refreshMarketingWork({ invalidateQueries } as unknown as QueryClient);
  for (const key of ['leads','pipeline','customers','companies','contacts','mkt-home','campaign-list','web-request-intake']) expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: [key] });
});