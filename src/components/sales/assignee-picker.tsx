import { Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RecordCombobox } from "@/components/resource/record-combobox";
import { usePermissions } from "@/hooks/use-permissions";

/** Only owners reassign; retain the existing sales-only dataset and no unassign. */
export function AssigneePicker({ assigneeId, assigneeLabel, onAssign, busy }: {
  assigneeId: string | null | undefined; assigneeLabel: string;
  onAssign: (next: string | null) => void; busy?: boolean;
}) {
  const { role } = usePermissions();
  if (role !== "owner") return <Button size="sm" variant="ghost" disabled className="pointer-events-none"><Users className="mr-1 h-4 w-4" />Felelős: {assigneeLabel}</Button>;
  return <RecordCombobox source="v_sales_user_load" value={assigneeId} onChange={onAssign}
    label="Felelős értékesítő" disabled={busy} className="max-w-64 text-xs" />;
}