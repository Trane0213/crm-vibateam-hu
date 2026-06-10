import { createFileRoute } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/page-header";
import { Briefcase, FileText, BellRing, ListChecks, Mail, Phone, Calendar, FolderOpen, UserPlus, StickyNote, History } from "lucide-react";
import { formatHuf } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetail,
});

function ProjectDetail() {
  const { id } = Route.useParams();
  return (
    <div className="flex flex-col">
      {/* HEADER */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Projekt</div>
            <h1 className="mt-1 text-xl font-semibold">Projekt #{id}</h1>
            <div className="mt-1 text-sm text-muted-foreground">Cég · cím · felelős — TODO: projects tábla</div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">tárgyalás</Badge>
            <Badge variant="outline">{formatHuf(0)}</Badge>
          </div>
        </div>
        {/* Kiemelt sor */}
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini label="Aktív ajánlat" value="—" tone="primary" />
          <Mini label="Köv. follow-up" value="—" tone="warning" />
          <Mini label="Nyitott feladat" value="—" tone="info" />
          <Mini label="Utolsó kommunikáció" value="—" />
        </div>
      </div>

      {/* TABS */}
      <div className="p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Briefcase className="mr-1.5 h-3.5 w-3.5" />Áttekintés</TabsTrigger>
            <TabsTrigger value="quotes"><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlatok</TabsTrigger>
            <TabsTrigger value="followups"><BellRing className="mr-1.5 h-3.5 w-3.5" />Follow-up</TabsTrigger>
            <TabsTrigger value="tasks"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Feladatok</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="mr-1.5 h-3.5 w-3.5" />Emailek</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="mr-1.5 h-3.5 w-3.5" />Hívások</TabsTrigger>
            <TabsTrigger value="meetings"><Calendar className="mr-1.5 h-3.5 w-3.5" />Találkozók</TabsTrigger>
            <TabsTrigger value="docs"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Dokumentumok</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolattartók</TabsTrigger>
            <TabsTrigger value="notes"><StickyNote className="mr-1.5 h-3.5 w-3.5" />Jegyzetek</TabsTrigger>
            <TabsTrigger value="timeline"><History className="mr-1.5 h-3.5 w-3.5" />Idővonal</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Ajánlat-állapot</CardTitle></CardHeader>
              <CardContent><EmptyState icon={FileText} title="Nincs ajánlat" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Aktív follow-up-ok</CardTitle></CardHeader>
              <CardContent><EmptyState icon={BellRing} title="Nincs nyitott follow-up" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Következő teendők</CardTitle></CardHeader>
              <CardContent><EmptyState icon={ListChecks} title="Nincs feladat" /></CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Utolsó 3 kommunikáció</CardTitle></CardHeader>
              <CardContent><EmptyState icon={History} title="Még nincs esemény" /></CardContent>
            </Card>
          </TabsContent>

          {["quotes","followups","tasks","emails","calls","meetings","docs","contacts","notes","timeline"].map((t) => (
            <TabsContent key={t} value={t} className="mt-4">
              <EmptyState
                icon={History}
                title="Tartalom hamarosan"
                description={`Ehhez a fülhöz a megfelelő tábla (project_id FK) bekötése szükséges. TODO: backend missing.`}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}

function Mini({ label, value, tone = "primary" }: { label: string; value: string; tone?: "primary" | "warning" | "danger" | "info" | "muted" }) {
  const toneClass: Record<string, string> = {
    primary: "border-primary/30 bg-primary/5 text-primary",
    warning: "border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
    info: "border-[color:var(--status-info)]/30 bg-[color:var(--status-info)]/5 text-[color:var(--status-info)]",
    muted: "border-border bg-muted/30 text-muted-foreground",
  };
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass[tone]}`}>
      <div className="text-[10px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}