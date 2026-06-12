import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useCreateLeadFollowup } from "./use-lead-mutations";

function defaultTomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  // datetime-local input expects YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FollowupQuickForm({
  lead, onDone,
}: {
  lead: { id: string; company_id: string | null } | null;
  onDone?: () => void;
}) {
  const [type, setType] = useState("call");
  const [due, setDue] = useState<string>(defaultTomorrowLocal());
  const [note, setNote] = useState("");
  const create = useCreateLeadFollowup(lead);

  async function submit() {
    if (!lead || !due) return;
    await create.mutateAsync({
      followup_type: type,
      due_date: new Date(due).toISOString(),
      result: note || undefined,
    });
    setNote("");
    onDone?.();
  }

  const disabled = !lead || !lead.company_id || create.isPending;

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Gyors utókövetés</div>
      {!lead?.company_id && (
        <div className="rounded border border-dashed p-2 text-[11px] text-muted-foreground">
          A leadhez nincs cég rendelve — kötelező a céges hozzárendelés. Nyisd meg a teljes oldalt a hozzárendeléshez.
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={disabled}
          className="h-8 rounded-md border bg-background px-2 text-xs"
        >
          <option value="call">Telefon</option>
          <option value="email">E-mail</option>
          <option value="meeting">Találkozó</option>
          <option value="other">Egyéb</option>
        </select>
        <Input
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          disabled={disabled}
          className="h-8 text-xs"
        />
      </div>
      <Textarea
        placeholder="Jegyzet (opcionális)…"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        disabled={disabled}
        className="text-xs"
      />
      <Button size="sm" onClick={submit} disabled={disabled} className="w-full">
        {create.isPending ? "Mentés…" : "Utókövetés rögzítése"}
      </Button>
    </div>
  );
}