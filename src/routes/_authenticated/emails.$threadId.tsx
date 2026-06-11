import { createFileRoute, Link } from "@tanstack/react-router";
import { Mail, ChevronLeft } from "lucide-react";
import { EmptyState } from "@/components/page-header";
import { useListWhere } from "@/lib/db-hooks";
import { fmtDateTime } from "@/components/resource/resource-page";
import { EmailBody } from "@/components/emails/email-body";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { usePermissions } from "@/hooks/use-permissions";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/emails/$threadId")({
  component: EmailThread,
});

function EmailThread() {
  const { threadId } = Route.useParams();
  const { profile, role } = usePermissions();
  const isOwner = role === "owner";
  const myMailbox = ((profile as any)?.gmail_email ?? (profile as any)?.email ?? "")
    .toString()
    .trim()
    .toLowerCase();
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
        .select("id,subject")
        .eq("id", threadId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const subject = thread.data?.subject && thread.data.subject !== "(nincs tárgy)"
    ? thread.data.subject
    : "(nincs tárgy)";

  const visibleEmails = useMemo(() => {
    const list = emails.data ?? [];
    if (isOwner) return list;
    if (!myMailbox) return [];
    return list.filter((e: any) => {
      const f = (e.from_email ?? "").toLowerCase();
      const t = (e.to_email ?? "").toLowerCase();
      return f === myMailbox || t === myMailbox || f.includes(myMailbox) || t.includes(myMailbox);
    });
  }, [emails.data, isOwner, myMailbox]);

  return (
    <div className="flex flex-col">
      <div className="border-b bg-background px-6 py-4">
        <Link to="/emails" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" /> Vissza az emailekhez
        </Link>
        <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">Email szál</div>
        <h1 className="mt-1 text-xl font-semibold flex items-center gap-2 break-words">
          <Mail className="h-5 w-5 text-primary shrink-0" />
          <span className="min-w-0 break-words">{subject}</span>
        </h1>
        <div className="mt-1 text-sm text-muted-foreground">
          {visibleEmails.length} üzenet a szálban
        </div>
      </div>
      <div className="p-6">
        {emails.isLoading ? (
          <p className="text-sm text-muted-foreground">Betöltés…</p>
        ) : visibleEmails.length === 0 ? (
          <EmptyState
            icon={Mail}
            title="Nincs megjeleníthető üzenet"
            description={
              !isOwner ? "Ehhez a szálhoz nincs jogosultságod." : undefined
            }
          />
        ) : (
          <ol className="space-y-4 max-w-3xl">
            {visibleEmails.map((e: any) => (
              <li key={e.id} className="rounded-lg border bg-card shadow-sm">
                <header className="flex flex-wrap items-baseline justify-between gap-3 border-b px-4 py-3">
                  <div className="min-w-0 text-sm">
                    <div className="font-medium truncate">{e.from_email ?? "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      <span className="uppercase tracking-wider">címzett:</span>{" "}
                      {e.to_email ?? "—"}
                    </div>
                  </div>
                  <time className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                    {fmtDateTime(e.created_at)}
                  </time>
                </header>
                <div className="px-4 py-4">
                  <EmailBody body={e.body} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}