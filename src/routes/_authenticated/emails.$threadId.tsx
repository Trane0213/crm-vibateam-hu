import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, ChevronLeft, Paperclip, Download, Reply, Building2, User, Briefcase, Target, FileText, Image as ImageIcon, FileSpreadsheet, FileArchive } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { EmailBody } from "@/components/emails/email-body";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { r2PresignDownload } from "@/lib/r2.functions";
import { toast } from "sonner";
import { EmailComposer } from "@/components/emails/email-composer";

export const Route = createFileRoute("/_authenticated/emails/$threadId")({
  component: EmailThread,
});

function fmtBytes(n: number | null | undefined): string {
  if (!n || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentIcon(mime: string | null | undefined) {
  const m = (mime ?? "").toLowerCase();
  if (m.startsWith("image/")) return ImageIcon;
  if (m.includes("sheet") || m.includes("excel") || m.includes("csv")) return FileSpreadsheet;
  if (m.includes("zip") || m.includes("rar") || m.includes("compressed") || m.includes("tar")) return FileArchive;
  if (m.includes("pdf") || m.startsWith("text/") || m.includes("word") || m.includes("document")) return FileText;
  return Paperclip;
}

function AddrList({ label, items, showEmpty = false }: { label: string; items: string[] | null | undefined; showEmpty?: boolean }) {
  const list = (items ?? []).filter(Boolean);
  if (list.length === 0 && !showEmpty) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="uppercase tracking-wider text-muted-foreground shrink-0 w-14">{label}</span>
      <span className="min-w-0 break-words text-foreground/80">{list.length ? list.join(", ") : "—"}</span>
    </div>
  );
}

function EmailThread() {
  const { threadId } = Route.useParams();
  const [replyOpen, setReplyOpen] = useState(false);
  const emails = useListWhere<any>("emails", "thread_id", threadId, {
    order: "created_at",
    ascending: true,
  });
  const thread = useQuery({
    queryKey: ["email_threads", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("id,subject,company_id,contact_id,lead_id")
        .eq("id", threadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const subject = thread.data?.subject && thread.data.subject !== "(nincs tárgy)"
    ? thread.data.subject
    : "(nincs tárgy)";

  const emailIds = useMemo(
    () => (emails.data ?? []).map((e: any) => e.id as string),
    [emails.data],
  );

  const attachments = useQuery({
    queryKey: ["email_attachments", emailIds.join(",")],
    enabled: emailIds.length > 0,
    queryFn: async () => {
      // eslint-disable-next-line no-console
      console.log("[email-detail] attachments query INPUT", {
        threadId,
        emailIds,
        count: emailIds.length,
      });
      const { data, error } = await supabase
        .from("email_attachments")
        .select("id,email_id,filename,mime_type,size_bytes,r2_key,inline")
        .in("email_id", emailIds);
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[email-detail] attachments query ERROR", error);
        throw error;
      }
      // eslint-disable-next-line no-console
      console.log("[email-detail] attachments query RESULT", {
        threadId,
        emailIds,
        rowCount: (data ?? []).length,
        rows: data,
      });
      return data ?? [];
    },
  });
  const attByEmail = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of attachments.data ?? []) {
      const arr = m.get(a.email_id) ?? [];
      arr.push(a);
      m.set(a.email_id, arr);
    }
    return m;
  }, [attachments.data]);

  // CRM kapcsolat: thread-szintű company/contact/lead + bármelyik email project_id-ja
  const companyId = thread.data?.company_id ?? null;
  const contactId = thread.data?.contact_id ?? null;
  const leadId = thread.data?.lead_id ?? null;
  const projectId = useMemo(
    () => (emails.data ?? []).map((e: any) => e.project_id).find(Boolean) ?? null,
    [emails.data],
  );

  const crm = useQuery({
    queryKey: ["email_thread_crm", companyId, contactId, leadId, projectId],
    enabled: !!(companyId || contactId || leadId || projectId),
    queryFn: async () => {
      const out: { company?: any; contact?: any; lead?: any; project?: any } = {};
      const tasks: Array<PromiseLike<any>> = [];
      if (companyId)
        tasks.push(
          supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle()
            .then((r) => { out.company = r.data; }),
        );
      if (contactId)
        tasks.push(
          supabase.from("contacts").select("id,full_name,email").eq("id", contactId).maybeSingle()
            .then((r) => { out.contact = r.data; }),
        );
      if (leadId)
        tasks.push(
          supabase.from("leads").select("id,title").eq("id", leadId).maybeSingle()
            .then((r) => { out.lead = r.data; }),
        );
      if (projectId)
        tasks.push(
          supabase.from("projects").select("id,name").eq("id", projectId).maybeSingle()
            .then((r) => { out.project = r.data; }),
        );
      await Promise.all(tasks);
      return out;
    },
  });

  // Debug — felhasználói kérésre
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log("[email-detail] threadId=", threadId, {
      emails: (emails.data ?? []).length,
      attachments: (attachments.data ?? []).length,
      company_id: companyId,
      contact_id: contactId,
      lead_id: leadId,
      project_id: projectId,
      thread: thread.data,
    });
    for (const e of (emails.data ?? [])) {
      // eslint-disable-next-line no-console
      console.log("[email-detail] message", e.id, {
        to_email: e.to_email,
        to_emails: e.to_emails,
        cc_emails: e.cc_emails,
        bcc_emails: e.bcc_emails,
        from_email: e.from_email,
        project_id: e.project_id,
      });
    }
  }, [threadId, emails.data, attachments.data, companyId, contactId, leadId, projectId, thread.data]);

  const handleDownload = async (key: string, filename: string) => {
    try {
      const { url } = await r2PresignDownload({ data: { key } });
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e: any) {
      toast.error("Letöltés sikertelen", { description: e?.message ?? String(e) });
    }
  };

  // RLS szűr szerver oldalon; ha a user nem hozzáférő, a lista üres.
  const visibleEmails = emails.data ?? [];
  const last: any = visibleEmails[visibleEmails.length - 1];
  const defaultReplyTo = last?.from_email ?? "";
  const replySubject = subject?.startsWith("Re:") ? subject : `Re: ${subject}`;

  const crmRows: { icon: any; label: string; value: string; to?: any; params?: any }[] = [];
  if (crm.data?.company)
    crmRows.push({ icon: Building2, label: "Cég", value: crm.data.company.name, to: "/companies/$id", params: { id: crm.data.company.id } });
  if (crm.data?.contact)
    crmRows.push({ icon: User, label: "Kapcsolattartó", value: crm.data.contact.full_name ?? crm.data.contact.email ?? "—", to: "/contacts/$id", params: { id: crm.data.contact.id } });
  if (crm.data?.lead)
    crmRows.push({ icon: Target, label: "Lead", value: crm.data.lead.title ?? "Lead", to: "/leads/$id", params: { id: crm.data.lead.id } });
  if (crm.data?.project)
    crmRows.push({ icon: Briefcase, label: "Projekt", value: crm.data.project.name, to: "/projects/$id", params: { id: crm.data.project.id } });

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <div className="mx-auto w-full max-w-[900px]">
          <Link to="/emails" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Vissza az emailekhez
          </Link>
          <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Email szál</div>
          <h1 className="mt-1 text-xl font-semibold flex items-center gap-2 break-words">
            <Mail className="h-5 w-5 text-primary shrink-0" />
            <span className="min-w-0 break-words">{subject}</span>
          </h1>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">{visibleEmails.length} üzenet a szálban</div>
            {visibleEmails.length > 0 && (
              <Button size="sm" onClick={() => setReplyOpen(true)}>
                <Reply className="mr-1.5 h-4 w-4" /> Válasz
              </Button>
            )}
          </div>
        </div>
      </div>
      <div className="px-6 py-6 mx-auto w-full max-w-[900px] space-y-4">
        <section className="rounded-lg border bg-card">
          <div className="border-b px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
            CRM kapcsolat
          </div>
          {crmRows.length === 0 ? (
            <div className="px-4 py-3 text-xs text-muted-foreground">
              Ehhez a szálhoz még nincs cég, kapcsolattartó, lead vagy projekt hozzárendelve.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4">
              {crmRows.map((r) => {
                const Icon = r.icon;
                const body = (
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.label}</div>
                      <div className="text-sm font-medium truncate">{r.value}</div>
                    </div>
                  </div>
                );
                return r.to ? (
                  <Link key={r.label} to={r.to} params={r.params as any} className="rounded-md border bg-background px-3 py-2 hover:bg-muted/40 transition-colors">
                    {body}
                  </Link>
                ) : (
                  <div key={r.label} className="rounded-md border bg-background px-3 py-2">{body}</div>
                );
              })}
            </div>
          )}
        </section>

        {emails.isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : visibleEmails.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Nincs megjeleníthető üzenet"
            description="Ehhez a szálhoz nincs jogosultságod, vagy üres."
          />
        ) : (
          <ol className="space-y-4">
            {visibleEmails.map((e: any) => (
              <li key={e.id} className="rounded-lg border bg-card shadow-sm">
                <div className="border-b px-4 py-3 space-y-1.5 bg-muted/30">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div className="min-w-0 text-sm font-medium truncate">
                      <span className="uppercase tracking-wider text-muted-foreground text-[10px] mr-2">Feladó</span>
                      {e.from_email ?? "—"}
                    </div>
                    <time className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {fmtDateTime(e.internal_date ?? e.created_at)}
                    </time>
                  </div>
                  <div className="space-y-0.5">
                    <AddrList
                      label="Címzett"
                      items={(e.to_emails && e.to_emails.length > 0) ? e.to_emails : (e.to_email ? [e.to_email] : [])}
                      showEmpty
                    />
                    <AddrList label="Másolat" items={e.cc_emails} showEmpty />
                    <AddrList label="Titkos" items={e.bcc_emails} showEmpty />
                  </div>
                </div>
                <div className="px-4 py-4">
                  <EmailBody body={e.body} />
                </div>
                <div className="border-t bg-muted/20 px-4 py-3">
                  <div className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                    <Paperclip className="h-3.5 w-3.5" />
                    {(attByEmail.get(e.id) ?? []).length} csatolmány
                  </div>
                  {(attByEmail.get(e.id) ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">Nincs csatolmány ehhez az üzenethez.</div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {(attByEmail.get(e.id) ?? []).map((a: any) => {
                        const Icon = attachmentIcon(a.mime_type);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => handleDownload(a.r2_key, a.filename)}
                            className="group flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-left hover:border-primary/50 hover:bg-muted/40 transition-colors min-w-0"
                            title={a.filename}
                          >
                            <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium">{a.filename}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {fmtBytes(a.size_bytes)}
                                {a.mime_type ? ` · ${a.mime_type}` : ""}
                              </div>
                            </div>
                            <Download className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      {visibleEmails.length > 0 && (
        <EmailComposer
          open={replyOpen}
          onOpenChange={setReplyOpen}
          defaultTo={defaultReplyTo}
          defaultSubject={replySubject}
          threadId={threadId}
        />
      )}
    </div>
  );
}