import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, Inbox, Send, Reply, Files, Bot, PenSquare, Paperclip, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, EmptyState } from "@/components/page-header";
import { fmtDateTime } from "@/components/resource/resource-page";
import { emailPreview } from "@/components/emails/email-body";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmailComposer } from "@/components/emails/email-composer";
import { usePermissions } from "@/hooks/use-permissions";
import { getMailboxes, getMailboxPage } from "@/lib/gmail/mailbox.functions";
import { defaultMailbox, type MailFolder } from "@/lib/gmail/mailbox-model";

const folders: { key: MailFolder; label: string; icon: typeof Mail }[] = [
  { key: "inbox", label: "Beérkezett", icon: Inbox },
  { key: "sent", label: "Elküldött", icon: Send },
  { key: "waiting", label: "Válaszra vár", icon: Reply },
  { key: "auto", label: "Automatikus", icon: Bot },
  { key: "all", label: "Összes", icon: Files },
  { key: "unread", label: "Olvasatlan", icon: Mail },
];

function EmailsPage() {
  const { profile, role, isLoading: permissionsLoading } = usePermissions();
  const qc = useQueryClient();
  const isOwner = role === "owner";
  const userId = profile?.auth_user_id as string | undefined;
  const myMailbox = (profile?.gmail_email as string | undefined)?.toLowerCase();
  const [mailboxChoice, setMailboxChoice] = useState<string | null | undefined>(undefined);
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(0);
  const [composeOpen, setComposeOpen] = useState(false);
  const mailboxes = useQuery({ queryKey: ["emails", "mailboxes", userId], queryFn: () => getMailboxes(), enabled: !!userId });
  const mailbox = mailboxChoice === undefined ? defaultMailbox(mailboxes.data ?? [], userId) : mailboxChoice;
  const selected = mailboxes.data?.find(m => m.email === mailbox);
  const ownAccount = mailboxes.data?.find(m => m.userId === userId && m.email === myMailbox);
  const canCompose = !!ownAccount?.active && !ownAccount.authError && (mailbox === null || mailbox === myMailbox);
  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const messages = useQuery({
    queryKey: ["emails", "mailbox-page", userId, mailbox, folder, debouncedSearch, page],
    queryFn: () => getMailboxPage({ data: { mailbox, folder, search: debouncedSearch, page } }),
    enabled: !!userId && !!mailboxes.data?.length && !permissionsLoading,
    refetchInterval: 60_000,
  });
  const counts = messages.data?.counts;
  const rows = messages.data?.rows ?? [];
  const total = messages.data?.total ?? 0;
  const changeMailbox = (next: string | null) => { setMailboxChoice(next); setPage(0); setSearch(""); setDebouncedSearch(""); };
  const loading = permissionsLoading || mailboxes.isLoading || messages.isLoading;
  const error = mailboxes.error ?? messages.error;
  return (
    <div className="flex flex-col">
      <PageHeader title={mailbox ?? (isOwner ? "Összes postafiók" : (mailboxes.data?.length ? "Számodra elérhető levelezés" : "Nincs saját postafiókod"))} description={selected ? `${selected.name ?? "Postafiók"}${selected.active ? "" : " · Nem aktív / Archív"}` : (isOwner ? "E-mailek" : "Csak a saját vagy veled megosztott levélszálak látszanak; más postafiókjához nincs hozzáférésed.")} actions={
        <div className="flex gap-2">
          <Button variant="outline" size="icon" title="Postafiók frissítése" aria-label="Postafiók frissítése" onClick={() => qc.invalidateQueries({ queryKey: ["emails"] })}><RefreshCw className="h-4 w-4" /></Button>
          <Button onClick={() => setComposeOpen(true)} disabled={!canCompose} title={canCompose ? `Küldő: ${myMailbox}` : "Csak a saját, aktív Gmail-fiókodból küldhetsz"}><PenSquare className="mr-1.5 h-4 w-4" />Új e-mail</Button>
        </div>
      } />
      <div className="space-y-4 p-3 sm:p-6">
        {isOwner && <div className="flex flex-wrap gap-2" aria-label="Postafiókok">
          {(mailboxes.data ?? []).map(m => <Button key={`${m.userId}:${m.email}`} size="sm" variant={mailbox === m.email ? "default" : "outline"} onClick={() => changeMailbox(m.email)}>{m.email}{!m.active && <span className="ml-2">Nem aktív / Archív</span>}</Button>)}
          <Button size="sm" variant={mailbox === null ? "default" : "outline"} onClick={() => changeMailbox(null)}>Összes postafiók</Button>
        </div>}
        {selected?.authError && <p className="text-sm text-destructive">A szinkronizálás hitelesítési hibát jelez. A korábban tárolt levelek továbbra is olvashatók.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex max-w-full gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Levélnézetek">
            {folders.map(f => <Button key={f.key} role="tab" aria-selected={folder === f.key} size="sm" variant={folder === f.key ? "default" : "ghost"} className="shrink-0 gap-1.5" onClick={() => { setFolder(f.key); setPage(0); }}><f.icon className="h-3.5 w-3.5" />{f.label}<Badge variant="secondary">{counts?.[f.key] ?? "–"}</Badge></Button>)}
          </div>
          <Input aria-label="Keresés a kiválasztott postafiókban" className="w-full sm:ml-auto sm:max-w-xs" placeholder="Tárgy, feladó, címzett, tartalom…" value={search} maxLength={200} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{counts?.all ?? "–"} levélszál · {counts?.messages ?? "–"} saját szinkronüzenet</span>
          {selected?.lastSync && <span>Utolsó szinkron: {fmtDateTime(selected.lastSync)}</span>}
          <span>Küldő: {canCompose ? myMailbox : "ebből a nézetből nem küldhetsz"}</span>
        </div>
        {!!counts?.unknown && <p className="text-sm text-muted-foreground">{counts.unknown} hozzárendelt szálnál nincs külön tárolt Gmail-címke ehhez a fiókhoz; ezeket az Összes nézet mutatja.</p>}
        {error ? <p role="alert" className="text-sm text-destructive">A postafiók betöltése nem sikerült: {error.message}</p> : loading ? <p className="text-sm text-muted-foreground">Betöltés…</p> : rows.length === 0 ? <EmptyState icon={Mail} title="Nincs megjeleníthető levélszál" description="" /> :
          <div className="divide-y rounded-md border bg-card">
            {rows.map(row => <Link key={row.thread_id} to="/emails/$threadId" params={{ threadId: row.thread_id }} search={{ mailbox: mailbox ?? undefined }} className="block">
              <div className="flex items-start gap-3 px-3 py-3 transition-colors hover:bg-muted/40 sm:items-center sm:px-4">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Mail className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <span className={`min-w-0 truncate text-sm ${row.unread ? "font-semibold" : "font-medium"}`}>{(row.outbound ? row.to_email : row.from_email) ?? "Hozzárendelt levélszál"}{row.message_count > 1 && <span className="ml-1 text-muted-foreground">({row.message_count})</span>}</span>
                    <time className="shrink-0 text-xs tabular-nums text-muted-foreground">{row.sort_date ? fmtDateTime(row.sort_date) : "–"}</time>
                  </div>
                  <div className={`truncate text-sm ${row.unread ? "font-semibold" : ""}`}>{row.subject ?? "(nincs tárgy)"}</div>
                  <div className="truncate text-xs text-muted-foreground">{emailPreview(null, row.snippet, 160)}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    {mailbox === null && row.mailboxes.map(m => <Badge key={`${m.userId}:${m.email}`} variant="outline">{m.email}</Badge>)}
                    {(row.project_name || row.company_name) && <Badge variant="secondary">{row.project_name ?? row.company_name}</Badge>}
                    {row.unread && <Badge variant="secondary">Olvasatlan</Badge>}
                    {row.waiting && <Badge variant="outline">Válaszra vár</Badge>}
                    {row.has_attachments && <Paperclip className="h-3.5 w-3.5 text-muted-foreground" aria-label="Csatolmány" />}
                  </div>
                </div>
              </div>
            </Link>)}
          </div>}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{total ? `${page * 50 + 1}–${Math.min((page + 1) * 50, total)} / ${total} találat` : "0 találat"}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Előző oldal" disabled={page === 0 || messages.isFetching} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="text-sm">{page + 1}</span>
            <Button variant="outline" size="icon" aria-label="Következő oldal" disabled={(page + 1) * 50 >= total || messages.isFetching} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
      <EmailComposer open={composeOpen} onOpenChange={setComposeOpen} expectedMailbox={myMailbox} onSent={() => qc.invalidateQueries({ queryKey: ["emails"] })} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/emails/")({
  head: () => ({ meta: [
    { title: "Postafiókok | VIBA CRM" },
    { name: "description", content: "VIBA CRM: saját postafiókok, levéltörténet és ügyféllevelezések." },
    { property: "og:title", content: "Postafiókok | VIBA CRM" },
    { property: "og:description", content: "Postafiókonkénti e-mail-kezelés a VIBA CRM-ben." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: EmailsPage,
});
