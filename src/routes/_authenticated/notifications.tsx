import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/hooks/use-permissions";
import { useMarkNotificationsRead, useNotifications } from "@/hooks/use-notifications";
import { isImmediate, safeLink, NOTIFICATION_CATEGORY, NOTIFICATION_SEVERITY, type NotificationRow } from "@/lib/notifications/model";

export const Route = createFileRoute("/_authenticated/notifications")({
  head: () => ({ meta: [
    { title: "Értesítési központ | VIBA CRM" },
    { name: "description", content: "AI-megállapítások, dokumentumok, üzleti események, rendszerhibák és döntést igénylő ügyek egy helyen, szerepkör szerint." },
    { property: "og:title", content: "Értesítési központ | VIBA CRM" },
    { property: "og:description", content: "Szerepköralapú, egységes CRM-értesítések." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: NotificationsPage,
});

const FILTERS: { key: string; label: string }[] = [{ key: "", label: "Mind" }, ...Object.entries(NOTIFICATION_CATEGORY).map(([key, label]) => ({ key, label }))];

function NotificationsPage() {
  const { role } = usePermissions();
  const isOwner = role === "owner";
  const [page, setPage] = useState(0), [category, setCategory] = useState(""), [decisionOnly, setDecisionOnly] = useState(false), [openOnly, setOpenOnly] = useState(true);
  const q = useNotifications(page, 30, { category: category || undefined, decisionOnly, openOnly });
  const mark = useMarkNotificationsRead();
  const rows = q.data?.rows ?? [];
  const read = q.data?.read ?? new Set<string>();
  const unread = rows.filter((n) => !read.has(n.id)).map((n) => n.id);
  const now = rows.filter((n) => isImmediate(n, isOwner, q.data?.me));
  const daily = rows.filter((n) => !isImmediate(n, isOwner, q.data?.me));
  const reset = () => setPage(0);
  return <div>
    <PageHeader title="Értesítési központ" description={isOwner ? "Azonnal csak a kritikus és döntést igénylő jelzések számítanak; a többi a napi összesítőbe kerül. Csak a CRM-en belül jelzünk, emailt nem küldünk." : "A neked szóló események. Csak azt látod, amihez a CRM-ben is hozzáférsz. Emailt nem küldünk."}
      actions={<Button size="sm" variant="outline" disabled={!unread.length || mark.isPending} onClick={() => mark.mutate(unread)}>{mark.isPending ? "Jelölés…" : `Ezen a lapon mind olvasott (${unread.length})`}</Button>} />
    <div className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Szűrés típus szerint">
        {FILTERS.map((f) => <Button key={f.key || "all"} size="sm" variant={category === f.key ? "default" : "outline"} onClick={() => { setCategory(f.key); reset(); }}>{f.label}</Button>)}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={decisionOnly} onChange={(e) => { setDecisionOnly(e.target.checked); reset(); }} />Csak döntést igénylő</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={openOnly} onChange={(e) => { setOpenOnly(e.target.checked); reset(); }} />Lezártak elrejtése</label>
      </div>
      {mark.error && <p role="alert" className="text-sm text-destructive">{(mark.error as Error).message}</p>}
      {q.isLoading ? <p role="status">Betöltés…</p>
        : q.error ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">Az értesítések nem tölthetők be.</p><Button size="sm" variant="outline" onClick={() => q.refetch()}>Újrapróbálás</Button></div>
        : !rows.length ? <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">Ehhez a szűréshez nincs értesítés.</p>
        : <>
          <Section title="Azonnali figyelem" rows={now} read={read} onRead={(id) => mark.mutate([id])} />
          <Section title={isOwner ? "Napi összesítőbe" : "Tájékoztatás"} rows={daily} read={read} onRead={(id) => mark.mutate([id])} />
        </>}
      {!!q.data && q.data.total > 30 && <div className="flex items-center gap-2"><Button size="sm" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Előző</Button><span className="text-sm">{page + 1}. lap / {Math.ceil(q.data.total / 30)}</span><Button size="sm" variant="outline" disabled={(page + 1) * 30 >= q.data.total} onClick={() => setPage(page + 1)}>Következő</Button></div>}
    </div>
  </div>;
}

function Section({ title, rows, read, onRead }: { title: string; rows: NotificationRow[]; read: Set<string>; onRead: (id: string) => void }) {
  if (!rows.length) return null;
  return <section className="space-y-2"><h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title} ({rows.length})</h2>
    <ul className="space-y-2">{rows.map((n) => <Item key={n.id} n={n} isRead={read.has(n.id)} onRead={onRead} />)}</ul></section>;
}

function Item({ n, isRead, onRead }: { n: NotificationRow; isRead: boolean; onRead: (id: string) => void }) {
  const link = safeLink(n.link_path);
  const tone = n.severity === "critical" ? "border-destructive/50" : n.severity === "warning" ? "border-status-warning/50" : "border-border";
  return <li className={`rounded-md border p-3 ${tone} ${isRead || n.resolved_at ? "opacity-70" : ""}`}>
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{!isRead && !n.resolved_at && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-primary align-middle" aria-label="olvasatlan" />}{n.title}{n.occurrences > 1 ? ` (${n.occurrences}×)` : ""}</p>
        {n.body && <p className="break-words text-sm text-muted-foreground">{n.body}</p>}
        <p className="pt-1 text-xs text-muted-foreground">{NOTIFICATION_CATEGORY[n.category as keyof typeof NOTIFICATION_CATEGORY] ?? n.category} · {NOTIFICATION_SEVERITY[n.severity as keyof typeof NOTIFICATION_SEVERITY] ?? n.severity}{n.requires_decision ? " · döntést igényel" : ""} · {new Date(n.last_occurred_at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}{n.resolved_at ? " · lezárva" : ""}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {link && <Button asChild size="sm" variant="outline"><Link to={link as "/notifications"} onClick={() => { if (!isRead) onRead(n.id); }}>Megnyitás</Link></Button>}
        {!isRead && <Button size="sm" variant="ghost" onClick={() => onRead(n.id)}>Olvasott</Button>}
      </div>
    </div>
  </li>;
}
