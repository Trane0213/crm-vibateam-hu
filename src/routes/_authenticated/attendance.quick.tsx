import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Zap } from "lucide-react";
import {
  listWorkers, listProjects, createProject, createEntriesBatch,
} from "@/lib/attendance/attendance.functions";

export const Route = createFileRoute("/_authenticated/attendance/quick")({
  component: AttendanceQuick,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gyors rögzítés — egy dolgozó → Mentés → következő dolgozó.
 * A projekt és a dátum a mentés után is kiválasztva marad,
 * csak a dolgozó mező ürül. A már rögzített dolgozók a session
 * alatt szürkén jelennek meg, hogy ne lehessen kétszer felvinni.
 */
function AttendanceQuick() {
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
  const [workerId, setWorkerId] = useState<string>("");
  const [dailyRate, setDailyRate] = useState<number>(0);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [note, setNote] = useState("");
  const [recorded, setRecorded] = useState<string[]>([]);
  const workerTriggerRef = useRef<HTMLButtonElement>(null);

  const workers = workersQ.data?.rows ?? [];
  const projects = projectsQ.data?.rows ?? [];

  const activeWorkers = useMemo(
    () => (workers as any[]).filter((w) => w.is_active !== false),
    [workers],
  );

  function pickWorker(id: string) {
    setWorkerId(id);
    const w = (workers as any[]).find((x) => x.id === id);
    if (w) setDailyRate(Number(w.daily_rate ?? 0));
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
      if (!workerId) throw new Error("Válassz dolgozót.");
      return batchFn({
        data: {
          workDate,
          projectId,
          overwriteExisting: overwrite,
          entries: [{
            workerId,
            dailyRate: Number(dailyRate) || 0,
            startTime: startTime || null,
            endTime: endTime || null,
            note: note || null,
          }],
        },
      });
    },
    onSuccess: (res: any) => {
      const savedId = workerId;
      if (res.inserted + res.updated > 0) {
        const name = (workers as any[]).find((w) => w.id === savedId)?.full_name ?? "Dolgozó";
        toast.success(`${name} rögzítve`);
        setRecorded((prev) => (prev.includes(savedId) ? prev : [...prev, savedId]));
      } else if (res.skipped?.length) {
        toast.warning("Már létezik erre a napra — kapcsold be a felülírást.");
      }
      // Projekt és dátum marad, csak a dolgozó mezők ürülnek.
      setWorkerId("");
      setStartTime("");
      setEndTime("");
      setNote("");
      setDailyRate(0);
      qc.invalidateQueries({ queryKey: ["att", "entries"] });
      // Fókusz vissza a dolgozó választóra a gyors sorozat kedvéért.
      setTimeout(() => workerTriggerRef.current?.focus(), 50);
    },
    onError: (e: any) => toast.error(e.message ?? "Sikertelen mentés"),
  });

  const canSave = !!projectId && !!workerId && !submit.isPending;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
        Válassz projektet és dátumot egyszer — mentés után csak a dolgozót kell
        cserélni. Enter = Rögzítés.
      </div>

      <div className="grid gap-3 md:grid-cols-2">
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

      <div className="rounded-md border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Dolgozó</div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(v === true)} />
            Felülírás, ha már létezik
          </label>
        </div>

        <Select value={workerId} onValueChange={pickWorker}>
          <SelectTrigger ref={workerTriggerRef}>
            <SelectValue placeholder="Válassz dolgozót" />
          </SelectTrigger>
          <SelectContent>
            {activeWorkers.map((w: any) => {
              const done = recorded.includes(w.id);
              return (
                <SelectItem key={w.id} value={w.id}>
                  {w.full_name}{done ? "  ✓ rögzítve" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <Label>Napidíj (Ft)</Label>
            <Input
              type="number"
              value={dailyRate}
              onChange={(e) => setDailyRate(Number(e.target.value))}
            />
          </div>
          <div>
            <Label>Kezdés</Label>
            <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </div>
          <div>
            <Label>Vég</Label>
            <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Megjegyzés</Label>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && canSave) {
                e.preventDefault();
                submit.mutate();
              }
            }}
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            Ebben a session-ben rögzítve:{" "}
            <span className="font-medium text-foreground">{recorded.length}</span> dolgozó
          </div>
          <Button
            className="ml-auto"
            disabled={!canSave}
            onClick={() => submit.mutate()}
          >
            <Zap className="h-4 w-4 mr-1" />
            Rögzítés
          </Button>
        </div>
      </div>

      {recorded.length > 0 && (
        <div className="text-xs text-muted-foreground">
          Mai session: {recorded
            .map((id) => (workers as any[]).find((w) => w.id === id)?.full_name)
            .filter(Boolean)
            .join(", ")}
        </div>
      )}
    </div>
  );
}