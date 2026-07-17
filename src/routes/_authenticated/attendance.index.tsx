import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/page-header";
import { ClipboardList, Trash2, Plus } from "lucide-react";
import {
  listEntries,
  deleteEntry,
  listWorkers,
  listProjects,
} from "@/lib/attendance/attendance.functions";

export const Route = createFileRoute("/_authenticated/attendance/")({
  component: AttendanceIndex,
});

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function AttendanceIndex() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [workerId, setWorkerId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");

  const listFn = useServerFn(listEntries);
  const workersFn = useServerFn(listWorkers);
  const projectsFn = useServerFn(listProjects);
  const delFn = useServerFn(deleteEntry);

  const workersQ = useQuery({ queryKey: ["att", "workers"], queryFn: () => workersFn() });
  const projectsQ = useQuery({ queryKey: ["att", "projects"], queryFn: () => projectsFn() });
  const entriesQ = useQuery({
    queryKey: ["att", "entries", from, to, workerId, projectId],
    queryFn: () =>
      listFn({
        data: {
          from,
          to,
          workerId: workerId || undefined,
          projectId: projectId || undefined,
        },
      }),
  });

  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Törölve");
      qc.invalidateQueries({ queryKey: ["att", "entries"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Sikertelen törlés"),
  });

  const rows = entriesQ.data?.rows ?? [];
  const totalDays = rows.length;
  const totalPay = useMemo(
    () => rows.reduce((s: number, r: any) => s + Number(r.daily_rate ?? 0), 0),
    [rows],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Kezdet</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">Vég</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">Dolgozó</Label>
          <Select value={workerId || "all"} onValueChange={(v) => setWorkerId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Mindegyik" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mindegyik</SelectItem>
              {(workersQ.data?.rows ?? []).map((w: any) => (
                <SelectItem key={w.id} value={w.id}>{w.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Projekt</Label>
          <Select value={projectId || "all"} onValueChange={(v) => setProjectId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-56"><SelectValue placeholder="Mindegyik" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Mindegyik</SelectItem>
              {(projectsQ.data?.rows ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Button onClick={() => navigate({ to: "/attendance/new" })}>
            <Plus className="h-4 w-4 mr-1" /> Új rögzítés
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Napok</div>
          <div className="text-lg font-semibold">{totalDays}</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Napidíj összesen</div>
          <div className="text-lg font-semibold">{totalPay.toLocaleString("hu-HU")} Ft</div>
        </div>
        <div className="rounded-md border p-3">
          <div className="text-xs text-muted-foreground">Időszak</div>
          <div className="text-sm">{from} – {to}</div>
        </div>
      </div>

      {entriesQ.isLoading ? (
        <div className="text-sm text-muted-foreground">Betöltés…</div>
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nincs rögzített nap a szűrésre."
          description="Rögzíts új napot az „Új rögzítés" fülön."
          icon={ClipboardList}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dátum</TableHead>
                <TableHead>Dolgozó</TableHead>
                <TableHead>Projekt</TableHead>
                <TableHead>Napidíj</TableHead>
                <TableHead>Idő</TableHead>
                <TableHead>Megjegyzés</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.work_date}</TableCell>
                  <TableCell>{r.attendance_workers?.full_name ?? "—"}</TableCell>
                  <TableCell>{r.attendance_projects?.name ?? "—"}</TableCell>
                  <TableCell>{Number(r.daily_rate ?? 0).toLocaleString("hu-HU")} Ft</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.start_time ? `${r.start_time.slice(0, 5)}–${(r.end_time ?? "").slice(0, 5)}` : "—"}
                  </TableCell>
                  <TableCell className="max-w-[240px] truncate text-xs text-muted-foreground">{r.note ?? ""}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm("Biztosan törlöd ezt a napot?")) del.mutate(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}