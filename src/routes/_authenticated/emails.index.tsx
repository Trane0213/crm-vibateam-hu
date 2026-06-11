import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Inbox, Send, Reply as ReplyIcon, Files, Bot, PenSquare, Paperclip, Briefcase } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { fmtDateTime } from "@/components/resource/resource-page";
import { emailPreview } from "@/components/emails/email-body";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmailComposer } from "@/components/emails/email-composer";
import { usePermissions } from "@/hooks/use-permissions";

type EmailRow = {
  id: string;
  thread_id: string | null;
  from_email: string | null;
  to_email: string | null;
  to_emails: string[] | null;
  body: string | null;
  summary: string | null;
  snippet: string | null;
  created_at: string;
  internal_date: string | null;
  is_outbound: boolean | null;
  gmail_label_ids: string[] | null;
};

type ThreadRow = {
  id: string;
  subject: string | null;
  gmail_thread_id: string | null;
  last_message_at: string | null;
  participants: string[] | null;
  gmail_label_ids: string[] | null;
  project_id: string | null;
};

function norm(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
}

function parseName(addr: string | null | undefined): { name: string; email: string } {
  const s = (addr ?? "").trim();
  if (!s) return { name: "", email: "" };
  // "Név <a@b.hu>" formátum
  const m = s.match(/^\s*"?([^"<]+?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim(), email: m[2].trim().toLowerCase() };
  return { name: "", email: s.toLowerCase() };
}

