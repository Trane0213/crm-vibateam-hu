import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Briefcase, Link2, Unlink, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { humanizeSupabaseError } from "@/lib/db-hooks";
import { toast } from "sonner";

export function EmailThreadProjectPicker({
  threadId,
  variant = "card",
}: {
  threadId: string;
  variant?: "card" | "chip";
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const thread = useQuery({
    queryKey: ["email_threads", "project_picker", threadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads").select("id,project_id").eq("id", threadId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const current = useQuery({
    queryKey: ["projects", "for_email_thread", thread.data?.project_id],
    enabled: !!thread.data?.project_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("id,title,name").eq("id", thread.data!.project_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const projects = useQuery({
    queryKey: ["projects", "picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("id,title,status,address").order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = projects.data ?? [];
    if (!needle) return list;
    return list.filter((p: any) =>
      (p.title ?? "").toLowerCase().includes(needle) ||
      (p.address ?? "").toLowerCase().includes(needle),
    );
  }, [q, projects.data]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["email_threads"] });
    qc.invalidateQueries({ queryKey: ["email_thread_crm"] });
  };

  const setProject = useMutation({
    mutationFn: async (projectId: string | null) => {
      const { error } = await supabase.from("email_threads").update({ project_id: projectId }).eq("id", threadId);
      if (error) throw error;
    },
    onSuccess: (_d, projectId) => {
      invalidate();
      toast.success(projectId ? "Projekthez rendelve" : "Leválasztva");
      setOpen(false);
    },
    onError: (e: any) => toast.error("Sikertelen", { description: humanizeSupabaseError(e) }),
  });

  const cur = current.data;

  if (variant === "chip") {
    const label = cur ? ((cur as any).title ?? (cur as any).name ?? "—") : null;
    return (
      <div className="flex items-center gap-1">
        {cur ? (
          <>
            <Link
              to="/projects/$id"
              params={{ id: (cur as any).id }}
              className="inline-flex items-center gap-1 max-w-[260px] rounded-md bg-primary/10 px-2 py-1 text-[12px] font-medium text-primary hover:bg-primary/15"
              title={label ?? undefined}
            >
              <Briefcase className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </Link>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] text-muted-foreground">Csere</Button>
              </DialogTrigger>
              <PickerBody q={q} setQ={setQ} filtered={filtered} loading={projects.isLoading} onPick={(id) => setProject.mutate(id)} />
            </Dialog>
            <Button size="sm" variant="ghost" className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => setProject.mutate(null)} title="Leválasztás">
              <Unlink className="h-3.5 w-3.5" />
            </Button>
          </>
        ) : (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-[12px]">
                <Link2 className="mr-1.5 h-3.5 w-3.5" />
                Projekthez rendelés
              </Button>
            </DialogTrigger>
            <PickerBody q={q} setQ={setQ} filtered={filtered} loading={projects.isLoading} onPick={(id) => setProject.mutate(id)} />
          </Dialog>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        <Briefcase className="h-3 w-3" />Projekt
      </div>
      {cur ? (
        <div className="space-y-2">
          <Link to="/projects/$id" params={{ id: cur.id }} className="block text-sm font-medium text-primary hover:underline truncate">
            {(cur as any).title ?? (cur as any).name ?? "—"}
          </Link>
          <div className="flex gap-1.5">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"><Link2 className="mr-1 h-3 w-3" />Csere</Button>
              </DialogTrigger>
              <PickerBody q={q} setQ={setQ} filtered={filtered} loading={projects.isLoading} onPick={(id) => setProject.mutate(id)} />
            </Dialog>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => setProject.mutate(null)}>
              <Unlink className="mr-1 h-3 w-3" />Leválasztás
            </Button>
          </div>
        </div>
      ) : (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="w-full"><Link2 className="mr-1.5 h-3.5 w-3.5" />Hozzárendelés projekthez</Button>
          </DialogTrigger>
          <PickerBody q={q} setQ={setQ} filtered={filtered} loading={projects.isLoading} onPick={(id) => setProject.mutate(id)} />
        </Dialog>
      )}
    </div>
  );
}

function PickerBody({
  q, setQ, filtered, loading, onPick,
}: { q: string; setQ: (s: string) => void; filtered: any[]; loading: boolean; onPick: (id: string) => void }) {
  return (
    <DialogContent className="sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>Projekt választása</DialogTitle>
        <DialogDescription>Kattints a projektre a hozzárendeléshez.</DialogDescription>
      </DialogHeader>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-8" placeholder="Keresés…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="max-h-[50vh] overflow-y-auto rounded-md border">
        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Betöltés…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nincs találat.</div>
        ) : (
          <ul className="divide-y">
            {filtered.slice(0, 100).map((p: any) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p.id)} className="w-full text-left p-3 hover:bg-muted/40 transition">
                  <div className="text-sm font-medium truncate">{p.title ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">{[p.status, p.address].filter(Boolean).join(" · ")}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <DialogFooter><div /></DialogFooter>
    </DialogContent>
  );
}