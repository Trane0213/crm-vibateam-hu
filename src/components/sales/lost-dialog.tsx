import { useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LOST_REASONS, LOST_REASON_LABEL, type LostReason } from "@/lib/sales/constants";

export function LostDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (payload: { lost_reason: LostReason; lost_note: string | null }) => void;
  busy?: boolean;
}) {
  const [reason, setReason] = useState<LostReason | "">("");
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lead elveszett</DialogTitle>
          <DialogDescription>Az indok kötelező — a backend trigger ellenőrzi.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Indok *</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as LostReason)}>
              <SelectTrigger><SelectValue placeholder="Válassz indokot…" /></SelectTrigger>
              <SelectContent>
                {LOST_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{LOST_REASON_LABEL[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Megjegyzés</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Opcionális kontextus…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Mégse</Button>
          <Button variant="destructive" disabled={!reason || busy} onClick={() => reason && onConfirm({ lost_reason: reason, lost_note: note.trim() || null })}>
            {busy ? "Mentés…" : "Elveszett megjelölése"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