function initialsOf(name: string, email: string): string {
  const src = name || email.split("@")[0] || "";
  const parts = src.split(/[.\s_-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function avatarHue(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hues = [210, 260, 330, 20, 140, 180, 300, 40, 90, 240];
  return hues[h % hues.length];
}

function displayName(addr: string | null | undefined): string {
  const p = parseName(addr);
  return p.name || p.email || "—";
}

function EmailsPage() {
  const { profile, role } = usePermissions();
  const isOwner = role === "owner";
  const myMailbox = norm((profile as any)?.gmail_email ?? (profile as any)?.email ?? null);

  const ourMailboxes = useQuery({
    queryKey: ["users_profile", "mailboxes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("gmail_email,email");
      if (error) throw error;
      const s = new Set<string>();
      for (const r of (data ?? []) as any[]) {
        const a = norm(r.gmail_email);
        const b = norm(r.email);
        if (a) s.add(a);
        if (b) s.add(b);
      }
      return s;
    },
  });

  const emails = useQuery({
    queryKey: ["emails", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("emails")
        .select("id,thread_id,from_email,to_email,to_emails,body,summary,snippet,created_at,internal_date,is_outbound,gmail_label_ids")
        .order("internal_date", { ascending: false, nullsFirst: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as EmailRow[];
    },
  });

  const threads = useQuery({
    queryKey: ["email_threads", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_threads")
        .select("id,subject,gmail_thread_id,last_message_at,participants,gmail_label_ids,project_id");
      if (error) throw error;
      return (data ?? []) as ThreadRow[];
    },
  });

  const threadMap = useMemo(() => {
    const m = new Map<string, ThreadRow>();
    for (const t of threads.data ?? []) m.set(t.id, t);
    return m;
  }, [threads.data]);

  // Csatolmány-jelző a listához: nem-inline attachmentek thread-enként
  const visibleEmailIds = useMemo(
    () => (emails.data ?? []).map((e) => e.id),
    [emails.data],
  );
  const attachCounts = useQuery({
    queryKey: ["emails", "attach_flags", visibleEmailIds.length],
    enabled: visibleEmailIds.length > 0,
    queryFn: async () => {
      const set = new Set<string>(); // email_id-k, ahol van nem-inline csatolmány
      // chunked IN(...) max 1000
      for (let i = 0; i < visibleEmailIds.length; i += 1000) {
        const chunk = visibleEmailIds.slice(i, i + 1000);
        const { data, error } = await supabase
          .from("email_attachments")
          .select("email_id,inline")
          .in("email_id", chunk);
        if (error) throw error;
        for (const r of data ?? []) if (!(r as any).inline) set.add((r as any).email_id);
      }
      return set;
    },
  });

  // Projekt nevek a chip-hez
  const projectIds = useMemo(() => {
    const s = new Set<string>();
    for (const t of threads.data ?? []) if (t.project_id) s.add(t.project_id);
    return Array.from(s);
  }, [threads.data]);
  const projectMap = useQuery({
    queryKey: ["projects", "thread_chips", projectIds.join(",")],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects").select("id,title,name").in("id", projectIds);
      if (error) throw error;
      const m = new Map<string, string>();
      for (const p of data ?? []) m.set((p as any).id, (p as any).title ?? (p as any).name ?? "—");
      return m;
    },
  });

  // A jogosultság szerver oldalon (RLS) érvényesül – a query csak azokat hozza vissza,
  // amelyek hozzáférhetők. Itt nem szűrünk újra.
  const visibleEmails = emails.data ?? [];

  type ThreadAgg = {
    threadId: string;
    subject: string;
    last: EmailRow;
    count: number;
    participants: Set<string>;
    lastIsInbound: boolean;
    labels: Set<string>;
    isAutomated: boolean;
    hasAttachments: boolean;
    unread: boolean;
    projectId: string | null;
  };

  const ours = ourMailboxes.data ?? new Set<string>();
  const isOurs = (addr: string | null) => {
    const a = norm(addr);
    if (!a) return false;
    if (ours.has(a)) return true;
    for (const o of ours) if (a.includes(o)) return true;
    return false;
  };

  const AUTO_LABELS = new Set([
    "CATEGORY_PROMOTIONS",
    "CATEGORY_UPDATES",
    "CATEGORY_SOCIAL",
    "CATEGORY_FORUMS",
  ]);

  const attachSet = attachCounts.data ?? new Set<string>();

  const grouped = useMemo<ThreadAgg[]>(() => {
    const map = new Map<string, ThreadAgg>();
    for (const e of visibleEmails) {
      const key = e.thread_id ?? `__solo_${e.id}`;
      const t = threadMap.get(e.thread_id ?? "");
      const subject = t?.subject && t.subject !== "(nincs tárgy)" ? t.subject : "(nincs tárgy)";
      const cur = map.get(key);
      const labels = new Set<string>(e.gmail_label_ids ?? []);
      const hasAtt = attachSet.has(e.id);
      const isUnread = labels.has("UNREAD");
      if (!cur) {
        map.set(key, {
          threadId: e.thread_id ?? "",
          subject,
          last: e,
          count: 1,
          participants: new Set(
            [norm(e.from_email), ...(e.to_emails ?? []).map(norm), norm(e.to_email)].filter(Boolean) as string[],
          ),
          lastIsInbound: !(e.is_outbound ?? false) && !isOurs(e.from_email),
          labels,
          isAutomated: Array.from(labels).some((l) => AUTO_LABELS.has(l)),
          hasAttachments: hasAtt,
          unread: isUnread,
          projectId: t?.project_id ?? null,
        });
      } else {
        cur.count++;
        if (e.from_email) cur.participants.add(norm(e.from_email));
        for (const a of e.to_emails ?? []) cur.participants.add(norm(a));
        for (const l of labels) cur.labels.add(l);
        if (Array.from(labels).some((l) => AUTO_LABELS.has(l))) cur.isAutomated = true;
        if (hasAtt) cur.hasAttachments = true;
        if (isUnread) cur.unread = true;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(b.last.internal_date ?? b.last.created_at).getTime() -
        new Date(a.last.internal_date ?? a.last.created_at).getTime(),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEmails, threadMap, ourMailboxes.data, attachSet]);

  const [tab, setTab] = useState<"inbox" | "sent" | "waiting" | "auto" | "all">("inbox");
  const [q, setQ] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);

  const filtered = useMemo(() => {
    let list = grouped;
    if (tab === "inbox") list = list.filter((g) => !g.isAutomated && !(g.last.is_outbound ?? false));
    else if (tab === "sent") list = list.filter((g) => g.last.is_outbound ?? isOurs(g.last.from_email));
    else if (tab === "waiting") list = list.filter((g) => g.lastIsInbound && !g.isAutomated);
    else if (tab === "auto") list = list.filter((g) => g.isAutomated);
    if (q.trim()) {
      const needle = q.trim().toLowerCase();
      list = list.filter(
        (g) =>
          g.subject.toLowerCase().includes(needle) ||
          Array.from(g.participants).some((p) => p.includes(needle)) ||
          (g.last.body ?? "").toLowerCase().includes(needle),
      );
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped, tab, q]);

  const counts = useMemo(() => {
    let inbox = 0, sent = 0, waiting = 0, auto = 0;
    for (const g of grouped) {
      if (g.isAutomated) auto++;
      else if (g.last.is_outbound ?? isOurs(g.last.from_email)) sent++;
      else inbox++;
      if (g.lastIsInbound && !g.isAutomated) waiting++;
    }
    return { inbox, sent, waiting, auto, all: grouped.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grouped]);

  const loading = emails.isLoading || threads.isLoading || ourMailboxes.isLoading;

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Emailek"
        description={
          isOwner
            ? "Minden mailbox – tulajdonosi nézet."
            : myMailbox
              ? `A te postafiókod: ${myMailbox}`
              : "Nincs Gmail postafiók a profilodhoz csatolva."
        }
        actions={
          <Button onClick={() => setComposeOpen(true)} disabled={!myMailbox && !isOwner}>
            <PenSquare className="mr-1.5 h-4 w-4" /> Új email
          </Button>
        }
      />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList>
              <TabsTrigger value="inbox" className="gap-1.5">
                <Inbox className="h-3.5 w-3.5" /> Beérkezett
                <Badge variant="secondary" className="ml-1">{counts.inbox}</Badge>
              </TabsTrigger>
              <TabsTrigger value="sent" className="gap-1.5">
                <Send className="h-3.5 w-3.5" /> Elküldött
                <Badge variant="secondary" className="ml-1">{counts.sent}</Badge>
              </TabsTrigger>
              <TabsTrigger value="waiting" className="gap-1.5">
                <ReplyIcon className="h-3.5 w-3.5" /> Válaszra vár
                <Badge variant="secondary" className="ml-1">{counts.waiting}</Badge>
              </TabsTrigger>
              <TabsTrigger value="auto" className="gap-1.5">
                <Bot className="h-3.5 w-3.5" /> Automatikus
                <Badge variant="secondary" className="ml-1">{counts.auto}</Badge>
              </TabsTrigger>
              <TabsTrigger value="all" className="gap-1.5">
                <Files className="h-3.5 w-3.5" /> Mind
                <Badge variant="secondary" className="ml-1">{counts.all}</Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="ml-auto w-full max-w-xs">
            <Input
              placeholder="Keresés tárgyban, feladóban, tartalomban…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Nincs megjeleníthető szál"
            description={
              !isOwner && !myMailbox
                ? "Csatold a Gmail fiókodat a Beállítások › Gmail menüpontban."
                : "Próbálj más fület vagy keresési kifejezést."
            }
          />
        ) : (
          <div className="rounded-md border bg-card divide-y">
            {filtered.map((g) => {
              // Másik fél: kívülről jövő üzenetnél a from, kimenőnél az első címzett
              const isOutbound = g.last.is_outbound ?? isOurs(g.last.from_email);
              const counterpartyAddr = isOutbound
                ? (g.last.to_emails?.[0] ?? g.last.to_email ?? "")
                : (g.last.from_email ?? "");
              const cp = parseName(counterpartyAddr);
              const cpDisplay = cp.name || cp.email || "—";
              const hue = avatarHue(cp.email || cpDisplay);
              const inits = initialsOf(cp.name, cp.email);
              const preview = emailPreview(g.last.body, g.last.snippet ?? g.last.summary, 140);
              const ts = g.last.internal_date ?? g.last.created_at;
              const projName = g.projectId ? projectMap.data?.get(g.projectId) : undefined;
              const inner = (
                <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors">
                  {/* olvasatlan jelző + avatar */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`h-2 w-2 rounded-full ${g.unread ? "bg-primary" : "bg-transparent"}`}
                      aria-label={g.unread ? "olvasatlan" : ""}
                    />
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold"
                      style={{
                        backgroundColor: `hsl(${hue} 70% 92%)`,
                        color: `hsl(${hue} 55% 30%)`,
                      }}
                    >
                      {inits}
                    </div>
                  </div>
                  {/* feladó név */}
                  <div className={`shrink-0 w-44 truncate text-[13px] ${g.unread ? "font-semibold text-foreground" : "text-foreground/80"}`}>
                    {cpDisplay}
                    {g.count > 1 && (
                      <span className="ml-1 text-muted-foreground font-normal">({g.count})</span>
                    )}
                  </div>
                  {/* tárgy + preview egy sorban */}
                  <div className="min-w-0 flex-1 truncate text-[13px]">
                    <span className={g.unread ? "font-semibold text-foreground" : "text-foreground/85"}>
                      {g.subject}
                    </span>
                    {preview && (
                      <span className="text-muted-foreground"> — {preview}</span>
                    )}
                  </div>
                  {/* jelzések */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {projName && (
                      <span
                        className="inline-flex max-w-[140px] items-center gap-1 truncate rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary"
                        title={`Projekt: ${projName}`}
                      >
                        <Briefcase className="h-3 w-3 shrink-0" />
                        <span className="truncate">{projName}</span>
                      </span>
                    )}
                    {g.hasAttachments && (
                      <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {g.lastIsInbound && !g.isAutomated && (
                      <span className="h-2 w-2 rounded-full bg-amber-500" title="Válasz vár" />
                    )}
                    <time className={`tabular-nums text-[11px] whitespace-nowrap w-20 text-right ${g.unread ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                      {fmtDateTime(ts)}
                    </time>
                  </div>
                </div>
              );
              return g.threadId ? (
                <Link
                  key={g.threadId}
                  to="/emails/$threadId"
                  params={{ threadId: g.threadId }}
                  className="block"
                >
                  {inner}
                </Link>
              ) : (
                <div key={g.last.id}>{inner}</div>
              );
            })}
          </div>
        )}
      </div>
      <EmailComposer open={composeOpen} onOpenChange={setComposeOpen} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/emails/")({
  component: EmailsPage,
});