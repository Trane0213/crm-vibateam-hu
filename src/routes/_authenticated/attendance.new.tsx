import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Save } from "lucide-react";
import {
  listWorkers,
  listProjects,
  createProject,
  createEntriesBatch,
} from "@/lib/attendance/attendance.functions";

export const Route = createFileRoute("/_authenticated/attendance/new")({
  component: AttendanceNew,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type RowState = {
  selected: boolean;
  dailyRate: number;
  startTime: string;
  endTime: string;
  note: string;
};

function AttendanceNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const workersFn = useServerFn(listWorkers);
  const projectsFn = useServerFn(listProjects);
  const createProjectFn = useServerFn(createProject);
  const batchFn = useServerFn(createEntriesBatch);

  const workersQ = useQuery({ queryKey: ["att", "workers"], queryFn: () => workersFn() });
  const projectsQ = useQuery({ queryKey: ["att", "projects"], queryFn: () => projectsFn() });

  const [workDate, setWorkDate] = useState(todayISO());
  const [projectId, setProjectId] = useState<string>("");
  const [overwrite, setOverwrite] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Record<string, RowState>>({});

  const workers = workersQ.data?.rows ?? [];
  const projects = projectsQ.data?.rows ?? [];

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const list = (workers as any[]).filter((w) => w.is_active !== false);
    if (!s) return list;
    return list.filter((w) => (w.full_name as string).toLowerCase().includes(s));
  }, [workers, search]);

  function rowFor(w: any): RowState {
    return (
      rows[w.id] ?? {
        selected: false,
        dailyRate: Number(w.daily_rate ?? 0),
        startTime: "",
        endTime: "",
        note: "",
      }
    );
  }
  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => {
      const cur = prev[id] ?? {
        selected: false,
        dailyRate: 0,
        startTime: "",
        endTime: "",
        note: "",
      };
      return { ...prev, [id]: { ...cur, ...patch } };
    });
  }
  function toggleAll(next: boolean) {
    const patch: Record<string, RowState> = {};
    for (const w of filtered) {
      const cur = rowFor(w);
      patch[w.id] = { ...cur, selected: next };
    }
    setRows((prev) => ({ ...prev, ...patch }));
  }

  const createProj = useMutation({
    mutationFn: (name: string) => createProjectFn({ data: { name } }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["att", "projects"] });
      setProjectId(res.row.id);
      setNewProjectName("");
      toast.success(res.created ? "Projekt létrehozva" : "Projekt már létezik, kiválasztva");
    },
    onError: (e: any) => toast.error(e.message ?? "Sikertelen"),
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Válassz projektet.");
      const entries = Object.entries(rows)
        .filter(([, r]) => r.selected)
        .map(([workerId, r]) => ({
          workerId,
          dailyRate: Number(r.dailyRate) || 0,
          startTime: r.startTime || null,
          endTime: r.endTime || null,
          note: r.note || null,
        }));
      if (entries.length === 0) throw new Error("Legalább egy dolgozót válassz.");
      return batchFn({
        data: { workDate, projectId, overwriteExisting: overwrite, entries },
      });
    },
    onSuccess: (res: any) => {
      toast.success(
        `Rögzítve: ${res.inserted} új, ${res.updated} frissítve` +
          (res.skipped?.length ? ` — ${res.skipped.length} kihagyva (már létezik)` : ""),
      );
      qc.invalidateQueries({ queryKey: ["att", "entries"] });
      navigate({ to: "/attendance" });
    },
    onError: (e: any) => toast.error(e.message ?? "Sikertelen mentés"),
  });

  const selectedCount = Object.values(rows).filter((r) => r.selected).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <Label>Dátum</Label>
          <Input type="date" value={workDate} onChange={(e) => setWorkDate(e.target.value)} />
        </div>
        <div>
          <Label>Projekt</Label>
          <Select value={projectId} onValueChange={setProjectId}>
            <SelectTrigger><SelectValue placeholder="Válassz projektet" /></SelectTrigger>
            <SelectContent>
              {(projects as any[])
                .filter((p) => p.is_active !== false)
                .map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Új projekt (opcionális)</Label>
          <div className="flex gap-2">
            <Input
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="pl. Árnyas utca"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={!newProjectName.trim() || createProj.isPending}
              onClick={() => createProj.mutate(newProjectName)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 pt-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Dolgozó keresése…"
          className="max-w-xs"
        />
        <Button size="sm" variant="ghost" onClick={() => toggleAll(true)}>Mind kijelöl</Button>
        <Button size="sm" variant="ghost" onClick={() => toggleAll(false)}>Kijelölés törlése</Button>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
          Meglévő nap felülírása
        </label>
      </div>

      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="w-10 p-2"></th>
              <th className="p-2 text-left">Dolgozó</th>
              <th className="p-2 text-left w-32">Napidíj (Ft)</th>
              <th className="p-2 text-left w-24">Kezdés</th>
              <th className="p-2 text-left w-24">Vég</th>
              <th className="p-2 text-left">Megjegyzés</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((w: any) => {
              const r = rowFor(w);
              return (
                <tr key={w.id} className="border-t">
                  <td className="p-2 text-center">
                    <Checkbox
                      checked={r.selected}
                      onCheckedChange={(v) => setRow(w.id, { selected: v === true })}
                    />
                  </td>
                  <td className="p-2">{w.full_name}</td>
                  <td className="p-2">
                    <Input
                      type="number"
                      value={r.dailyRate}
                      onChange={(e) => setRow(w.id, { dailyRate: Number(e.target.value) })}
                      className="h-8"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={r.startTime}
                      onChange={(e) => setRow(w.id, { startTime: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      type="time"
                      value={r.endTime}
                      onChange={(e) => setRow(w.id, { endTime: e.target.value })}
                      className="h-8"
                    />
                  </td>
                  <td className="p-2">
                    <Textarea
                      value={r.note}
                      onChange={(e) => setRow(w.id, { note: e.target.value })}
                      rows={1}
                      className="min-h-[2.25rem]"
                    />
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-sm text-muted-foreground">
                  Nincs dolgozó. Vegyél fel újat a „Dolgozók / projektek” fülön.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">
          Kijelölve: <span className="font-medium text-foreground">{selectedCount}</span> dolgozó
        </div>
        <Button
          className="ml-auto"
          disabled={submit.isPending || selectedCount === 0 || !projectId}
          onClick={() => submit.mutate()}
        >
          <Save className="h-4 w-4 mr-1" />
          Rögzítés ({selectedCount})
        </Button>
      </div>
    </div>
  );
}