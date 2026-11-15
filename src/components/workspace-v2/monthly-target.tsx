import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getMonthlyTargets, saveMonthlyTarget } from "@/lib/workspace-v2/targets.functions";
import { TARGET_LABEL, budapestMonth, targetProgress, type TargetArea } from "@/lib/workspace-v2/targets";
import { formatHuf } from "@/lib/format";
import { cn } from "@/lib/utils";

export function useMonthlyTargets() {
  const get = useServerFn(getMonthlyTargets);
  const month = budapestMonth();
  return useQuery({ queryKey: ["workspace-v2", "targets", month], queryFn: () => get({ data: { month } }), staleTime: 60_000 });
}

/** Havi cél kártya: cél nélkül „nincs beállítva”; tulajdonos itt állíthatja be. */
export function MonthlyTargetCard({ area, actual, actualLabel }: { area: TargetArea; actual: number | null; actualLabel?: string }) {
  const q = useMonthlyTargets();
  const target = q.data?.[area] ?? null;
  const pct = targetProgress(actual, target);
  const [open, setOpen] = useState(false);
  const fmt = (n: number) => (TARGET_LABEL[area].unit === "Ft" ? formatHuf(n) : `${n} db`);
  return (
    <div className="min-w-0 rounded-xl border bg-card p-3 text-center shadow-[var(--shadow-card)]">
      <div className={cn("font-display text-2xl font-bold", pct == null ? "text-base text-muted-foreground" : "text-status-success")}>
        {q.isLoading ? "…" : q.isError ? "nem elérhető" : pct == null ? (target ? "tény nem ismert" : "nincs beállítva") : `${pct}%`}
      </div>
      <div className="truncate text-xs text-muted-foreground" title={TARGET_LABEL[area].title}>
        Havi cél{target ? ` (${fmt(target.amount)})` : ""}{actualLabel ? ` · ${actualLabel}` : ""}
      </div>
      {q.data?.canEdit && <button type="button" onClick={() => setOpen(true)} className="mt-1 text-[11px] text-primary hover:underline">{target ? "Módosítás" : "Beállítás"}</button>}
      {q.data?.canEdit && <TargetDialog area={area} open={open} onOpenChange={setOpen} revision={target?.revision ?? 0} current={target?.amount ?? null} />}
    </div>
  );
}

function TargetDialog({ area, open, onOpenChange, revision, current }: { area: TargetArea; open: boolean; onOpenChange: (v: boolean) => void; revision: number; current: number | null }) {
  const save = useServerFn(saveMonthlyTarget);
  const qc = useQueryClient();
  const [value, setValue] = useState(current ? String(current) : "");
  const month = budapestMonth();
  const mut = useMutation({
    mutationFn: async () => {
      const amount = Number(value.replace(/\s/g, ""));
      if (!Number.isFinite(amount) || amount <= 0) throw new Error("Pozitív számot adj meg.");
      return save({ data: { area, month, amount, expectedRevision: revision } });
    },
    onSuccess: () => { toast.success("Havi cél mentve"); qc.invalidateQueries({ queryKey: ["workspace-v2", "targets"] }); onOpenChange(false); },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Nem menthető."),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TARGET_LABEL[area].title}</DialogTitle>
          <DialogDescription>{month} hónapra. Csak tulajdonos állíthatja; amíg nincs megadva, a felület „nincs beállítva” állapotot mutat.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`target-${area}`}>Cél ({TARGET_LABEL[area].unit})</Label>
          <Input id={`target-${area}`} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Mégse</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>Mentés</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
