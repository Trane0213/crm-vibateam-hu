import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useState } from 'react';

const STATUS: Record<string, string> = { draft: 'Tervezet', prechecked: 'Előellenőrzött', archived: 'Archivált' };
const ELIGIBILITY: Record<string, string> = { ready: 'Kész', contacted: 'Korábbi küldés igazolt', replied: 'Szálbeli válasz', uncertain: 'Ellenőrizendő', invalid: 'Hibás / tiltott' };

/** Persisted contact membership only; user-RLS enforces campaign and contact visibility. */
export function CompanyCampaigns({ companyId, contactIds, enabled = true }: { companyId: string; contactIds: string[]; enabled?: boolean }) {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ['email_campaign_recipients', 'company', companyId, contactIds.join(',')],
    enabled,
    queryFn: async () => {
      const rows: { id: string; campaign_id: string; email_norm: string | null; eligibility: string; checked_at: string; reasons: unknown; email_campaigns: { name: string; status: string } | null }[] = [];
      for (let i = 0; i < contactIds.length; i += 200) {
        for (let from = 0; ; from += 1000) {
          const result = await supabase.from('email_campaign_recipients')
            .select('id,campaign_id,email_norm,eligibility,checked_at,reasons,email_campaigns!inner(name,status)')
            .in('contact_id', contactIds.slice(i, i + 200)).order('id').range(from, from + 999);
          if (result.error) throw result.error;
          rows.push(...result.data);
          if (result.data.length < 1000) break;
        }
      }
      return rows;
    },
  });
  if (query.isPending) return <p className="text-sm text-muted-foreground">Kampánykapcsolatok betöltése…</p>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">A kampánykapcsolatok nem tölthetők be.</p>;
  const rows = query.data ?? [];
  const currentPage = Math.min(page, Math.max(0, Math.ceil(rows.length / 25) - 1));
  return <div className="space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm text-muted-foreground">{new Set(rows.map(r => r.campaign_id)).size} látható kampány · {rows.length} mentett kontaktkapcsolat</span>
    </div>
    {!rows.length ? <p className="text-sm text-muted-foreground">Nincs számodra látható, mentett kampánytagság.</p> : <ul className="divide-y border-y">
      {rows.slice(currentPage * 25, (currentPage + 1) * 25).map(row => <li key={row.id} className="space-y-1 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{row.email_campaigns?.name}</span><Badge variant="outline">{STATUS[row.email_campaigns?.status ?? ''] ?? 'Ismeretlen állapot'}</Badge></div>
        <div className="break-all">{row.email_norm ?? 'Hiányzó cím'} · {ELIGIBILITY[row.eligibility] ?? 'Ellenőrizendő'}</div>
        {Array.isArray(row.reasons) && row.reasons.length > 0 && <p className="text-xs text-muted-foreground">{row.reasons.filter(r => typeof r === 'string').join(' · ')}</p>}
        <p className="text-xs text-muted-foreground">Ellenőrizve: {new Date(row.checked_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}</p>
      </li>)}
    </ul>}
    {rows.length > 25 && <div className="flex items-center justify-end gap-2 text-xs">
      <span>{currentPage + 1} / {Math.ceil(rows.length / 25)}</span>
      <Button variant="outline" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Előző</Button>
      <Button variant="outline" size="sm" disabled={(currentPage + 1) * 25 >= rows.length} onClick={() => setPage(currentPage + 1)}>Következő</Button>
    </div>}
  </div>;
}