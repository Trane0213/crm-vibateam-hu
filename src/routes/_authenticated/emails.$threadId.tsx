import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, ChevronLeft } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";

export const Route = createFileRoute("/_authenticated/emails/$threadId")({
  component: EmailThread,
});

function EmailThread() {
  const { threadId } = Route.useParams();
  const emails = useListWhere<any>("emails", "thread_id", threadId, {
    order: "created_at",
    ascending: true,
  });

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <Link to="/emails" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Vissza az emailekhez
        </Link>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Email szál</div>
        <h1 className="mt-1 text-xl font-semibold flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          {emails.data?.[0]?.summary ?? "Email szál"}
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">
          {emails.data?.length ?? 0} üzenet a szálban
        </div>
      </div>
      <div className="p-6">
        {emails.isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : (emails.data ?? []).length === 0 ? (
          <EmptyState icon={Mail} title="Nincs üzenet ebben a szálban" />
        ) : (
          <ol className="space-y-3">
            {(emails.data ?? []).map((e) => (
              <li key={e.id} className="rounded-md border bg-card p-4">
                <div className="flex items-baseline justify-between gap-3 border-b pb-2">
                  <div className="text-sm">
                    <span className="font-medium">{e.from_email ?? "—"}</span>
                    <span className="text-muted-foreground"> → {e.to_email ?? "—"}</span>
                  </div>
                  <time className="text-xs text-muted-foreground tabular-nums">{fmtDateTime(e.created_at)}</time>
                </div>
                {e.summary && <div className="mt-2 text-sm font-medium">{e.summary}</div>}
                {e.body && <div className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">{e.body}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}