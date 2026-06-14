import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ChevronLeft, Reply, Building2, User, Briefcase, Target,
  ChevronDown, ChevronUp, Mail, ImageOff,
} from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { EmailBody } from "@/components/emails/email-body";
import { EmailHtmlFrame } from "@/components/emails/email-html-frame";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueries } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { r2PresignDownload } from "@/lib/r2.functions";
import { toast } from "sonner";
import { EmailComposer } from "@/components/emails/email-composer";
import { EmailThreadProjectPicker } from "@/components/emails/email-thread-project-picker";
import { AttachmentGrid } from "@/components/emails/attachment-grid";

export const Route = createFileRoute("/_authenticated/emails/$threadId")({
  component: EmailThread,
});

function looksLikeHtml(s: string): boolean {
  const head = (s ?? "").slice(0, 2000);
  return /<\s*(html|body|div|p|a|table|span|br|img|h[1-6]|ul|ol|li|strong|em|style|meta|head|tbody|tr|td|font)\b/i.test(head);
}

/** Leválasztja az utolsó idézett blokkot (gmail_quote vagy hosszú blockquote). */
function splitQuotedHtml(html: string): { main: string; quoted: string | null } {
  if (typeof window === "undefined") return { main: html, quoted: null };
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let quoted: Element | null = doc.querySelector(".gmail_quote, blockquote.gmail_quote");
    if (!quoted) {
      const bqs = doc.querySelectorAll("blockquote");
      if (bqs.length > 0) {
        const last = bqs[bqs.length - 1];
        if ((last.textContent ?? "").length > 200) quoted = last;
      }
    }
    if (!quoted) return { main: html, quoted: null };
    const quotedHtml = quoted.outerHTML;
    quoted.remove();
    return { main: doc.documentElement.outerHTML, quoted: quotedHtml };
  } catch {
    return { main: html, quoted: null };
  }
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

function parseName(addr: string | null | undefined): { name: string; email: string } {
  const s = (addr ?? "").trim();
  if (!s) return { name: "", email: "" };
  const m = s.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: "", email: s };
}

