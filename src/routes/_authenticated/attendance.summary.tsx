import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Save } from "lucide-react";
import { getPeriodSummary, upsertPeriodAdjustment } from "@/lib/attendance/attendance.functions";

export const Route = createFileRoute("/_authenticated/attendance/summary")({
  component: AttendanceSummary,
});

function monthStartISO() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0, 10);
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function fmtFt(n: number) {
  return `${Math.round(n).toLocaleString("hu-HU")} Ft`;
}

function AttendanceSummary() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const summaryFn = useServerFn(getPeriodSummary);
  const adjFn = useServerFn(upsertPeriodAdjustment);

  const q = useQuery({
    queryKey: ["att", "summary", from, to],
    queryFn: () => summaryFn({ data: { from, to } }),
  });

  const [edits, setEdits] = useState<Record<string, { advance?: number; transport_fee?: number }>>({});

  const save = useMutation({
    mutationFn: async (workerId: string) => {
      const e = edits[workerId] ?? {};
      const row = q.data?.rows.find((r) => r.worker_id === workerId);
      return adjFn({
        data: {
          worker_id: workerId,
          period_from: from,
          period_to: to,
          advance: e.advance ?? row?.advance ?? 0,
          transport_fee: e.transport_fee ?? row?.transport_fee ?? 0,
        },
      });
    },
    onSuccess: () => {
      toast.success("Módosítás mentve");
      qc.invalidateQueries({ queryKey: ["att", "summary"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Hiba"),
  });

  const rows = q.data?.rows ?? [];
  const totals = q.data?.totals ?? { days: 0, base_pay: 0, transport_fee: 0, advance: 0, total: 0 };

  const csvHref = useMemo(() => {
    const header = ["Dolgozó", "Napok", "Átlag napidíj", "Napok díja", "Útiköltség", "Előleg", "Kifizetendő"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        `"${r.worker_name.replace(/"/g, '""')}"`,
        r.days,
        Math.round(r.daily_rate),
        Math.round(r.base_pay),
        Math.round(r.transport_fee),
        Math.round(r.advance),
        Math.round(r.total),
      ].join(";"));
    }
    lines.push([
      `"Összesen"`, totals.days, "", Math.round(totals.base_pay),
      Math.round(totals.transport_fee), Math.round(totals.advance), Math.round(totals.total),
    ].join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [rows, totals]);

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
        <a href={csvHref} download={`jelenlet_${from}_${to}.csv`} className="ml-auto">
          <Button variant="secondary"><Download className="h-4 w-4 mr-1" /> CSV export</Button>
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Napok" value={String(totals.days)} />
        <Stat label="Napok díja" value={fmtFt(totals.base_pay)} />
        <Stat label="Útiköltség" value={fmtFt(totals.transport_fee)} />
        <Stat label="Előleg" value={fmtFt(totals.advance)} />
        <Stat label="Kifizetendő" value={fmtFt(totals.total)} strong />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Dolgozó</th>
              <th className="p-2 text-right">Napok</th>
              <th className="p-2 text-right">Átlag napidíj</th>
              <th className="p-2 text-right">Napok díja</th>
              <th className="p-2 text-right w-32">Útiköltség</th>
              <th className="p-2 text-right w-32">Előleg</th>
              <th className="p-2 text-right">Kifizetendő</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const e = edits[r.worker_id] ?? {};
              const transport = e.transport_fee ?? r.transport_fee;
              const advance = e.advance ?? r.advance;
              const total = r.base_pay + transport - advance;
              return (
                <tr key={r.worker_id} className="border-t align-top">
                  <td className="p-2">
                    <div className="font-medium">{r.worker_name}</div>
                    {r.by_project.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {r.by_project.map((p) => `${p.project_name}: ${p.days}`).join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="p-2 text-right">{r.days}</td>
                  <td className="p-2 text-right">{fmtFt(r.daily_rate)}</td>
                  <td className="p-2 text-right">{fmtFt(r.base_pay)}</td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      value={transport}
                      onChange={(ev) =>
                        setEdits((prev) => ({
                          ...prev,
                          [r.worker_id]: { ...prev[r.worker_id], transport_fee: Number(ev.target.value) },
                        }))
                      }
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="p-2 text-right">
                    <Input
                      type="number"
                      value={advance}
                      onChange={(ev) =>
                        setEdits((prev) => ({
                          ...prev,
                          [r.worker_id]: { ...prev[r.worker_id], advance: Number(ev.target.value) },
                        }))
                      }
                      className="h-8 text-right"
                    />
                  </td>
                  <td className="p-2 text-right font-medium">{fmtFt(total)}</td>
                  <td className="p-2 text-right">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => save.mutate(r.worker_id)}
                      disabled={save.isPending}
                    >
                      <Save className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Nincs adat erre az időszakra.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(q.data?.byProject.length ?? 0) > 0 && (
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-medium">Projekt bontás</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="p-2 text-left">Projekt</th>
                <th className="p-2 text-right">Napok</th>
                <th className="p-2 text-right">Összeg</th>
              </tr>
            </thead>
            <tbody>
              {q.data!.byProject.map((p) => (
                <tr key={p.project_id} className="border-t">
                  <td className="p-2">{p.project_name}</td>
                  <td className="p-2 text-right">{p.days}</td>
                  <td className="p-2 text-right">{fmtFt(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? "text-lg font-semibold" : "text-lg"}>{value}</div>
    </div>
  );
}