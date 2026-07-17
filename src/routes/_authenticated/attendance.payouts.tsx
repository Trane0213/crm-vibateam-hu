import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, Lock } from "lucide-react";
import { getPeriodSummary } from "@/lib/attendance/attendance.functions";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/attendance/payouts")({
  component: AttendancePayouts,
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

/**
 * Owner-only, csak-olvasható kifizetési nézet.
 * Ugyanazt a `getPeriodSummary` szerverfüggvényt használja mint az „Időszak”
 * fül, de itt nincs semmilyen szerkesztő input — csak megjelenítés + CSV.
 * A képlet: Napok díja + Bérlet − Előleg (ugyanaz mint a rendszer többi helyén).
 */
function AttendancePayouts() {
  const { role, isLoading } = usePermissions();
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const summaryFn = useServerFn(getPeriodSummary);

  const q = useQuery({
    queryKey: ["att", "payouts", from, to],
    queryFn: () => summaryFn({ data: { from, to } }),
    enabled: role === "owner",
  });

  const rows = q.data?.rows ?? [];
  const totals = q.data?.totals ?? { days: 0, base_pay: 0, transport_fee: 0, advance: 0, total: 0 };

  const csvHref = useMemo(() => {
    const header = ["Dolgozó", "Napok", "Napok díja", "Bérlet", "Előleg", "Fizetendő"];
    const lines = [header.join(";")];
    for (const r of rows) {
      lines.push([
        `"${r.worker_name.replace(/"/g, '""')}"`,
        r.days,
        Math.round(r.base_pay),
        Math.round(r.transport_fee),
        Math.round(r.advance),
        Math.round(r.total),
      ].join(";"));
    }
    lines.push([
      `"Összesen"`, totals.days, Math.round(totals.base_pay),
      Math.round(totals.transport_fee), Math.round(totals.advance), Math.round(totals.total),
    ].join(";"));
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    return URL.createObjectURL(blob);
  }, [rows, totals]);

  if (isLoading) return null;
  if (role !== "owner") return <Navigate to="/attendance" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5" />
        Csak megtekintés — kifizetés-ellenőrző képernyő. Módosítás az „Időszak” fülön lehetséges.
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Kezdet</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div>
          <Label className="text-xs">Vég</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
        <a href={csvHref} download={`fizetesek_${from}_${to}.csv`} className="ml-auto">
          <Button variant="secondary"><Download className="h-4 w-4 mr-1" /> CSV export</Button>
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Stat label="Napok" value={String(totals.days)} />
        <Stat label="Napok díja" value={fmtFt(totals.base_pay)} />
        <Stat label="Bérlet" value={fmtFt(totals.transport_fee)} />
        <Stat label="Előleg" value={fmtFt(totals.advance)} />
        <Stat label="Fizetendő" value={fmtFt(totals.total)} strong />
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="p-2 text-left">Dolgozó</th>
              <th className="p-2 text-right">Ledolgozott napok</th>
              <th className="p-2 text-right">Napidíjak összege</th>
              <th className="p-2 text-right">Bérlet</th>
              <th className="p-2 text-right">Előleg</th>
              <th className="p-2 text-right">Fizetendő végösszeg</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.worker_id} className="border-t">
                <td className="p-2 font-medium">{r.worker_name}</td>
                <td className="p-2 text-right tabular-nums">{r.days}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(r.base_pay)}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(r.transport_fee)}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(r.advance)}</td>
                <td className="p-2 text-right tabular-nums font-semibold">{fmtFt(r.total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nincs adat erre az időszakra.</td></tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="p-2">Összesen</td>
                <td className="p-2 text-right tabular-nums">{totals.days}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(totals.base_pay)}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(totals.transport_fee)}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(totals.advance)}</td>
                <td className="p-2 text-right tabular-nums">{fmtFt(totals.total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
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