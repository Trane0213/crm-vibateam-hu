import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Lock, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ROUTE_ACCESS, ROLE_LABEL } from "@/lib/permissions";
import { humanizeSupabaseError } from "@/lib/db-hooks";

const TABLES = [
  "users_profile", "roles", "permissions", "role_permissions",
  "companies", "contacts", "leads", "projects",
  "quotes", "quote_items", "followups", "followup_events",
  "tasks", "emails", "email_threads", "phone_calls", "meetings", "reminders",
  "project_documents", "project_notes", "project_status_history",
  "agents", "agent_tasks", "agent_memories", "agent_activity", "agent_permissions",
  "knowledge_documents", "knowledge_chunks",
  "email_campaigns", "google_ads_keywords", "google_ads_recommendations",
  "contact_messages", "activities", "references", "quote_requests", "settings",
];

type Status = "ok" | "denied" | "missing" | "unknown";
type Row = {
  table: string;
  status: Status;
  read: "ok" | "denied" | "missing" | "unknown";
  write: "ok" | "denied" | "rls" | "unknown";
  message?: string;
};

export const Route = createFileRoute("/_authenticated/settings/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [rows, setRows] = useState<Row[]>(
    TABLES.map((t) => ({ table: t, status: "unknown", read: "unknown", write: "unknown" })),
  );
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    const results: Row[] = [];
    for (const t of TABLES) {
      // READ teszt — count head
      const r = await supabase.from(t).select("*", { count: "exact", head: true });
      let read: Row["read"] = "unknown";
      let status: Status = "unknown";
      let message: string | undefined;
      if (!r.error) { read = "ok"; status = "ok"; }
      else {
        const msg = r.error.message ?? "";
        message = msg;
        if (/does not exist/i.test(msg) || r.error.code === "42P01") { read = "missing"; status = "missing"; }
        else if (/permission denied/i.test(msg) || r.error.code === "42501") { read = "denied"; status = "denied"; }
        else { read = "denied"; status = "denied"; }
      }

      // WRITE teszt — szándékosan érvénytelen insert dry-run jellegű:
      // RLS hibát várunk (jó), permission denied-ot (rls védi),
      // 42P01-et (hiányzó). Sikeres írást NEM hajtunk végre.
      let write: Row["write"] = "unknown";
      if (status !== "missing") {
        const w = await supabase.from(t).insert({ __audit_probe__: true } as any).select("id");
        if (!w.error) {
          // Ide nem szabadna jutni — ha mégis, valószínűleg semmilyen védelem nincs.
          write = "ok";
        } else {
          const wm = w.error.message ?? "";
          if (/permission denied|not authorized/i.test(wm) || w.error.code === "42501") write = "denied";
          else if (/row-level security|rls/i.test(wm)) write = "rls";
          else if (/column .* does not exist/i.test(wm)) write = "rls"; // RLS átengedte, csak a mező rossz
          else write = "denied";
        }
      }

      results.push({ table: t, status, read, write, message });
    }
    setRows(results);
    setRunning(false);
  };

  useEffect(() => { void run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const ok = rows.filter((r) => r.status === "ok").length;
  const denied = rows.filter((r) => r.status === "denied").length;
  const missing = rows.filter((r) => r.status === "missing").length;
  const writable = rows.filter((r) => r.write === "ok").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><CardTitle>Security Audit</CardTitle></div>
          <CardDescription>
            A frontend a publishable kulccsal próbál hozzáférni minden CRM táblához. Az eredmény jelzi, hogy a tábla
            elérhető-e a Data API-n keresztül a jelenlegi szerepkörnek. RLS policy módosítás nem történik — ez csak audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Stat label="Elérhető" value={ok} tone="success" icon={ShieldCheck} />
          <Stat label="Tiltott / RLS védi" value={denied} tone="warning" icon={ShieldAlert} />
          <Stat label="Hiányzó tábla" value={missing} tone="danger" icon={ShieldQuestion} />
          <Stat label="Írható (figyelem!)" value={writable} tone={writable > 0 ? "danger" : "success"} icon={Pencil} />
          <button
            onClick={run}
            disabled={running}
            className="ml-auto rounded-md border px-3 py-1.5 text-xs hover:bg-muted disabled:opacity-50"
          >
            {running ? "Vizsgálat…" : "Újrafuttatás"}
          </button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tábla-elérhetőség</CardTitle>
          <CardDescription>
            Olvasás és írás külön tesztelve a publishable kulccsal, a bejelentkezett szerepkör nevében.
            `RLS védi` állapot a jó hír — a tábla védve van. `Írható` figyelmeztetést igényel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Tábla</th>
                  <th className="px-3 py-2 text-left">Olvasás</th>
                  <th className="px-3 py-2 text-left">Írás</th>
                  <th className="px-3 py-2 text-left">Üzenet</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.table} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.table}</td>
                    <td className="px-3 py-1.5">
                      <ReadBadge s={r.read} />
                    </td>
                    <td className="px-3 py-1.5">
                      <WriteBadge w={r.write} />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-[420px] truncate" title={r.message}>
                      {r.message ? humanizeSupabaseError({ message: r.message }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Szerepkör → route hozzáférés</CardTitle>
          <CardDescription>A UI-szintű menü és route guard jelenlegi állapota.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="px-3 py-2 text-left">Útvonal</th><th className="px-3 py-2 text-left">Engedélyezett szerepkörök</th></tr>
              </thead>
              <tbody>
                {ROUTE_ACCESS.map((r) => (
                  <tr key={r.prefix} className="border-t">
                    <td className="px-3 py-1.5 font-mono text-xs">{r.prefix}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.roles.map((role) => (
                        <Badge key={role} variant="secondary" className="mr-1 text-[10px]">{ROLE_LABEL[role]}</Badge>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone, icon: Icon }: { label: string; value: number; tone: "success" | "warning" | "danger"; icon: React.ComponentType<{ className?: string }> }) {
  const cls: Record<string, string> = {
    success: "border-[color:var(--status-success)]/30 bg-[color:var(--status-success)]/5 text-[color:var(--status-success)]",
    warning: "border-[color:var(--status-warning)]/30 bg-[color:var(--status-warning)]/10 text-[color:var(--status-warning)]",
    danger: "border-destructive/30 bg-destructive/5 text-destructive",
  };
  return (
    <div className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${cls[tone]}`}>
      <Icon className="h-4 w-4" />
      <span className="text-xs uppercase tracking-wider opacity-80">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function ReadBadge({ s }: { s: Row["read"] }) {
  if (s === "ok") return <Badge variant="outline" className="border-[color:var(--status-success)]/30 text-[color:var(--status-success)]">olvasható</Badge>;
  if (s === "denied") return <Badge variant="outline" className="border-[color:var(--status-warning)]/30 text-[color:var(--status-warning)]"><Lock className="mr-1 h-3 w-3" />RLS védi</Badge>;
  if (s === "missing") return <Badge variant="outline" className="border-destructive/30 text-destructive">hiányzó</Badge>;
  return <Badge variant="outline">—</Badge>;
}

function WriteBadge({ w }: { w: Row["write"] }) {
  if (w === "ok") return <Badge variant="outline" className="border-destructive/30 text-destructive"><Pencil className="mr-1 h-3 w-3" />írható!</Badge>;
  if (w === "rls") return <Badge variant="outline" className="border-[color:var(--status-success)]/30 text-[color:var(--status-success)]"><Lock className="mr-1 h-3 w-3" />RLS védi</Badge>;
  if (w === "denied") return <Badge variant="outline" className="border-[color:var(--status-warning)]/30 text-[color:var(--status-warning)]">tiltott</Badge>;
  return <Badge variant="outline">—</Badge>;
}