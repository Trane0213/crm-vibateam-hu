import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Inbox, Send, Reply as ReplyIcon, Files } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, EmptyState } from "@/components/page-header";
import { fmtDateTime } from "@/components/resource/resource-page";
import { emailPreview } from "@/components/emails/email-body";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";

type EmailRow = {
  id: string;
  thread_id: string | null;
  from_email: string | null;
  to_email: string | null;
  body: string | null;
  summary: string | null;
  created_at: string;
};

type ThreadRow = { id: string; subject: string | null; gmail_thread_id: string | null };

function norm(e: string | null | undefined): string {
  return (e ?? "").trim().toLowerCase();
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
        .select("id,thread_id,from_email,to_email,body,summary,created_at")
        .order("created_at", { ascending: false })
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
        .select("id,subject,gmail_thread_id");
      if (error) throw error;
      return (data ?? []) as ThreadRow[];
    },
  });

  const threadMap = useMemo(() => {
    const m = new Map<string, ThreadRow>();
    for (const t of threads.data ?? []) m.set(t.id, t);
    return m;
  }, [threads.data]);

  const visibleEmails = useMemo(() => {
    const all = emails.data ?? [];
    if (isOwner) return all;
    if (!myMailbox) return [];
    return all.filter((e) => {
      const f = norm(e.from_email);
      const t = norm(e.to_email);
      return f === myMailbox || t === myMailbox || f.includes(myMailbox) || t.includes(myMailbox);
    });
  }, [emails.data, isOwner, myMailbox]);

  type ThreadAgg = {
    threadId: string;
    subject: string;
    last: EmailRow;
    count: number;
    participants: Set<string>;
    lastIsInbound: boolean;
  };

  const ours = ourMailboxes.data ?? new Set<string>();
  const isOurs = (addr: string | null) => {
    const a = norm(addr);
    if (!a) return false;
    if (ours.has(a)) return true;
    for (const o of ours) if (a.includes(o)) return true;
    return false;
  };

  const grouped = useMemo<ThreadAgg[]>(() => {
    const map = new Map<string, ThreadAgg>();
    for (const e of visibleEmails) {
      const key = e.thread_id ?? `__solo_${e.id}`;
      const t = threadMap.get(e.thread_id ?? "");
      const subject = t?.subject && t.subject !== "(nincs tárgy)" ? t.subject : "(nincs tárgy)";
      const cur = map.get(key);
      if (!cur) {
        map.set(key, {
          threadId: e.thread_id ?? "",
          subject,
          last: e,
          count: 1,
          participants: new Set(
            [norm(e.from_email), norm(e.to_email)].filter(Boolean) as string[],
          ),
          lastIsInbound: !isOurs(e.from_email),
        });
      } else {
        cur.count++;
        if (e.from_email) cur.participants.add(norm(e.from_email));
        if (e.to_email) cur.participants.add(norm(e.to_email));
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.last.created_at).getTime() - new Date(a.last.created_at).getTime(),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleEmails, threadMap, ourMailboxes.data]);

  const [tab, setTab] = useState<"inbox" | "sent" | "waiting" | "all">("inbox");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    let list = grouped;
    if (tab === "inbox") list = list.filter((g) => !isOurs(g.last.from_email));
    else if (tab === "sent") list = list.filter((g) => isOurs(g.last.from_email));
    else if (tab === "waiting") list = list.filter((g) => g.lastIsInbound);
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
    let inbox = 0, sent = 0, waiting = 0;
    for (const g of grouped) {
      if (isOurs(g.last.from_email)) sent++;
      else inbox++;
      if (g.lastIsInbound) waiting++;
    }
    return { inbox, sent, waiting, all: grouped.length };
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
              const counterparty =
                Array.from(g.participants).find((p) => !ours.has(p)) ??
                Array.from(g.participants)[0] ??
                "—";
              const preview = emailPreview(g.last.body, g.last.summary, 100);
              const inner = (
                <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
                  <Mail className="h-4 w-4 mt-1 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="truncate font-medium">{g.subject}</div>
                      <time className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {fmtDateTime(g.last.created_at)}
                      </time>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {counterparty}
                      {g.count > 1 && (
                        <span className="ml-2 text-foreground/60">· {g.count} üzenet</span>
                      )}
                      {g.lastIsInbound && (
                        <Badge variant="outline" className="ml-2 h-4 px-1 text-[10px]">
                          válasz vár
                        </Badge>
                      )}
                    </div>
                    {preview && (
                      <div className="mt-1 truncate text-xs text-foreground/70">{preview}</div>
                    )}
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
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/emails/")({
  component: EmailsPage,
});