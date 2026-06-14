import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NEXT_STEP_TYPES, NEXT_STEP_LABEL, type NextStepType } from "@/lib/sales/constants";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NextStepEditor({
  type,
  dueAt,
  note,
  onSave,
  onClear,
  busy,
}: {
  type: string | null;
  dueAt: string | null;
  note: string | null;
  onSave: (p: { next_step_type: NextStepType | null; next_step_due_at: string | null; next_step_note: string | null }) => void;
  onClear: () => void;
  busy?: boolean;
}) {
  const [t, setT] = useState<NextStepType | "">(((type ?? "") as NextStepType | ""));
  const [due, setDue] = useState<string>(toLocalInput(dueAt));
  const [n, setN] = useState<string>(note ?? "");

  useEffect(() => { setT((type ?? "") as NextStepType | ""); setDue(toLocalInput(dueAt)); setN(note ?? ""); }, [type, dueAt, note]);

  const quick = (offset: { d?: number; h?: number; m?: number; setHour?: number }) => {
    const base = new Date();
    if (offset.d) base.setDate(base.getDate() + offset.d);
    if (offset.setHour !== undefined) { base.setHours(offset.setHour, offset.m ?? 0, 0, 0); }
    setDue(toLocalInput(base.toISOString()));
  };

  const handleSave = () => {
    onSave({
      next_step_type: t ? t : null,
      next_step_due_at: due ? new Date(due).toISOString() : null,
      next_step_note: n.trim() || null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Típus</Label>
          <Select value={t} onValueChange={(v) => setT(v as NextStepType)}>
            <SelectTrigger><SelectValue placeholder="Válassz típust…" /></SelectTrigger>
            <SelectContent>
              {NEXT_STEP_TYPES.map((s) => (
                <SelectItem key={s} value={s}>{NEXT_STEP_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Esedékesség</Label>
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 text-xs">
        <Button type="button" size="sm" variant="outline" onClick={() => quick({ setHour: 16 })}>Ma 16:00</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => quick({ d: 1, setHour: 9 })}>Holnap 9:00</Button>
        <Button type="button" size="sm" variant="outline" onClick={() => quick({ d: 3, setHour: 9 })}>+3 nap</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setDue("")}>Töröl időt</Button>
      </div>
      <div className="space-y-1.5">
        <Label>Jegyzet</Label>
        <Textarea rows={2} value={n} onChange={(e) => setN(e.target.value)} placeholder="Mit beszéltetek meg?" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClear} disabled={busy}>Lépés törlése</Button>
        <Button onClick={handleSave} disabled={busy}>{busy ? "Mentés…" : "Mentés"}</Button>
      </div>
    </div>
  );
}
