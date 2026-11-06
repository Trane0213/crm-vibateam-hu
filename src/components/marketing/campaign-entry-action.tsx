import { Link } from '@tanstack/react-router';
import { ListPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/use-permissions';

/** Opens the existing preparation workspace; server-side role checks still govern saving. */
export function CampaignEntryAction({ companyId, contactId, disabled = false }: { companyId: string; contactId?: string; disabled?: boolean }) {
  const { role, isLoading } = usePermissions();
  if (isLoading || (role !== 'owner' && role !== 'marketing')) return null;
  if (disabled) return <Button variant="outline" size="sm" disabled title="Előbb mentsd a kapcsolattartó módosításait">Hozzáadás kampányhoz</Button>;
  return <Button variant="outline" size="sm" asChild>
    <Link to="/campaign-list" search={{ companyId, contactId }}>
      <ListPlus className="mr-1.5 h-4 w-4" />Hozzáadás kampányhoz
    </Link>
  </Button>;
}