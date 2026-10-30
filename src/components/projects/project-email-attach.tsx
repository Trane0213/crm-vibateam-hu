import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { RecordCombobox } from "@/components/resource/record-combobox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/page-header";
import { Mail, Link2, Unlink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { toast } from "sonner";

function useProjectThreads(projectId: string) {
  return useQuery({
    queryKey: ["email_threads", "by_project", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("id,subject,participants,last_message_at,project_id")
        .eq("project_id", projectId)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function ProjectEmailAttach({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const threads = useProjectThreads(projectId);

  const detach = useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase.from("email_threads").update({ project_id: null }).eq("id", threadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email_threads"] });
      toast.success("Szál leválasztva");
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <AttachDialog projectId={projectId} />
      </div>

      {threads.isLoading ? (
        <div className="text-sm text-muted-foreground">Betöltés…</div>
      ) : (threads.data ?? []).length === 0 ? (
        <EmptyState
          icon={Mail}
          title="Nincs email-szál ehhez a projekthez"
          description="Az „Email szál csatolása” gombbal rendelhetsz ide meglévő szálakat."
        />
      ) : (
        <div className="rounded-md border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Tárgy</th>
                <th className="px-3 py-2 text-left">Résztvevők</th>
                <th className="px-3 py-2 text-left">Utolsó üzenet</th>
                <th className="px-3 py-2 text-right">Művelet</th>
              </tr>
            </thead>
            <tbody>
              {(threads.data ?? []).map((t: any) => (
                <tr key={t.id} className="border-t hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Link to="/emails/$threadId" params={{ threadId: t.id }} className="text-primary hover:underline">
                      {t.subject || "(nincs tárgy)"}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[280px]">
                    {(t.participants ?? []).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{fmtDateTime(t.last_message_at)}</td>
                  <td className="px-3 py-2 text-right">
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => detach.mutate(t.id)} title="Leválasztás">
                      <Unlink className="mr-1 h-3.5 w-3.5" />Leválasztás
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AttachDialog({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const attach = useMutation({
    mutationFn: async (threadId: string) => {
      const { error } = await supabase.from("email_threads").update({ project_id: projectId }).eq("id", threadId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["email_threads"] });
      toast.success("Szál csatolva");
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Link2 className="mr-1.5 h-4 w-4" />Email szál csatolása</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Email szál csatolása projekthez</DialogTitle>
          <DialogDescription>Csak a még nem csatolt szálak láthatók. Kattints a sorra a hozzárendeléshez.</DialogDescription>
        </DialogHeader>
        <RecordCombobox source="email_threads" label="Email-szál" filters={{ project_id: null }} disabled={attach.isPending}
          onChange={(id) => attach.mutate(id, { onSuccess: () => setOpen(false) })} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bezárás</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}