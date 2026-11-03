import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NEXT_STEP_TYPES, NEXT_STEP_LABEL, type NextStepType } from "@/lib/sales/constants";
import { buildNextStepPayload, splitIsoToLocal, NEXT_STEP_INCOMPLETE_MSG } from "@/lib/sales/next-step-input";

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
  const [date, setDate] = useState<string>(splitIsoToLocal(dueAt).date);
  const [time, setTime] = useState<string>(splitIsoToLocal(dueAt).time);
  const [n, setN] = useState<string>(note ?? "");
  const [error, setError] = useState<string | null>(null);

  // Mentés/refetch után a mezők pontosan a szerveren tárolt értéket mutatják.
  useEffect(() => {
    const s = splitIsoToLocal(dueAt);
    setT((type ?? "") as NextStepType | "");
    setDate(s.date);
    setTime(s.time);
    setN(note ?? "");
    setError(null);
  }, [type, dueAt, note]);

  const handleSave = () => {
    const payload = buildNextStepPayload(t, date, time, n);
    if (!payload) {
      setError(NEXT_STEP_INCOMPLETE_MSG);
      return;
    }
    setError(null);
    onSave({ ...payload, next_step_type: payload.next_step_type as NextStepType });
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Típus</Label>
        <Select value={t} onValueChange={(v) => { setT(v as NextStepType); setError(null); }}>
          <SelectTrigger><SelectValue placeholder="Válassz típust…" /></SelectTrigger>
          <SelectContent>
            {NEXT_STEP_TYPES.map((s) => (
              <SelectItem key={s} value={s}>{NEXT_STEP_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="next-step-date">Dátum</Label>
          <Input id="next-step-date" type="date" required value={date} onChange={(e) => { setDate(e.target.value); setError(null); }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="next-step-time">Időpont</Label>
          <Input id="next-step-time" type="time" required value={time} onChange={(e) => { setTime(e.target.value); setError(null); }} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Jegyzet</Label>
        <Textarea rows={2} value={n} onChange={(e) => setN(e.target.value)} placeholder="Mit beszéltetek meg?" />
      </div>
      {error && <div role="alert" className="text-xs text-destructive">{error}</div>}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onClear} disabled={busy}>Lépés törlése</Button>
        <Button onClick={handleSave} disabled={busy}>{busy ? "Mentés…" : "Mentés"}</Button>
      </div>
    </div>
  );
}
