import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Mail, ChevronLeft, Paperclip, Download, Reply, Building2, User, Briefcase, Target,
  FileText, Image as ImageIcon, FileSpreadsheet, FileArchive, ChevronDown, ChevronUp,
} from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { EmailBody } from "@/components/emails/email-body";
import { EmailHtmlFrame } from "@/components/emails/email-html-frame";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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

function looksLikeHtml(s: string): boolean {
  const head = (s ?? "").slice(0, 2000);
  return /<\s*(html|body|div|p|a|table|span|br|img|h[1-6]|ul|ol|li|strong|em|style|meta|head|tbody|tr|td|font)\b/i.test(head);
}

function AddrRow({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex gap-2 text-[12px] leading-relaxed">
      <span className="shrink-0 w-12 text-muted-foreground">{label}:</span>
      <span className="min-w-0 break-words text-foreground/85">{items.join(", ")}</span>
    </div>
  );
}

function initials(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "?";
  const at = t.indexOf("@");
  const base = at > 0 ? t.slice(0, at) : t;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
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
      const { data, error } = await supabase
        .from("email_attachments")
        .select("id,email_id,filename,mime_type,size_bytes,r2_key,inline,content_id")
        .in("email_id", emailIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Csak nem-inline → attachment panel. Inline → cid map a body-hoz.
  const realAttByEmail = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of attachments.data ?? []) {
      if (a.inline) continue;
      const arr = m.get(a.email_id) ?? [];
      arr.push(a);
      m.set(a.email_id, arr);
    }
    return m;
  }, [attachments.data]);

  const inlineByEmail = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const a of attachments.data ?? []) {
      if (!a.inline) continue;
      const arr = m.get(a.email_id) ?? [];
      arr.push(a);
      m.set(a.email_id, arr);
    }
    return m;
  }, [attachments.data]);

  // Presign URL minden megjelenítendő (kép-előnézet + inline) attachmenthez.
  // Kép előnézetek: nem-inline image/*. Inline: bármi (cid map).
  const previewKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const a of attachments.data ?? []) {
      if (a.inline) {
        if (a.r2_key) keys.add(a.r2_key);
      } else if ((a.mime_type ?? "").toLowerCase().startsWith("image/") && a.r2_key) {
        keys.add(a.r2_key);
      }
    }
    return Array.from(keys);
  }, [attachments.data]);

  const presigns = useQueries({
    queries: previewKeys.map((key) => ({
      queryKey: ["r2-presign", key],
      staleTime: 10 * 60 * 1000,
      queryFn: async () => {
        const { url } = await r2PresignDownload({ data: { key } });
        return url as string;
      },
    })),
  });
  const urlByKey = useMemo(() => {
    const m = new Map<string, string>();
    previewKeys.forEach((k, i) => {
      const u = presigns[i]?.data;
      if (u) m.set(k, u);
    });
    return m;
  }, [previewKeys, presigns.map((p) => p.data).join("|")]);

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
      <div className="border-b bg-background px-4 py-3">
        <div className="mx-auto w-full max-w-[1200px] flex items-center justify-between gap-3">
          <Link to="/emails" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ChevronLeft className="h-3.5 w-3.5" /> Vissza
          </Link>
          {visibleEmails.length > 0 && (
            <Button size="sm" onClick={() => setReplyOpen(true)}>
              <Reply className="mr-1.5 h-4 w-4" /> Válasz
            </Button>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1200px] px-4 py-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5">
        {/* Bal oldal: email olvasó */}
        <div className="min-w-0 space-y-4">
          <h1 className="text-[22px] font-normal text-foreground/90 flex items-start gap-2 break-words">
            <Mail className="h-5 w-5 mt-1.5 text-muted-foreground shrink-0" />
            <span className="min-w-0 break-words">{subject}</span>
          </h1>

          {emails.isLoading ? (
            <p className="text-sm text-muted-foreground">Betöltés…</p>
          ) : visibleEmails.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nincs megjeleníthető üzenet"
              description="Ehhez a szálhoz nincs jogosultságod, vagy üres."
            />
          ) : (
            <ol className="space-y-3">
              {visibleEmails.map((e: any, idx: number) => {
                const isLast = idx === visibleEmails.length - 1;
                return (
                  <MessageCard
                    key={e.id}
                    email={e}
                    defaultOpen={isLast}
                    realAttachments={realAttByEmail.get(e.id) ?? []}
                    inlineAttachments={inlineByEmail.get(e.id) ?? []}
                    urlByKey={urlByKey}
                    onDownload={handleDownload}
                  />
                );
              })}
            </ol>
          )}
        </div>

        {/* Jobb sidebar: CRM */}
        <aside className="space-y-4 lg:sticky lg:top-4 self-start">
          <section className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              CRM kapcsolat
            </div>
            {crmRows.length === 0 ? (
              <div className="px-3 py-3 text-xs text-muted-foreground">
                Nincs cég / kapcsolattartó / lead / projekt hozzárendelve.
              </div>
            ) : (
              <div className="p-2 space-y-1">
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
                    <Link key={r.label} to={r.to} params={r.params as any} className="block rounded-md px-2 py-1.5 hover:bg-muted/60 transition-colors">
                      {body}
                    </Link>
                  ) : (
                    <div key={r.label} className="rounded-md px-2 py-1.5">{body}</div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-lg border bg-card">
            <div className="border-b px-3 py-2 text-[11px] uppercase tracking-wider text-muted-foreground">
              Szál
            </div>
            <div className="px-3 py-2 text-xs text-muted-foreground">
              {visibleEmails.length} üzenet
            </div>
          </section>
        </aside>
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

function MessageCard({
  email: e,
  defaultOpen,
  realAttachments,
  inlineAttachments,
  urlByKey,
  onDownload,
}: {
  email: any;
  defaultOpen: boolean;
  realAttachments: any[];
  inlineAttachments: any[];
  urlByKey: Map<string, string>;
  onDownload: (key: string, filename: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [showRemote, setShowRemote] = useState(false);
  const [hasRemote, setHasRemote] = useState(false);

  const toItems: string[] = (e.to_emails && e.to_emails.length > 0)
    ? e.to_emails
    : (e.to_email ? [e.to_email] : []);
  const cc: string[] = e.cc_emails ?? [];
  const bcc: string[] = e.bcc_emails ?? [];
  const from: string = e.from_email ?? "—";
  const date = fmtDateTime(e.internal_date ?? e.created_at);

  const inlineByCid = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of inlineAttachments) {
      const url = a.r2_key ? urlByKey.get(a.r2_key) : undefined;
      if (!url) continue;
      if (a.content_id) m.set(String(a.content_id).replace(/[<>]/g, ""), url);
    }
    return m;
  }, [inlineAttachments, urlByKey]);

  const body: string = e.body ?? "";
  const isHtml = looksLikeHtml(body);

  return (
    <li className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Gmail-szerű header: összecsukva 1 sor, kinyitva részletek */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/30 transition-colors"
      >
        <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
          {initials(from)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 text-sm font-medium truncate">{from}</div>
            <time className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{date}</time>
          </div>
          {open ? (
            <div className="mt-1.5 space-y-0.5">
              <AddrRow label="Címzett" items={toItems} />
              <AddrRow label="Másolat" items={cc} />
              <AddrRow label="Titkos" items={bcc} />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground truncate">
              címzett: {toItems.join(", ") || "—"}
            </div>
          )}
        </div>
        <span className="text-muted-foreground shrink-0 mt-1">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <>
          {/* Csatolmány panel a body FELETT, Gmail stílusban */}
          {realAttachments.length > 0 && (
            <div className="border-t bg-muted/20 px-4 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Paperclip className="h-3.5 w-3.5" />
                {realAttachments.length} csatolmány
              </div>
              <div className="flex flex-wrap gap-2">
                {realAttachments.map((a) => {
                  const isImg = (a.mime_type ?? "").toLowerCase().startsWith("image/");
                  const previewUrl = isImg && a.r2_key ? urlByKey.get(a.r2_key) : undefined;
                  const Icon = attachmentIcon(a.mime_type);
                  return (
                    <div
                      key={a.id}
                      className="group relative w-[220px] rounded-lg border bg-background overflow-hidden hover:border-primary/40 hover:shadow-sm transition"
                      title={a.filename}
                    >
                      <div className="h-[120px] bg-muted/40 flex items-center justify-center overflow-hidden">
                        {previewUrl ? (
                          // eslint-disable-next-line jsx-a11y/alt-text
                          <img src={previewUrl} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <Icon className="h-10 w-10 text-muted-foreground" />
                        )}
                      </div>
                      <div className="px-2.5 py-2 border-t flex items-center gap-2 min-w-0">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-medium">{a.filename}</div>
                          <div className="truncate text-[11px] text-muted-foreground">
                            {fmtBytes(a.size_bytes)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onDownload(a.r2_key, a.filename)}
                          className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Letöltés"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Body */}
          <div className="border-t">
            {isHtml && hasRemote && !showRemote && (
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2 text-xs">
                <span className="text-muted-foreground">Külső képek letiltva (adatvédelem).</span>
                <button
                  type="button"
                  onClick={() => setShowRemote(true)}
                  className="font-medium text-primary hover:underline"
                >
                  Képek megjelenítése
                </button>
              </div>
            )}
            <div className="px-4 py-4">
              {isHtml ? (
                <EmailHtmlFrame
                  html={body}
                  inlineByCid={inlineByCid}
                  showRemoteImages={showRemote}
                  onHasRemoteImages={setHasRemote}
                />
              ) : (
                <EmailBody body={body} inlineByCid={inlineByCid} />
              )}
            </div>
          </div>
        </>
      )}
    </li>
  );
}