import { Badge } from '@/components/ui/badge';
import { MARKETING_STATUS_LABEL, readMarketingMeta, marketingStateOrigin, type CompanyMarketingState } from '@/lib/marketing-status';
import { CompanyBlockControl } from '@/components/marketing/company-block-control';

/** Same saved workflow interpretation for owner and marketing; never a delivery claim. */
export function CompanyMarketingSummary({ notes, company }: { notes: string | null; company?: CompanyMarketingState & { id?: string } }) {
  const meta = readMarketingMeta(notes, company);
  const origin = marketingStateOrigin(notes, company);
  return <div className="flex flex-wrap items-center gap-2 border-b py-3 text-sm">
    <span className="text-muted-foreground">Marketingállapot</span>
    <Badge variant="outline">{origin === 'missing' ? 'Nincs rögzített állapot' : MARKETING_STATUS_LABEL[meta.status]}</Badge>
    {meta.statusDate && <span className="text-xs text-muted-foreground">{meta.statusDate}</span>}
    {origin === 'legacy' && <span className="text-xs text-muted-foreground">Régi, nem ellenőrzött jelölés</span>}
    {company?.id && <CompanyBlockControl companyId={company.id} />}
  </div>;
}