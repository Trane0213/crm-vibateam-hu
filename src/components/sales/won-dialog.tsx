import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function WonDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lead megnyerése</DialogTitle>
          <DialogDescription>
            A státusz <strong>won</strong>-ra vált, a <code>won_at</code> időbélyeg automatikusan beáll.
            Innen az Átadás tabon indítható a projekt.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Mégse</Button>
          <Button onClick={onConfirm} disabled={busy}>{busy ? "Mentés…" : "Megerősítem"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
