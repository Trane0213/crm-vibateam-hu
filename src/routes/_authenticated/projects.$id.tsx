import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/page-header";
import { Briefcase, FileText, BellRing, ListChecks, Mail, Phone, Calendar, FolderOpen, UserPlus, StickyNote, History } from "lucide-react";
import { formatHuf } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/projects/$id")({
  component: ProjectDetail,
});

function useProject(id: string) {
  return useQuery({
    queryKey: ["projects", "detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return data as Record<string, any> | null;
    },
  });
}

function ProjectDetail() {
  const { id } = Route.useParams();
  const { data: project, isLoading, error } = useProject(id);
  const companyLabel = useLookup("companies", "name");

  const quotes = useListWhere<any>("quotes", "project_id", id, { order: "created_at", ascending: false });
  const followups = useListWhere<any>("followups", "project_id", id, { order: "due_date", ascending: true });
  const tasks = useListWhere<any>("tasks", "project_id", id, { order: "due_date", ascending: true });
  const emails = useListWhere<any>("emails", "project_id", id, { order: "created_at", ascending: false });
  const calls = useListWhere<any>("phone_calls", "project_id", id, { order: "created_at", ascending: false });
  const meetings = useListWhere<any>("meetings", "project_id", id, { order: "start_at", ascending: true });
  const docs = useListWhere<any>("project_documents", "project_id", id, { order: "created_at", ascending: false });
  const notes = useListWhere<any>("project_notes", "project_id", id, { order: "created_at", ascending: false });

  const totalQuoteValue = (quotes.data ?? []).reduce(
    (a, r) => a + (Number(r.total_amount ?? r.total ?? r.amount) || 0),
    0,
  );
  const openFollowups = (followups.data ?? []).filter((r) => !r.completed);
  const nextFollowup = openFollowups[0]?.due_date as string | undefined;
  const openTasks = (tasks.data ?? []).filter((r) => !(r.completed ?? r.done ?? false));
  const lastComm = (() => {
    const dates: number[] = [];
    for (const e of emails.data ?? []) if (e.created_at) dates.push(new Date(e.created_at).getTime());
    for (const e of calls.data ?? []) if (e.created_at) dates.push(new Date(e.created_at).getTime());
    for (const e of meetings.data ?? []) if (e.start_at) dates.push(new Date(e.start_at).getTime());
    if (!dates.length) return null;
    return new Date(Math.max(...dates)).toISOString();
  })();

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Projekt betöltése…</div>;
  }
  if (error || !project) {
    return (
      <div className="p-6">
        <EmptyState icon={Briefcase} title="A projekt nem található" description={(error as any)?.message ?? "Ellenőrizd a linket."} />
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* HEADER */}
      <div className="border-b bg-background px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Projekt</div>
            <h1 className="mt-1 text-xl font-semibold">{project.title ?? project.name ?? `#${id.slice(0, 8)}`}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              {companyLabel(project.company_id)} {project.address ? `· ${project.address}` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {project.status && <Badge variant="secondary">{String(project.status)}</Badge>}
            <Badge variant="outline">{formatHuf(totalQuoteValue)}</Badge>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini label="Ajánlatok" value={`${quotes.data?.length ?? 0} db`} tone="primary" />
          <Mini label="Köv. follow-up" value={nextFollowup ? fmtDateTime(nextFollowup) : "—"} tone={nextFollowup && new Date(nextFollowup) < new Date() ? "danger" : "warning"} />
          <Mini label="Nyitott feladat" value={`${openTasks.length} db`} tone="info" />
          <Mini label="Utolsó kommunikáció" value={lastComm ? fmtDate(lastComm) : "—"} />
        </div>
      </div>

      {/* TABS */}
      <div className="p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Briefcase className="mr-1.5 h-3.5 w-3.5" />Áttekintés</TabsTrigger>
            <TabsTrigger value="quotes"><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlatok ({quotes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="followups"><BellRing className="mr-1.5 h-3.5 w-3.5" />Follow-up ({openFollowups.length})</TabsTrigger>
            <TabsTrigger value="tasks"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Feladatok ({openTasks.length})</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="mr-1.5 h-3.5 w-3.5" />Emailek ({emails.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="mr-1.5 h-3.5 w-3.5" />Hívások ({calls.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="meetings"><Calendar className="mr-1.5 h-3.5 w-3.5" />Találkozók ({meetings.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="docs"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Dokumentumok ({docs.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolattartók</TabsTrigger>
            <TabsTrigger value="notes"><StickyNote className="mr-1.5 h-3.5 w-3.5" />Jegyzetek ({notes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline"><History className="mr-1.5 h-3.5 w-3.5" />Idővonal</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-sm">Ajánlat-állapot</CardTitle></CardHeader>
              <CardContent className="text-sm">
                {(quotes.data ?? []).length === 0 ? <EmptyState icon={FileText} title="Nincs ajánlat" /> : (
                  <ul className="space-y-1.5">
                    {(quotes.data ?? []).slice(0, 5).map((q) => (
                      <li key={q.id} className="flex justify-between gap-2">
                        <span className="truncate"><Badge variant="outline" className="mr-2">{q.status ?? "—"}</Badge>{q.title ?? `Ajánlat #${String(q.id).slice(0,8)}`}</span>
                        <span className="tabular-nums text-muted-foreground">{formatHuf(Number(q.total_amount ?? q.total ?? q.amount ?? 0))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Aktív follow-up-ok</CardTitle></CardHeader>
              <CardContent>
                {openFollowups.length === 0 ? <EmptyState icon={BellRing} title="Nincs nyitott follow-up" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {openFollowups.slice(0, 5).map((f) => {
                      const overdue = f.due_date && new Date(f.due_date) < new Date();
                      return (
                        <li key={f.id} className="flex justify-between gap-2">
                          <span className="truncate">{f.followup_type ?? "—"} · {f.result ?? ""}</span>
                          <span className={`tabular-nums ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{fmtDateTime(f.due_date)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Következő teendők</CardTitle></CardHeader>
              <CardContent>
                {openTasks.length === 0 ? <EmptyState icon={ListChecks} title="Nincs feladat" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {openTasks.slice(0, 5).map((t) => (
                      <li key={t.id} className="flex justify-between gap-2">
                        <span className="truncate">{t.title ?? t.description ?? "—"}</span>
                        <span className="tabular-nums text-muted-foreground">{fmtDate(t.due_date)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-sm">Utolsó kommunikáció</CardTitle></CardHeader>
              <CardContent>
                {lastComm ? <div className="text-sm">Legutóbbi esemény: <span className="font-medium">{fmtDateTime(lastComm)}</span></div> : <EmptyState icon={History} title="Még nincs esemény" />}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quotes" className="mt-4">
            <RelationList rows={quotes.data} columns={[
              { label: "Cím", get: (r) => r.title ?? `#${String(r.id).slice(0,8)}` },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Összeg", get: (r) => formatHuf(Number(r.total_amount ?? r.total ?? r.amount ?? 0)), className: "tabular-nums text-right" },
              { label: "Létrejött", get: (r) => fmtDate(r.created_at) },
            ]} link={(r) => ({ to: "/quotes/$id", params: { id: r.id } })} empty="Még nincs ajánlat ehhez a projekthez." />
          </TabsContent>
          <TabsContent value="followups" className="mt-4">
            <RelationList rows={followups.data} columns={[
              { label: "Esedékesség", get: (r) => fmtDateTime(r.due_date) },
              { label: "Típus", get: (r) => r.followup_type ?? "—" },
              { label: "Lezárva", get: (r) => (r.completed ? "✓" : "—") },
              { label: "Jegyzet", get: (r) => r.result ?? "—" },
            ]} empty="Nincs follow-up." />
          </TabsContent>
          <TabsContent value="tasks" className="mt-4">
            <RelationList rows={tasks.data} columns={[
              { label: "Megnevezés", get: (r) => r.title ?? r.description ?? "—" },
              { label: "Határidő", get: (r) => fmtDate(r.due_date) },
              { label: "Kész", get: (r) => (r.completed ?? r.done) ? "✓" : "—" },
            ]} empty="Nincs feladat." />
          </TabsContent>
          <TabsContent value="emails" className="mt-4">
            <RelationList rows={emails.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Irány", get: (r) => r.direction ?? "—" },
              { label: "Tárgy", get: (r) => r.subject ?? "—" },
              { label: "Feladó", get: (r) => r.from_address ?? "—" },
            ]} empty="Nincs email." />
          </TabsContent>
          <TabsContent value="calls" className="mt-4">
            <RelationList rows={calls.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Irány", get: (r) => r.direction ?? "—" },
              { label: "Szám", get: (r) => r.phone_number ?? "—" },
              { label: "Jegyzet", get: (r) => r.notes ?? "—" },
            ]} empty="Nincs hívás." />
          </TabsContent>
          <TabsContent value="meetings" className="mt-4">
            <RelationList rows={meetings.data} columns={[
              { label: "Kezdés", get: (r) => fmtDateTime(r.start_at) },
              { label: "Megnevezés", get: (r) => r.title ?? "—" },
              { label: "Helyszín", get: (r) => r.location ?? "—" },
            ]} empty="Nincs találkozó." />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <RelationList rows={docs.data} columns={[
              { label: "Fájl", get: (r) => r.file_name ?? r.name ?? "—" },
              { label: "Kategória", get: (r) => r.category ?? "—" },
              { label: "Feltöltve", get: (r) => fmtDateTime(r.created_at) },
            ]} empty="Nincs dokumentum. (R2 feltöltés a következő fázisban.)" />
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <EmptyState icon={UserPlus} title="Projekthez kötött kapcsolattartók" description="A cégen keresztül érhetők el — lásd Ügyfél kártya." />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <RelationList rows={notes.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Tartalom", get: (r) => r.content ?? r.body ?? r.note ?? "—" },
            ]} empty="Nincs jegyzet." />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <Timeline emails={emails.data ?? []} calls={calls.data ?? []} meetings={meetings.data ?? []} followups={followups.data ?? []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

type Col = { label: string; get: (r: any) => any; className?: string };
function RelationList({ rows, columns, empty, link }: {
  rows: any[] | undefined;
  columns: Col[];
  empty: string;
  link?: (r: any) => { to: string; params: Record<string, string> };
}) {
  if (!rows || rows.length === 0) {
    return <EmptyState icon={History} title="Nincs adat" description={empty} />;
  }
  return (
    <div className="rounded-md border bg-card overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
          <tr>{columns.map((c) => <th key={c.label} className={`px-3 py-2 text-left ${c.className ?? ""}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const lk = link?.(r);
            return (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                {columns.map((c, i) => (
                  <td key={c.label} className={`px-3 py-2 ${c.className ?? ""}`}>
                    {i === 0 && lk ? <Link to={lk.to} params={lk.params} className="text-primary hover:underline">{String(c.get(r) ?? "—")}</Link> : String(c.get(r) ?? "—")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ emails, calls, meetings, followups }: { emails: any[]; calls: any[]; meetings: any[]; followups: any[] }) {
  const items = [
    ...emails.map((e) => ({ at: e.created_at, type: "Email", label: e.subject ?? "—", icon: Mail })),
    ...calls.map((e) => ({ at: e.created_at, type: "Hívás", label: e.phone_number ?? e.notes ?? "—", icon: Phone })),
    ...meetings.map((e) => ({ at: e.start_at, type: "Találkozó", label: e.title ?? "—", icon: Calendar })),
    ...followups.map((e) => ({ at: e.due_date, type: "Follow-up", label: e.result ?? e.followup_type ?? "—", icon: BellRing })),
  ].filter((i) => i.at).sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (items.length === 0) return <EmptyState icon={History} title="Nincs esemény az idővonalon" />;
  return (
    <ol className="relative border-l ml-3 space-y-3">
      {items.map((it, idx) => (
        <li key={idx} className="ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><it.icon className="h-3.5 w-3.5" />{it.type} · {fmtDateTime(it.at)}</div>
          <div className="text-sm">{it.label}</div>
        </li>
      ))}
    </ol>
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