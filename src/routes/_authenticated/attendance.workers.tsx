import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Save, Plus } from "lucide-react";
import {
  listWorkers,
  upsertWorker,
  listProjects,
  createProject,
} from "@/lib/attendance/attendance.functions";

export const Route = createFileRoute("/_authenticated/attendance/workers")({
  component: AttendanceWorkers,
});

function AttendanceWorkers() {
  const qc = useQueryClient();
  const workersFn = useServerFn(listWorkers);
  const saveFn = useServerFn(upsertWorker);
  const projectsFn = useServerFn(listProjects);
  const createProjFn = useServerFn(createProject);

  const workersQ = useQuery({ queryKey: ["att", "workers"], queryFn: () => workersFn() });
  const projectsQ = useQuery({ queryKey: ["att", "projects"], queryFn: () => projectsFn() });

  const [draft, setDraft] = useState<{
    id?: string;
    full_name: string;
    daily_rate: number;
    default_transport_fee: number;
    is_active: boolean;
    note: string;
  }>({ full_name: "", daily_rate: 0, default_transport_fee: 0, is_active: true, note: "" });
  const [newProject, setNewProject] = useState("");

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: draft.id,
          full_name: draft.full_name,
          daily_rate: Number(draft.daily_rate) || 0,
          default_transport_fee: Number(draft.default_transport_fee) || 0,
          is_active: draft.is_active,
          note: draft.note || null,
        },
      }),
    onSuccess: () => {
      toast.success("Mentve");
      qc.invalidateQueries({ queryKey: ["att", "workers"] });
      setDraft({ full_name: "", daily_rate: 0, default_transport_fee: 0, is_active: true, note: "" });
    },
    onError: (e: any) => toast.error(e.message ?? "Sikertelen"),
  });

  const createProj = useMutation({
    mutationFn: (name: string) => createProjFn({ data: { name } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["att", "projects"] });
      setNewProject("");
      toast.success(res.created ? "Projekt létrehozva" : "Már létezik");
    },
    onError: (e: any) => toast.error(e.message ?? "Sikertelen"),
  });

  const workers = workersQ.data?.rows ?? [];
  const projects = projectsQ.data?.rows ?? [];

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Dolgozók</h2>
        <div className="rounded-md border p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Név</Label>
              <Input value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} />
            </div>
            <div>
              <Label>Napidíj (Ft)</Label>
              <Input
                type="number"
                value={draft.daily_rate}
                onChange={(e) => setDraft({ ...draft, daily_rate: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Alap útiköltség (Ft)</Label>
              <Input
                type="number"
                value={draft.default_transport_fee}
                onChange={(e) => setDraft({ ...draft, default_transport_fee: Number(e.target.value) })}
              />
            </div>
            <div className="col-span-2">
              <Label>Megjegyzés</Label>
              <Textarea value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} rows={2} />
            </div>
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <Checkbox
                checked={draft.is_active}
                onCheckedChange={(v) => setDraft({ ...draft, is_active: v === true })}
              />
              Aktív
            </label>
          </div>
          <div className="flex justify-end gap-2">
            {draft.id && (
              <Button
                variant="ghost"
                onClick={() =>
                  setDraft({ full_name: "", daily_rate: 0, default_transport_fee: 0, is_active: true, note: "" })
                }
              >
                Mégse
              </Button>
            )}
            <Button disabled={!draft.full_name.trim() || save.isPending} onClick={() => save.mutate()}>
              <Save className="h-4 w-4 mr-1" /> {draft.id ? "Mentés" : "Új dolgozó"}
            </Button>
          </div>
        </div>

        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Név</th>
                <th className="p-2 text-right">Napidíj</th>
                <th className="p-2 text-right">Útiköltség</th>
                <th className="p-2 text-center">Aktív</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {(workers as any[]).map((w) => (
                <tr key={w.id} className="border-t">
                  <td className="p-2">{w.full_name}</td>
                  <td className="p-2 text-right">{Number(w.daily_rate).toLocaleString("hu-HU")}</td>
                  <td className="p-2 text-right">{Number(w.default_transport_fee).toLocaleString("hu-HU")}</td>
                  <td className="p-2 text-center">{w.is_active ? "✓" : "—"}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setDraft({
                          id: w.id,
                          full_name: w.full_name,
                          daily_rate: Number(w.daily_rate),
                          default_transport_fee: Number(w.default_transport_fee),
                          is_active: w.is_active,
                          note: w.note ?? "",
                        })
                      }
                    >
                      Szerkeszt
                    </Button>
                  </td>
                </tr>
              ))}
              {workers.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">Nincs dolgozó.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase text-muted-foreground">Projektek</h2>
        <div className="rounded-md border p-4">
          <Label>Új projekt neve</Label>
          <div className="flex gap-2 mt-1">
            <Input value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="pl. Szabolcs utca" />
            <Button
              disabled={!newProject.trim() || createProj.isPending}
              onClick={() => createProj.mutate(newProject)}
            >
              <Plus className="h-4 w-4 mr-1" /> Hozzáadás
            </Button>
          </div>
        </div>
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-2 text-left">Név</th>
                <th className="p-2 text-center">Aktív</th>
              </tr>
            </thead>
            <tbody>
              {(projects as any[]).map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-2">{p.name}</td>
                  <td className="p-2 text-center">{p.is_active ? "✓" : "—"}</td>
                </tr>
              ))}
              {projects.length === 0 && (
                <tr><td colSpan={2} className="p-6 text-center text-muted-foreground">Nincs projekt.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}