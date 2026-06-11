import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/page-header";
import { Briefcase, FileText, BellRing, Phone, Calendar, FolderOpen, UserPlus, StickyNote, History, Trash2, ListChecks, Mail } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { formatHuf } from "@/lib/format";
import { supabase } from "@/integrations/supabase/client";
import { useListWhere, humanizeSupabaseError } from "@/lib/db-hooks";
import { fmtDate, fmtDateTime, useLookup } from "@/components/resource/resource-page";
import { DocumentManager } from "@/components/documents/document-manager";
import { ProjectTimeline } from "@/components/projects/project-timeline";
import { toast } from "sonner";
import { AiSummaryDialog } from "@/components/ai/ai-summary-dialog";
import { loadProjectSnapshot, serializeProject } from "@/lib/ai/crm-context";
import { ProjectStatusSelect } from "@/components/projects/project-status-select";
import { ProjectContactsPanel } from "@/components/projects/project-contacts-panel";
import { PROJECT_STATUS_LABEL, PROJECT_CONTACT_ROLE_LABEL, COMPANY_TYPE_LABEL } from "@/lib/viba-constants";

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
  const calls = useListWhere<any>("phone_calls", "project_id", id, { order: "created_at", ascending: false });
  const meetings = useListWhere<any>("meetings", "project_id", id, { order: "meeting_date", ascending: true });
  const docs = useListWhere<any>("project_documents", "project_id", id, { order: "created_at", ascending: false });
  const notes = useListWhere<any>("project_notes", "project_id", id, { order: "created_at", ascending: false });
  const tasks = useListWhere<any>("tasks", "project_id", id, { order: "due_date", ascending: true });
  const emailThreads = useListWhere<any>("email_threads", "project_id", id, { order: "last_message_at", ascending: false });
  const projectContacts = useQuery({
    queryKey: ["project_contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_contacts")
        .select("id, role, contact:contacts(id,name,email,phone,position)")
        .eq("project_id", id);
      if (error) throw error;
      return data ?? [];
    },
  });
  const company = useQuery({
    queryKey: ["company", project?.company_id],
    enabled: !!project?.company_id,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("id,name,company_type").eq("id", project!.company_id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const totalQuoteValue = (quotes.data ?? []).reduce(
    (a, r) => a + (Number(r.total_amount) || 0),
    0,
  );
  const openFollowups = (followups.data ?? []).filter((r) => !r.completed);
  const nextFollowup = openFollowups[0]?.due_date as string | undefined;
  const lastComm = (() => {
    const dates: number[] = [];
    for (const e of calls.data ?? []) if (e.created_at) dates.push(new Date(e.created_at).getTime());
    for (const e of meetings.data ?? []) if (e.meeting_date) dates.push(new Date(e.meeting_date).getTime());
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
            <ProjectStatusSelect projectId={id} value={project.status} />
            <Badge variant="outline">{formatHuf(totalQuoteValue)}</Badge>
            <AiSummaryDialog
              title={`Projekt összefoglaló: ${project.title ?? project.name ?? ""}`}
              description="Az AI a projekt aktuális adataiból készít üzleti összefoglalót."
              triggerLabel="AI Összefoglaló"
              loadContext={async () => serializeProject(await loadProjectSnapshot(id))}
              prompt={[
                "Készíts üzleti összefoglalót a megadott projektről.",
                "Térj ki az alábbiakra, csak ami adatból kiderül:",
                "1) Projekt állapot (státusz, határidő, cég).",
                "2) Ajánlatok (darab, összérték, legutóbbi státusz).",
                "3) Nyitott feladatok (mennyi, mi a legsürgősebb).",
                "4) Dokumentumok (van-e, mennyi).",
                "5) Follow-upok (van-e lejárt, mikor a következő).",
                "Zárj 2–3 mondatos vezetői üzenettel: hol áll a projekt és mi a legfontosabb teendő.",
              ].join(" ")}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Mini label="Ajánlatok" value={`${quotes.data?.length ?? 0} db`} tone="primary" />
          <Mini label="Köv. follow-up" value={nextFollowup ? fmtDateTime(nextFollowup) : "—"} tone={nextFollowup && new Date(nextFollowup) < new Date() ? "danger" : "warning"} />
          <Mini label="Hívás / találkozó" value={`${(calls.data?.length ?? 0)} / ${(meetings.data?.length ?? 0)}`} tone="info" />
          <Mini label="Utolsó kommunikáció" value={lastComm ? fmtDate(lastComm) : "—"} />
        </div>
        {company.data && (
          <div className="mt-2 text-xs text-muted-foreground">
            Cégtípus: <span className="font-medium">{COMPANY_TYPE_LABEL[company.data.company_type as string] ?? company.data.company_type ?? "—"}</span>
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="overview"><Briefcase className="mr-1.5 h-3.5 w-3.5" />Áttekintés</TabsTrigger>
            <TabsTrigger value="quotes"><FileText className="mr-1.5 h-3.5 w-3.5" />Ajánlatok ({quotes.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="followups"><BellRing className="mr-1.5 h-3.5 w-3.5" />Follow-up ({openFollowups.length})</TabsTrigger>
            <TabsTrigger value="calls"><Phone className="mr-1.5 h-3.5 w-3.5" />Hívások ({calls.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="meetings"><Calendar className="mr-1.5 h-3.5 w-3.5" />Találkozók ({meetings.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="tasks"><ListChecks className="mr-1.5 h-3.5 w-3.5" />Feladatok ({tasks.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="emails"><Mail className="mr-1.5 h-3.5 w-3.5" />Emailek ({emailThreads.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="docs"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Dokumentumok ({docs.data?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="contacts"><UserPlus className="mr-1.5 h-3.5 w-3.5" />Kapcsolattartók ({projectContacts.data?.length ?? 0})</TabsTrigger>
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
                        <span className="truncate">
                          <Badge variant="outline" className="mr-2">{q.status ?? "—"}</Badge>
                          <Link to="/quotes/$id" params={{ id: q.id }} className="text-primary hover:underline">
                            {q.version != null ? `v${q.version}` : `#${String(q.id).slice(0, 8)}`}
                          </Link>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{formatHuf(Number(q.total_amount ?? 0))}</span>
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
              <CardHeader><CardTitle className="text-sm">Kapcsolattartók a cégtől</CardTitle></CardHeader>
              <CardContent>
                {(projectContacts.data ?? []).length === 0 ? <EmptyState icon={UserPlus} title="Nincs kapcsolattartó" /> : (
                  <ul className="space-y-1.5 text-sm">
                    {(projectContacts.data ?? []).slice(0, 5).map((c: any) => (
                      <li key={c.id} className="flex justify-between gap-2">
                        {c.contact ? (
                          <Link to="/contacts/$id" params={{ id: c.contact.id }} className="truncate text-primary hover:underline">
                            {c.contact.name ?? "—"}
                          </Link>
                        ) : <span>—</span>}
                        <span className="text-muted-foreground">{c.role ? PROJECT_CONTACT_ROLE_LABEL[c.role] ?? c.role : (c.contact?.email ?? "")}</span>
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
              { label: "Verzió", get: (r) => r.version != null ? `v${r.version}` : `#${String(r.id).slice(0,8)}` },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Összeg", get: (r) => formatHuf(Number(r.total_amount ?? 0)), className: "tabular-nums text-right" },
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
          <TabsContent value="calls" className="mt-4">
            <RelationList rows={calls.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.created_at) },
              { label: "Irány", get: (r) => r.direction ?? "—" },
              { label: "Típus", get: (r) => r.call_type ?? "—" },
              { label: "Eredmény", get: (r) => r.outcome ?? "—" },
              { label: "Összefoglaló", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs hívás." />
          </TabsContent>
          <TabsContent value="meetings" className="mt-4">
            <RelationList rows={meetings.data} columns={[
              { label: "Időpont", get: (r) => fmtDateTime(r.meeting_date) },
              { label: "Megnevezés", get: (r) => r.title ?? "—" },
              { label: "Helyszín", get: (r) => r.location ?? "—" },
              { label: "Jegyzet", get: (r) => r.summary ?? "—" },
            ]} empty="Nincs találkozó." />
          </TabsContent>
          <TabsContent value="tasks" className="mt-4">
            <RelationList rows={tasks.data} columns={[
              { label: "Megnevezés", get: (r) => r.title ?? "—" },
              { label: "Státusz", get: (r) => r.status ?? "—" },
              { label: "Prioritás", get: (r) => r.priority ?? "—" },
              { label: "Határidő", get: (r) => fmtDateTime(r.due_date) },
            ]} empty="Nincs feladat ehhez a projekthez." />
          </TabsContent>
          <TabsContent value="emails" className="mt-4">
            <RelationList rows={emailThreads.data} columns={[
              { label: "Tárgy", get: (r) => r.subject ?? "(nincs tárgy)" },
              { label: "Résztvevők", get: (r) => (r.participants ?? []).join(", ") || "—" },
              { label: "Utolsó üzenet", get: (r) => fmtDateTime(r.last_message_at ?? r.updated_at ?? r.created_at) },
            ]} link={(r) => ({ to: "/emails/$threadId", params: { threadId: r.id } })}
              empty="Nincs email-szál ehhez a projekthez. A levelező nézetből rendelheted hozzá a projekthez." />
          </TabsContent>
          <TabsContent value="docs" className="mt-4">
            <DocumentManager projectId={id} />
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <ProjectContactsPanel projectId={id} companyId={project.company_id} />
          </TabsContent>
          <TabsContent value="notes" className="mt-4">
            <ProjectNotes projectId={id} notes={notes.data ?? []} />
          </TabsContent>
          <TabsContent value="timeline" className="mt-4">
            <ProjectTimeline
              project={project}
              quotes={quotes.data ?? []}
              followups={followups.data ?? []}
              tasks={tasks.data ?? []}
              emails={[]}
              calls={calls.data ?? []}
              meetings={meetings.data ?? []}
              documents={docs.data ?? []}
              notes={notes.data ?? []}
            />
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

function ProjectNotes({ projectId, notes }: { projectId: string; notes: any[] }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const add = useMutation({
    mutationFn: async (note: string) => {
      const { data: u } = await supabase.auth.getUser();
      let author_id: string | null = null;
      if (u.user?.id) {
        const { data: prof } = await supabase
          .from("users_profile").select("id").eq("auth_user_id", u.user.id).maybeSingle();
        author_id = (prof as any)?.id ?? null;
      }
      const payload: any = { project_id: projectId, note };
      if (author_id) payload.author_id = author_id;
      const { error } = await supabase.from("project_notes").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["project_notes"] });
      toast.success("Jegyzet hozzáadva");
    },
    onError: (e: any) => toast.error("Mentés sikertelen", { description: humanizeSupabaseError(e) }),
  });
  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_notes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project_notes"] });
      toast.success("Törölve");
    },
    onError: (e: any) => toast.error("Törlés sikertelen", { description: humanizeSupabaseError(e) }),
  });

  return (
    <div className="space-y-3">
      <div className="rounded-md border bg-card p-3">
        <Textarea
          rows={3}
          placeholder="Új jegyzet…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!text.trim() || add.isPending} onClick={() => add.mutate(text.trim())}>
            {add.isPending ? "Mentés…" : "Hozzáadás"}
          </Button>
        </div>
      </div>
      {notes.length === 0 ? (
        <EmptyState icon={StickyNote} title="Még nincs jegyzet" description="Az új jegyzetek itt jelennek meg." />
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="whitespace-pre-wrap text-sm">{n.note ?? "—"}</div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="text-destructive" title="Törlés">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Jegyzet törlése</AlertDialogTitle>
                      <AlertDialogDescription>
                        Biztosan törlöd ezt a jegyzetet? Ez a művelet nem visszavonható.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Mégse</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(n.id)}>Törlés</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">{fmtDateTime(n.created_at)}</div>
            </li>
          ))}
        </ul>
      )}
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