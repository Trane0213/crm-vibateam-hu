import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Ban, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { logActivity } from "@/lib/activity-log";
import { quoteDiscardOptions } from "@/lib/quotes/quote-status";

type Q = { id: string; status: string | null; sent_at?: string | null; locked_at?: string | null; lead_id: string | null };

/** Kiküldés előtti „Visszavonás” (állapot) és „Törlés” (adatbázis-függvény) — a kiküldött ajánlat érintetlen marad. */
export function QuoteDiscardActions({ quote }: { quote: Q }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const inWorkspace = useLocation({ select: (l) => l.pathname.startsWith("/munka") });
  const { canWithdraw, canDelete } = quoteDiscardOptions(quote);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["quotes"] });
    qc.invalidateQueries({ queryKey: ["followups"] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["pipeline"] });
  };

  const withdraw = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("quotes").update({ status: "withdrawn" }).eq("id", quote.id).select("id");
      if (error) throw error;
      if (!data || data.length !== 1) throw new Error("Az ajánlat nem vonható vissza (nincs jogosultság).");
      logActivity("quotes", "status_change", quote.id, { status: "withdrawn" });
    },
    onSuccess: () => { toast.success("Ajánlat visszavonva", { description: "A dokumentumok megmaradnak, az ajánlat lezárt állapotú." }); refresh(); },
    onError: (e) => toast.error("Visszavonás nem sikerült", { description: humanizeSupabaseError(e) }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("quote_discard_unsent", { p_quote_id: quote.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Ajánlat törölve");
      refresh();
      if (inWorkspace) navigate({ to: "/munka/sales/ajanlatok" });
      else navigate({ to: "/quotes" });
    },
    onError: (e) => toast.error("Törlés nem sikerült", { description: humanizeSupabaseError(e) }),
  });

  if (!canWithdraw && !canDelete) return null;
  const busy = withdraw.isPending || remove.isPending;
  return (
    <>
      {canWithdraw && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" disabled={busy}><Ban className="mr-1.5 h-4 w-4" />Visszavonás</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Visszavonod az ajánlatot?</AlertDialogTitle>
              <AlertDialogDescription>
                Az ajánlat „Visszavont” állapotba kerül, és nem küldhető ki. A feltöltött dokumentumok és az előzmények megmaradnak,
                a nyitott utánkövetése lezárul. Ez nem vonható vissza; ha mégis kell, készíts új ajánlatot vagy verziót.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Mégse</AlertDialogCancel>
              <AlertDialogAction onClick={() => withdraw.mutate()}>Visszavonás</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canDelete && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" disabled={busy}><Trash2 className="mr-1.5 h-4 w-4" />Törlés</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Végleg törlöd az ajánlatot?</AlertDialogTitle>
              <AlertDialogDescription>
                Csak még ki nem küldött ajánlat törölhető. Ha dokumentum, tervcsomag vagy utánkövetés tartozik hozzá,
                a törlés nem engedélyezett — ilyenkor használd a „Visszavonás” gombot, így egy fájl sem vész el.
                Ha ez egy újabb verzió volt, az előző verzió lesz újra az aktuális.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Mégse</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove.mutate()}>Végleges törlés</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  );
}
