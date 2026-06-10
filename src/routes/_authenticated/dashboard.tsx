import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/page-header";
import { FileText, BellRing, Sparkles, ListChecks, TrendingUp, Bot } from "lucide-react";
import { formatHuf } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Irányítópult"
        description="Ajánlatkövetés, follow-upok és napi teendők — Excel helyett."
      />
      <div className="grid gap-4 p-6 lg:grid-cols-4">
        <Kpi icon={FileText} label="Nyitott ajánlatok" value="—" sub={formatHuf(0)} />
        <Kpi icon={BellRing} label="Lejárt follow-up" value="—" sub="haladéktalanul" tone="danger" />
        <Kpi icon={ListChecks} label="Ma esedékes" value="—" sub="feladatok" tone="warning" />
        <Kpi icon={Sparkles} label="Új leadek (hét)" value="—" sub="ezen a héten" tone="info" />
      </div>
      <div className="grid gap-4 px-6 pb-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Ajánlat-tölcsér</CardTitle>
              <CardDescription>Készül → Kiküldve → Tárgyalás → Megnyert / Elveszett</CardDescription>
            </div>
            <Link to="/quotes" className="text-xs text-primary hover:underline">Összes ajánlat</Link>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={TrendingUp}
              title="Ajánlat-pipeline diagram"
              description="A 'quotes' tábla összekötése után jelennek meg a fokozatok és értékek (HUF)."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Follow-up dashboard</CardTitle>
              <CardDescription>lejárt / ma / 7 napon belül</CardDescription>
            </div>
            <Badge variant="destructive">prioritás</Badge>
          </CardHeader>
          <CardContent>
            <EmptyState icon={BellRing} title="Nincs adat" description="A followups tábla bekötésére vár." />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lead státuszok</CardTitle>
            <CardDescription>kanban-mini</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState icon={Sparkles} title="Nincs adat" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Következő teendők</CardTitle>
            <CardDescription>személyre szabott napi lista</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState icon={ListChecks} title="Nincs nyitott feladat" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">AI Értékesítő javaslatai</CardTitle>
              <CardDescription>új leadek, follow-up tippek</CardDescription>
            </div>
            <Badge variant="secondary">hamarosan</Badge>
          </CardHeader>
          <CardContent>
            <EmptyState icon={Bot} title="AI Értékesítő itt fog javaslatokat tenni" description="OpenAI kulcs konfigurálása után aktív." />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon, label, value, sub, tone = "primary",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: string; sub?: string;
  tone?: "primary" | "warning" | "danger" | "info";
}) {
  const toneClass: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    warning: "text-[color:var(--status-warning)] bg-[color:var(--status-warning)]/15",
    danger: "text-destructive bg-destructive/10",
    info: "text-[color:var(--status-info)] bg-[color:var(--status-info)]/10",
  };
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${toneClass[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-semibold tabular-nums leading-none">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{label}</div>
          {sub && <div className="text-[11px] text-muted-foreground/70">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}