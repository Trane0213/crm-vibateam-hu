import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/use-auth";
import { getMailboxes, getMailboxPage } from "@/lib/gmail/mailbox.functions";
import { mailboxResult, defaultMailbox, type MailFolder } from "@/lib/gmail/mailbox-model";
import { listOwnGmailDrafts } from "@/lib/marketing/gmail-drafts.functions";
import { WsPageHeader, CaseAssistant } from "@/components/workspace-v2/parts";
import { useAiPanel } from "@/components/ai/ai-panel";
import { usePermissions } from "@/hooks/use-permissions";
import { StatusBadge } from "@/components/workspace-v2/status-badge";
import { formatDateTime } from "@/lib/format";
import { wsHead } from "@/lib/workspace-v2/head";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/munka/levelezes/")({
  head: () => wsHead("Levelezés", "Saját postafiók, Gmail-piszkozatok és tartalomtervezés."),
  component: MailContentPage,
});

const FOLDERS: { key: MailFolder; label: string }[] = [
  { key: "inbox", label: "Beérkezett" }, { key: "waiting", label: "Válaszra vár" }, { key: "sent", label: "Elküldött" },
];

const CONTENT_PROMPTS = [
  { label: "Megkereső e-mail tervezet", text: "Készíts e-mail-tervezetet (tárgy + 120 szavas szöveg) a VIBA-TEAM villamos kivitelezési szolgáltatásáról irodaházak és társasházak üzemeltetőinek. Csak ellenőrizhető állítást használj, árat ne írj. Ne küldj és ne ments semmit." },
  { label: "LinkedIn-poszt tervezet", text: "Írj rövid LinkedIn-poszt-tervezetet egy befejezett VIBA-TEAM villamos kivitelezési munkáról, kitalált adatok nélkül; jelöld, hol kell valós adatot beírni. Ne publikálj semmit." },
  { label: "Utánkövető levél tervezet", text: "Írj udvarias utánkövető levél-tervezetet olyan cégnek, amely nem válaszolt az első megkeresésre. Árat ne írj. Ne küldj semmit." },
];

