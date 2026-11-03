import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CopyPlus, GitBranch, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { formatDateTime } from "@/lib/format";

type Q = { id: string; group_id: string; alternative_key: string; alternative_label: string | null; version: number | null; is_current: boolean | null; status: string | null; locked_at: string | null; title: string | null };

/** S3: verziók és alternatívák egy üzleti ajánlaton belül; műveletek egy-egy DB-tranzakcióban. */
export function QuoteVersionsBar({ quote }: { quote: Q }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dlg, setDlg] = useState<null | "version" | "alt" | "lock">(null);
  const [label, setLabel] = useState("");

  const group = useQuery({
    queryKey: ["quotes", "group", quote.group_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quotes" as any)
        .select("id,group_id,alternative_key,alternative_label,version,is_current,status,locked_at,title")
        .eq("group_id", quote.group_id).order("alternative_key").order("version");
      if (error) throw error;
      return (data ?? []) as unknown as Q[];
    },
  });

  const run = useMutation({
    mutationFn: async (kind: "version" | "alt" | "lock") => {
      const fn = kind === "version" ? "quote_new_version" : kind === "alt" ? "quote_new_alternative" : "quote_lock_sent";
      const args: any = kind === "alt" ? { p_quote_id: quote.id, p_label: label } : { p_quote_id: quote.id };
      const { data, error } = await supabase.rpc(fn as any, args);
      if (error) throw error;
      return { kind, id: data as unknown as string };
    },
    onSuccess: ({ kind, id }) => {
      qc.invalidateQueries({ queryKey: ["quotes"] });
      qc.invalidateQueries({ queryKey: ["quote_items"] });
      setDlg(null); setLabel("");
      if (kind === "lock") toast.success("Kiküldöttként rögzítve");
      else { toast.success(kind === "version" ? "Új verzió létrehozva" : "Új alternatíva létrehozva"); navigate({ to: "/quotes/$id", params: { id } }); }
    },
    onError: (e: any) => toast.error("A művelet nem sikerült — semmi nem változott", { description: humanizeSupabaseError(e) }),
  });

  const rows = group.data ?? [];
  const alts = Array.from(new Set(rows.map((r) => r.alternative_key)));

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Verziók és alternatívák</h2>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setDlg("version")}><CopyPlus className="mr-1.5 h-4 w-4" /> Új verzió</Button>
          <Button size="sm" variant="outline" onClick={() => setDlg("alt")}><GitBranch className="mr-1.5 h-4 w-4" /> Új alternatíva</Button>
          {!quote.locked_at && <Button size="sm" variant="outline" onClick={() => setDlg("lock")}><Lock className="mr-1.5 h-4 w-4" /> Kiküldöttként rögzítés</Button>}
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        {alts.map((k) => (
          <div key={k} className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="outline">{k} alternatíva{rows.find((r) => r.alternative_key === k && r.alternative_label)?.alternative_label ? ` – ${rows.find((r) => r.alternative_key === k && r.alternative_label)!.alternative_label}` : ""}</Badge>
            {rows.filter((r) => r.alternative_key === k).map((r) => (
              <Link key={r.id} to="/quotes/$id" params={{ id: r.id }}
                className={`rounded border px-2 py-0.5 text-xs ${r.id === quote.id ? "border-primary bg-primary/10 font-semibold" : "hover:bg-muted"}`}>
                v{r.version}{r.is_current ? " · aktuális" : ""}{r.locked_at ? " · kiküldve" : ""}
              </Link>
            ))}
          </div>
        ))}
      </div>
      {quote.locked_at && (
        <p className="mt-2 text-xs text-muted-foreground">Ez a verzió {formatDateTime(quote.locked_at)} óta kiküldöttként rögzített: tartalma nem módosítható, változtatáshoz készíts új verziót.</p>
      )}

      <AlertDialog open={!!dlg} onOpenChange={(o) => !o && setDlg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dlg === "version" ? "Új verzió" : dlg === "alt" ? "Új alternatíva" : "Kiküldöttként rögzítés"}</AlertDialogTitle>
            <AlertDialogDescription>
              {dlg === "version" && "Az új verzió átveszi az alapadatokat és a tételeket; a mostani verzió és fájljai változatlanul megmaradnak."}
              {dlg === "alt" && "Párhuzamos műszaki megoldás saját árral, fájlokkal és verziókkal. Az alapadatokat átveszi, tételeket nem."}
              {dlg === "lock" && "A rögzített verzió tartalma, tételei és kiküldött ajánlat fájljai többé nem módosíthatók/törölhetők. Ez nem vonható vissza."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dlg === "alt" && <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Megnevezés, pl. 2 db autótöltő" maxLength={120} aria-label="Alternatíva megnevezése" />}
          <AlertDialogFooter>
            <AlertDialogCancel>Mégse</AlertDialogCancel>
            <AlertDialogAction disabled={run.isPending} onClick={(e) => { e.preventDefault(); dlg && run.mutate(dlg); }}>Jóváhagyom</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
