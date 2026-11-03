import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { formatDateTime } from "@/lib/format";
import { allowedNextStatuses, canScheduleQuoteFollowup, quoteStatusLabel, QUOTE_STATUS_LABEL, type QuoteStatus } from "@/lib/quotes/quote-status";
import { buildDueAt, splitDueAt } from "@/lib/sales/next-step-input";

type Props = { quote: { id: string; status: string | null; sent_at?: string | null; lead_id: string | null } };

/** S5: ajánlat állapota + egyetlen nyitott utánkövetés (a meglévő followups / Következő lépés rendszerben). */
export function QuoteStatusPanel({ quote }: Props) {
  const qc = useQueryClient();
  const next = allowedNextStatuses(quote.status, quote.sent_at);
  const [target, setTarget] = useState<string>("");

  const fu = useQuery({
    queryKey: ["followups", "quote", quote.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("followups")
        .select("id,due_date,followup_type,result,completed,assigned_to")
        .eq("quote_id", quote.id).order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });
  const open = fu.data?.find((f) => !f.completed) ?? null;

  const [date, setDate] = useState(""); const [time, setTime] = useState("");
  const [type, setType] = useState<"phone" | "email">("phone"); const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const p = splitDueAt(open.due_date);
    setDate(p.date); setTime(p.time);
    if (open.followup_type === "email" || open.followup_type === "phone") setType(open.followup_type);
    setNote(open.result ?? "");
  }, [open?.id, open?.due_date]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["pipeline"] });
  };

  const setStatus = useMutation({
    mutationFn: async (s: string) => {
      const { data, error } = await supabase.from("quotes").update({ status: s }).eq("id", quote.id).select("id");
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error("Az ajánlat állapota nem módosítható (nincs jogosultság).");
    },
    onSuccess: () => { toast.success("Állapot mentve"); setTarget(""); invalidate(); },
    onError: (e) => toast.error(humanizeSupabaseError(e)),
  });

  const schedule = useMutation({
    mutationFn: async () => {
      const due = buildDueAt(date, time);
      if (!due) throw new Error("Add meg az utánkövetés dátumát és időpontját.");
      const { error } = await (supabase.rpc as any)("quote_schedule_followup", { p_quote_id: quote.id, p_due: due, p_type: type, p_note: note.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { setErr(null); toast.success("Utánkövetés mentve — a felelős „Ma” oldalán jelenik meg"); invalidate(); },
    onError: (e) => setErr(e instanceof Error && !("code" in e) ? e.message : humanizeSupabaseError(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold">Állapot és utánkövetés</h2>
        <Badge variant="secondary">{quoteStatusLabel(quote.status)}</Badge>
      </div>
      {next.length > 0 ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label>Állapot módosítása</Label>
            <Select value={target} onValueChange={setTarget}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Válassz állapotot" /></SelectTrigger>
              <SelectContent>
                {next.map((s) => <SelectItem key={s} value={s}>{QUOTE_STATUS_LABEL[s as QuoteStatus]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={!target || setStatus.isPending} onClick={() => setStatus.mutate(target)}>Állapot mentése</Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Lezárt ajánlat — az állapota nem módosítható.</p>
      )}
      {!quote.sent_at && (
        <p className="text-xs text-muted-foreground">„Kiküldött” állapot csak sikeres kiküldés vagy Gmail-levél hozzákapcsolása után lesz. A megrendelő által elutasított ajánlat és a VIBA által vállalhatatlannak ítélt ajánlatkérés (ügy elvesztése) külön kezelendő.</p>
      )}

      {canScheduleQuoteFollowup(quote.status) && (
        <div className="rounded-md border p-3">
          <div className="mb-2 text-xs font-medium">{open ? "Nyitott utánkövetés módosítása" : "Következő kapcsolatfelvétel"}</div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="grid gap-1.5"><Label htmlFor="qf-date">Dátum</Label><Input id="qf-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="grid gap-1.5"><Label htmlFor="qf-time">Időpont</Label><Input id="qf-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div className="grid gap-1.5">
              <Label>Mód</Label>
              <Select value={type} onValueChange={(v) => setType(v as "phone" | "email")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="phone">Telefon</SelectItem><SelectItem value="email">E-mail</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5 sm:col-span-4"><Label htmlFor="qf-note">Jegyzet</Label><Textarea id="qf-note" rows={2} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
          <Button size="sm" className="mt-3" disabled={schedule.isPending} onClick={() => schedule.mutate()}>Utánkövetés mentése</Button>
        </div>
      )}

      {(fu.data?.length ?? 0) > 0 && (
        <div className="text-xs">
          <div className="mb-1 font-medium">Előzmények</div>
          <ul className="space-y-1">
            {fu.data!.map((f) => (
              <li key={f.id} className="flex flex-wrap gap-2 text-muted-foreground">
                <span>{formatDateTime(f.due_date)}</span>
                <span>{f.followup_type === "email" ? "E-mail" : "Telefon"}</span>
                <span>{f.completed ? "teljesítve" : "nyitott"}</span>
                {f.result && <span className="text-foreground">{f.result}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