function MailContentPage() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const marketingRole = role === "marketing" || role === "owner";
  const { openWith } = useAiPanel();
  const [tab, setTab] = useState("mail");
  const [folder, setFolder] = useState<MailFolder>("inbox");
  const mailboxesFn = useServerFn(getMailboxes);
  const pageFn = useServerFn(getMailboxPage);
  const draftsFn = useServerFn(listOwnGmailDrafts);
  const mailboxes = useQuery({ queryKey: ["mailbox", "list"], queryFn: () => mailboxResult(mailboxesFn(), "mailboxes") });
  const mailbox = mailboxes.data ? defaultMailbox(mailboxes.data, user?.id) : null;
  const page = useQuery({
    queryKey: ["mailbox", "page", mailbox, folder, "", 0],
    enabled: mailboxes.isSuccess,
    queryFn: () => mailboxResult(pageFn({ data: { mailbox, folder, search: "", page: 0 } }), "page"),
  });
  const drafts = useQuery({ queryKey: ["gmail-drafts", "v2"], enabled: tab === "drafts", queryFn: () => draftsFn({ data: {} }), retry: false });

  return (
    <>
      <WsPageHeader title="Levelezés" subtitle={mailbox ? `Postafiók: ${mailbox}` : "Saját postafiók"} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs value={tab} onValueChange={setTab} className="min-w-0 rounded-xl border bg-card p-4 shadow-[var(--shadow-card)]">
          <TabsList className="flex h-auto flex-wrap justify-start">
            <TabsTrigger value="mail">Levelezés{page.data ? ` (${page.data.counts.inbox ?? 0})` : ""}</TabsTrigger>
            <TabsTrigger value="drafts">Piszkozatok</TabsTrigger>
            {marketingRole && <TabsTrigger value="content">Tartalomtervezés</TabsTrigger>}
          </TabsList>
          <TabsContent value="mail" className="pt-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {FOLDERS.map((f) => (
                <button key={f.key} type="button" onClick={() => setFolder(f.key)} aria-pressed={folder === f.key}
                  className={cn("rounded-full border px-3 py-1 text-xs", folder === f.key ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground")}>
                  {f.label}{page.data && folder === f.key ? ` (${page.data.total})` : ""}
                </button>
              ))}
            </div>
            {mailboxes.isError ? <p role="alert" className="text-sm text-destructive">{mailboxes.error instanceof Error ? mailboxes.error.message : "A postafiók nem érhető el."}</p>
              : page.isLoading || mailboxes.isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Betöltés…</div>
              : page.isError ? <p role="alert" className="text-sm text-destructive">{page.error instanceof Error ? page.error.message : "Nem tölthető be."}</p>
              : (page.data?.rows ?? []).length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nincs levél ebben a mappában (a tárolt saját levelezés alapján).</p>
              : (
                <ul className="divide-y">
                  {page.data!.rows.slice(0, 25).map((r) => (
                    <li key={r.thread_id}>
                      <Link to="/munka/levelezes/$threadId" params={{ threadId: r.thread_id }} search={mailbox ? { mailbox } : {}} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5 hover:bg-muted/40">
                        <div className="min-w-0">
                          <div className={cn("truncate text-sm", r.unread && "font-semibold")}>{r.subject || "(nincs tárgy)"}</div>
                          <div className="truncate text-xs text-muted-foreground">{[r.outbound ? r.to_email : r.from_email, r.company_name].filter(Boolean).join(" · ")}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                          {r.has_attachments && <Paperclip className="h-3.5 w-3.5" />}
                          {r.waiting && <StatusBadge status="approval" label="Válaszra vár" />}
                          <span className="hidden sm:inline">{r.sort_date ? formatDateTime(r.sort_date) : ""}</span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
          </TabsContent>
          <TabsContent value="drafts" className="pt-3">
            {drafts.isLoading ? <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Saját Gmail-piszkozatok betöltése…</div>
              : drafts.isError ? <p role="alert" className="text-sm text-destructive">{drafts.error instanceof Error ? drafts.error.message : "Nem tölthető be."}</p>
              : (drafts.data?.drafts ?? []).length === 0 ? <p className="py-3 text-sm text-muted-foreground">Nincs saját Gmail-piszkozat.</p>
              : (
                <ul className="divide-y text-sm">
                  {drafts.data!.drafts.map((d) => <li key={d.id} className="truncate py-2">{d.subject || "(nincs tárgy)"}</li>)}
                </ul>
              )}
            <p className="mt-3 text-xs text-muted-foreground">Piszkozatot kampányba a kampány szerkesztőjében lehet importálni; ott ellenőrzött másolat készül.</p>
          </TabsContent>
          {marketingRole && <TabsContent value="content" className="space-y-3 pt-3">
            <p className="text-sm">Kérj Scarlettől e-mail- vagy posztszöveg-tervezetet. A tervezet a beszélgetésben marad; mentés, küldés vagy publikálás nem történik.</p>
            <div className="grid gap-2 sm:grid-cols-3">
              {CONTENT_PROMPTS.map((c) => (
                <Button key={c.label} variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => openWith("marketing", c.text)}>{c.label}</Button>
              ))}
            </div>
          </TabsContent>}
        </Tabs>
        <CaseAssistant agent={marketingRole ? "marketing" : "sales"} intro="A saját postafiókodban segít; levelet nem küld."
          prompts={[
            { label: "Mire kell ma válaszolnom?", text: "Nézd át a saját postafiókom válaszra váró leveleit, és rangsorold, melyikre kell ma válaszolni. Ne küldj és ne módosíts semmit." },
            { label: "Ügyhöz nem kötött levelek", text: "Keresd meg a saját postafiókomban azokat a leveleket, amelyek nincsenek céghez vagy ügyhöz kötve, és javasolj kötést indoklással. Ne módosíts semmit." },
          ]} />
      </div>
    </>
  );
}
