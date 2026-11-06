import { Badge } from '@/components/ui/badge';
import { MARKETING_STATUS_LABEL, readMarketingMeta } from '@/lib/marketing-status';

/** Same saved workflow interpretation for owner and marketing; never a delivery claim. */
export function CompanyMarketingSummary({ notes }: { notes: string | null }) {
  const meta = readMarketingMeta(notes);
  return <div className="flex flex-wrap items-center gap-2 border-b py-3 text-sm">
    <span className="text-muted-foreground">Marketingállapot</span>
    <Badge variant="outline">{MARKETING_STATUS_LABEL[meta.status]}</Badge>
    {meta.statusDate && <span className="text-xs text-muted-foreground">{meta.statusDate}</span>}
    <span className="text-xs text-muted-foreground">Mentett munkafolyamat-jelölés, nem Gmail-küldési bizonyíték.</span>
  </div>;
}