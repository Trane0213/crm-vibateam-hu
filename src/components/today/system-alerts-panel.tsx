import { Link } from "@tanstack/react-router";
import { ShieldCheck, Copy, AlertTriangle, Link2, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQualityOverview } from "@/lib/dedupe/use-quality-overview";

/**
 * D7 — Rendszer figyelmeztetések blokk a marketing dashboardon.
 * A D3/D4/D5 motorok eredményeit egyetlen ránézhető listában mutatja.
 */
export function SystemAlertsPanel() {
  const { counts, totalAlerts, isLoading } = useQualityOverview();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Rendszer figyelmeztetések
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {isLoading ? "…" : `${totalAlerts} elem`}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        <AlertRow icon={ShieldCheck} tone="warning"  count={counts.incompleteCompanies} label="hiányos cég" to="/data-quality" />
        <AlertRow icon={Copy}        tone="danger"   count={counts.companyDuplicates}   label="potenciális duplikáció" to="/data-quality" />
        <AlertRow icon={AlertTriangle} tone="danger" count={counts.contactConflicts}    label="kapcsolattartó konfliktus" to="/data-quality" />
        <AlertRow icon={Link2}       tone="info"     count={counts.unlinkedLeads}       label="linkeletlen lead — vár kapcsolásra" to="/data-quality" />
        <AlertRow icon={Mail}        tone="info"     count={counts.unlinkedThreads}     label="email thread — vár kapcsolásra" to="/data-quality" />
        {totalAlerts === 0 && !isLoading && (
          <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
            Minden rendben — nincs nyitott adatminőségi figyelmeztetés.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertRow({
  icon: Icon, tone, count, label, to,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone: "info" | "warning" | "danger";
  count: number;
  label: string;
  to: string;
}) {
  const muted = count === 0;
  const cls =
    muted ? "text-muted-foreground" :
    tone === "danger" ? "text-destructive" :
    tone === "warning" ? "text-amber-700" : "text-primary";
  return (
    <Link
      to={to}
      className={`flex items-center gap-2 rounded-md border px-3 py-1.5 hover:bg-muted/40 ${muted ? "opacity-60" : ""}`}
    >
      <Icon className={`h-3.5 w-3.5 ${cls}`} />
      <span className={`tabular-nums font-semibold ${cls}`}>{count}</span>
      <span className="text-foreground/80">{label}</span>
    </Link>
  );
}