function initials(s: string): string {
  const t = (s ?? "").trim();
  if (!t) return "?";
  const at = t.indexOf("@");
  const base = at > 0 ? t.slice(0, at) : t;
  const parts = base.split(/[.\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = [210, 260, 330, 20, 140, 180, 300, 40, 90, 240];
  return hues[h % hues.length];
}

function EmailThread() {
  const { threadId } = Route.useParams();
  const [replyOpen, setReplyOpen] = useState(false);
  const emails = useListWhere<any>("emails", "thread_id", threadId, {
    order: "created_at",
    ascending: true,
  });
  // Megnyitas utan a szal osszes email-jet jelöljük olvasottnak (UNREAD label
  // levetele a DB-ben). Ezzel a lista, a workspace es a thread nezet ugyanazt
  // mutatja. Gmail-szinkron kulonalo lepes.
  useEffect(() => {
    const rows = emails.data ?? [];
    const unread = rows.filter((e: any) =>
      Array.isArray(e.gmail_label_ids) && e.gmail_label_ids.includes("UNREAD"),
    );
    if (unread.length === 0) return;
    void (async () => {
      for (const e of unread) {
        const next = (e.gmail_label_ids ?? []).filter((l: string) => l !== "UNREAD");
        await supabase.from("emails").update({ gmail_label_ids: next }).eq("id", e.id);
      }
    })();
  }, [emails.data]);
  const thread = useQuery({
    queryKey: ["email_threads", threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("id,subject,gmail_thread_id,company_id,contact_id,lead_id")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKeys, presigns.map((p) => p.data).join("|")]);

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
        tasks.push(supabase.from("companies").select("id,name").eq("id", companyId).maybeSingle().then((r) => { out.company = r.data; }));
      if (contactId)
        tasks.push(supabase.from("contacts").select("id,name,email").eq("id", contactId).maybeSingle().then((r) => { out.contact = r.data; }));
      if (leadId)
        tasks.push(supabase.from("leads").select("id,summary").eq("id", leadId).maybeSingle().then((r) => { out.lead = r.data; }));
      if (projectId)
        tasks.push(supabase.from("projects").select("id,title").eq("id", projectId).maybeSingle().then((r) => { out.project = r.data; }));
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
    crmRows.push({ icon: User, label: "Kapcsolattartó", value: crm.data.contact.name ?? crm.data.contact.email ?? "—", to: "/contacts/$id", params: { id: crm.data.contact.id } });
  if (crm.data?.lead)
    crmRows.push({ icon: Target, label: "Érdeklődő", value: crm.data.lead.summary ?? "Érdeklődő", to: "/leads/$id", params: { id: crm.data.lead.id } });
  if (crm.data?.project)
    crmRows.push({ icon: Briefcase, label: "Projekt", value: (crm.data.project as any).title ?? "Projekt", to: "/projects/$id", params: { id: crm.data.project.id } });

  return (
    <div className="flex flex-col">
      {/* Header bar: vissza · tárgy · projekt chip · válasz */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-2">
        <div className="mx-auto w-full max-w-[1400px] flex items-center gap-3">
          <Link to="/emails" className="text-muted-foreground hover:text-foreground inline-flex items-center shrink-0" title="Vissza">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <h1 className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{subject}</h1>
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            <EmailThreadProjectPicker threadId={threadId} variant="chip" />
          </div>
          {visibleEmails.length > 0 && (
            <Button size="sm" onClick={() => setReplyOpen(true)} className="shrink-0">
              <Reply className="mr-1.5 h-4 w-4" /> Válasz
            </Button>
          )}
        </div>
        {/* mobil: project chip külön sorban */}
        <div className="sm:hidden mt-2">
          <EmailThreadProjectPicker threadId={threadId} variant="chip" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1400px] px-3 py-3 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4">
        {/* Bal: email olvasó */}
        <div className="min-w-0 space-y-2">
          {emails.isLoading ? (
            <p className="text-sm text-muted-foreground">Betöltés…</p>
          ) : visibleEmails.length === 0 ? (
            <EmptyState
              icon={Mail}
              title="Nincs megjeleníthető üzenet"
              description="Ehhez a szálhoz nincs jogosultságod, vagy üres."
            />
          ) : (
            <ol className="space-y-2">
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

        {/* Sidebar: CRM kapcsolatok */}
        <aside className="space-y-2 lg:sticky lg:top-16 self-start w-full">
          {crmRows.length === 0 ? (
            <div className="rounded-lg border bg-card p-3 text-xs text-muted-foreground">
              Nincs CRM-kapcsolat ehhez a szálhoz.
            </div>
          ) : (
            crmRows.map((r) => {
              const Icon = r.icon;
              const body = (
                <div className="p-2.5">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                    <Icon className="h-3 w-3" />
                    {r.label}
                  </div>
                  <div className="text-[13px] font-medium truncate">{r.value}</div>
                </div>
              );
              return r.to ? (
                <Link
                  key={r.label}
                  to={r.to}
                  params={r.params as any}
                  className="block rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition"
                >
                  {body}
                </Link>
              ) : (
                <div key={r.label} className="rounded-lg border bg-card">{body}</div>
              );
            })
          )}
        </aside>
      </div>

      {visibleEmails.length > 0 && (
        <EmailComposer
          open={replyOpen}
          onOpenChange={setReplyOpen}
          defaultTo={defaultReplyTo}
          defaultSubject={replySubject}
          gmailThreadId={thread.data?.gmail_thread_id ?? undefined}
          companyId={thread.data?.company_id ?? undefined}
          contactId={thread.data?.contact_id ?? undefined}
          leadId={thread.data?.lead_id ?? undefined}
          onSent={() => window.location.reload()}
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
  const [showQuoted, setShowQuoted] = useState(false);

  const toItems: string[] = (e.to_emails && e.to_emails.length > 0)
    ? e.to_emails
    : (e.to_email ? [e.to_email] : []);
  const cc: string[] = e.cc_emails ?? [];
  const bcc: string[] = e.bcc_emails ?? [];
  const fromRaw: string = e.from_email ?? "—";
  const fromParsed = parseName(fromRaw);
  const fromDisplay = fromParsed.name || fromParsed.email || "—";
  const date = fmtDateTime(e.internal_date ?? e.created_at);
  const hue = avatarHue(fromParsed.email || fromDisplay);

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

  const [refreshedBody, setRefreshedBody] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => { setRefreshedBody(null); }, [e.id]);
  useEffect(() => {
    if (refreshedBody !== null || refreshing) return;
    if (!e.gmail_message_id) return;
    if (looksLikeHtml(body)) return;
    let cancelled = false;
    (async () => {
      try {
        setRefreshing(true);
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) return;
        const r = await fetch("/api/gmail/refresh-body", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ emailId: e.id }),
        });
        const j = r.ok ? await r.json().catch(() => null) : null;
        if (!cancelled) setRefreshedBody(String(j?.body ?? body ?? ""));
      } catch { /* ignore */ }
      finally { if (!cancelled) setRefreshing(false); }
    })();
    return () => { cancelled = true; };
  }, [e.id, e.gmail_message_id, body, refreshedBody, refreshing]);

  const effectiveBody = refreshedBody ?? body;
  const isHtml = looksLikeHtml(effectiveBody);

  // Idézett rész leválasztása (HTML útvonalon — a plain text path-ot az EmailBody intézi)
  const { mainHtml, quotedHtml } = useMemo(() => {
    if (!isHtml) return { mainHtml: effectiveBody, quotedHtml: null as string | null };
    const { main, quoted } = splitQuotedHtml(effectiveBody);
    return { mainHtml: main, quotedHtml: quoted };
  }, [isHtml, effectiveBody]);

  const hasRemote = useMemo(
    () => isHtml && /<img\b[^>]*\bsrc\s*=\s*["']https?:\/\//i.test(mainHtml),
    [isHtml, mainHtml],
  );

  return (
    <li className="rounded-lg border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group w-full text-left px-3 py-2 flex items-start gap-2.5 cursor-pointer hover:bg-muted/60 transition-colors"
        title={open ? "Üzenet összecsukása" : "Üzenet megnyitása"}
        aria-expanded={open}
      >
        <div
          className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0"
          style={{
            backgroundColor: `hsl(${hue} 70% 92%)`,
            color: `hsl(${hue} 55% 30%)`,
          }}
        >
          {initials(fromParsed.name || fromParsed.email || "?")}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0 text-[13px] font-semibold truncate">
              {fromDisplay}
              {fromParsed.name && (
                <span className="ml-1.5 font-normal text-muted-foreground text-[12px]">
                  &lt;{fromParsed.email}&gt;
                </span>
              )}
            </div>
            <time className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">{date}</time>
          </div>
          {open ? (
            <div className="mt-1 space-y-0.5">
              <AddrRow label="Címzett" items={toItems} />
              <AddrRow label="Másolat" items={cc} />
              <AddrRow label="Titkos" items={bcc} />
            </div>
          ) : (
            <div className="text-[12px] text-muted-foreground truncate">
              címzett: {toItems.join(", ") || "—"}
            </div>
          )}
        </div>
        <span className="text-muted-foreground group-hover:text-foreground shrink-0 mt-1 transition-colors">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <>
          {/* Body */}
          <div className="border-t">
            {isHtml && hasRemote && !showRemote && (
              <div className="flex items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-[12px] dark:bg-amber-950/40 dark:border-amber-900">
                <span className="inline-flex items-center gap-1.5 text-amber-900 dark:text-amber-200">
                  <ImageOff className="h-3.5 w-3.5" />
                  Külső képek le vannak tiltva (adatvédelem).
                </span>
                <button
                  type="button"
                  onClick={() => setShowRemote(true)}
                  className="font-medium text-amber-900 hover:underline dark:text-amber-100"
                >
                  Képek megjelenítése
                </button>
              </div>
            )}
            <div className="px-3 py-3">
              {refreshing && (
                <div className="mb-2 inline-flex items-center gap-1.5 rounded border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                  Eredeti HTML frissítése…
                </div>
              )}
              {effectiveBody && effectiveBody.trim() ? (
                isHtml ? (
                <>
                  <EmailHtmlFrame
                    html={mainHtml}
                    inlineByCid={inlineByCid}
                    showRemoteImages={showRemote}
                  />
                  {quotedHtml && (
                    <div className="mt-2">
                      <button
                        type="button"
                        onClick={() => setShowQuoted((v) => !v)}
                        className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded border bg-muted/30 px-1.5 py-0.5 leading-none"
                        title={showQuoted ? "Előzmény elrejtése" : "Előzmény mutatása"}
                      >
                        ···
                      </button>
                      {showQuoted && (
                        <div className="mt-2 border-l-2 border-muted pl-2">
                          <EmailHtmlFrame
                            html={quotedHtml}
                            inlineByCid={inlineByCid}
                            showRemoteImages={showRemote}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </>
                ) : (
                <EmailBody body={effectiveBody} inlineByCid={inlineByCid} />
                )
              ) : refreshing ? (
                <div className="text-sm text-muted-foreground italic">Tartalom betöltése…</div>
              ) : (
                <div className="text-sm text-muted-foreground italic">(nincs tartalom)</div>
              )}
            </div>
          </div>

          {/* Csatolmányok a body ALATT, Gmail-szerű kártyák + lightbox */}
          {realAttachments.length > 0 && (
            <AttachmentGrid
              attachments={realAttachments}
              urlByKey={urlByKey}
              onDownload={onDownload}
            />
          )}
        </>
      )}
    </li>
  );
}