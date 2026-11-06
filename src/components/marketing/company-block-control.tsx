import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { ShieldBan } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { readCompanyBlock, setCompanyBlock } from '@/lib/marketing/company-block.functions';
import { companyBlockAllows } from '@/lib/marketing/company-block';
import { refreshMarketingWork } from '@/lib/marketing-refresh';

export function CompanyBlockControl({ companyId }: { companyId: string }) {
  const { role } = usePermissions();
  const read = useServerFn(readCompanyBlock), save = useServerFn(setCompanyBlock);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['companies', 'marketing-block', companyId], queryFn: () => read({ data: { companyId } }) });
  const [open, setOpen] = useState(false), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const state = query.data;
  const blocked = state?.marketing_blocked === true;
  const permitted = companyBlockAllows(role, !blocked);
  if (query.isPending) return <span className="text-xs text-muted-foreground">Marketingtiltás ellenőrzése…</span>;
  if (query.error || !state) return <span role="alert" className="text-xs text-destructive">A cégtiltás nem ellenőrizhető. <Button size="sm" variant="ghost" onClick={() => query.refetch()}>Újrapróbálás</Button></span>;
  return <div className="flex flex-wrap items-center gap-2 py-2 text-sm">
    {blocked && <><Badge variant="destructive"><ShieldBan className="mr-1 h-3.5 w-3.5" />Cégszintű marketingtiltás</Badge><span className="break-words text-xs">{state.marketing_block_reason}</span></>}
    {state.marketing_block_changed_at && <span className="text-xs text-muted-foreground">{new Date(state.marketing_block_changed_at).toLocaleString('hu-HU', { timeZone: 'Europe/Budapest' })}</span>}
    {permitted && <Button size="sm" variant="outline" onClick={() => { setReason(''); setOpen(true); }}><ShieldBan className="mr-1.5 h-4 w-4" />{blocked ? 'Tiltás feloldása' : 'Marketingtiltás'}</Button>}
    {blocked && role === 'marketing' && <span className="text-xs text-muted-foreground">Feloldás: csak tulajdonos.</span>}
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}><DialogContent><DialogHeader>
      <DialogTitle>{blocked ? 'Cég marketingtiltásának feloldása' : 'Cégszintű marketingtiltás'}</DialogTitle>
      <DialogDescription>{blocked ? 'Minden céges kontakt hideg marketingtiltásának feloldása.' : 'A cég jelenlegi és új kontaktjaira is vonatkozik. A szerződéses és ügyfélszolgálati levelezés megmarad.'}</DialogDescription>
    </DialogHeader><label className="space-y-2 text-sm">Indok (kötelező)<Input aria-label="Cégtiltás indoka" value={reason} maxLength={500} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>Mégse</Button><Button disabled={busy || reason.trim().length < 5} onClick={async () => {
      setBusy(true);
      try {
        await save({ data: { companyId, blocked: !blocked, reason, expectedRevision: state.marketing_block_revision } });
        toast.success(blocked ? 'Cégszintű tiltás feloldva' : 'Cégszintű marketingtiltás mentve'); setOpen(false);
      } catch (error) { toast.error(error instanceof Error ? error.message : 'A mentés nem igazolt.'); }
      finally {
        setBusy(false); await refreshMarketingWork(qc);
        await Promise.all(['campaign-draft', 'email_campaign_recipients', 'campaign-drafts'].map(key => qc.invalidateQueries({ queryKey: [key] })));
      }
    }}>{busy ? 'Mentés…' : blocked ? 'Feloldás mentése' : 'Tiltás mentése'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}