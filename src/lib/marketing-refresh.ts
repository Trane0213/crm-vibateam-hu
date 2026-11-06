import type { QueryClient } from '@tanstack/react-query';

export const MARKETING_REFRESH_KEYS = ['customers', 'companies', 'contacts', 'leads', 'pipeline', 'mkt-home', 'campaign-list', 'web-request-intake'] as const;
export function refreshMarketingWork(qc: QueryClient) {
  return Promise.all(MARKETING_REFRESH_KEYS.map(key => qc.invalidateQueries({ queryKey: [key] })));
}