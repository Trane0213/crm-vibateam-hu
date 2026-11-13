import { Link } from "@tanstack/react-router";
import { AlertTriangle, BellRing, Copy, Link2, Mail, ShieldCheck, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCount } from "@/lib/db-hooks";
import { useQualityOverview } from "@/lib/dedupe/use-quality-overview";
import { usePermissions } from "@/hooks/use-permissions";
import { useNotifications } from "@/hooks/use-notifications";
import { badgeCount, groupNotifications, isImmediate, safeLink, NOTIFICATION_CATEGORY } from "@/lib/notifications/model";

export function CrmNotificationsMenu() {
  const { role } = usePermissions();
  const isMarketing = role === "marketing";
  const nowIso = new Date().toISOString();
  const overdueFollowups = useCount(
    "followups",
    (q) => q.eq("completed", false).lt("due_date", nowIso),
    "crm-notif-overdue-followups",
  );
  // „Átadható" notification megszűnt — a `qualified` státusz nem létezik a
  // jóváhagyott flow-ban. A számláló 0-val helyettesítve a UI átépítéséig.
  const transferableLeads = { data: 0 as number | null };
  const overview = useQualityOverview();
  const events = useNotifications(0, 30);
  const isOwner = role === "owner";
  const evRows = events.data?.rows ?? [];
  const evRead = events.data?.read ?? new Set<string>();
  const evBadge = badgeCount(evRows, evRead, isOwner, events.data?.me);
  const evOpen = groupNotifications(evRows.filter((n) => !n.resolved_at && !evRead.has(n.id))).slice(0, 6);

  // Marketing nem fér hozzá a /followups oldalhoz, ezért az ehhez tartozó
  // sor és számláló elrejtésre kerül (403-as link elkerülése).
  const overdueCount = isMarketing ? 0 : (overdueFollowups.data ?? 0);
  const urgent = overdueCount + (transferableLeads.data ?? 0) + evBadge;
  const warnings =
    overview.counts.incompleteCompanies +
    overview.counts.companyDuplicates +
    overview.counts.contactConflicts +
    overview.counts.unlinkedLeads +
    overview.counts.unlinkedThreads;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <BellRing className="h-4 w-4" />
          <span className="hidden lg:inline">CRM Értesítések</span>
          <span className="inline-flex items-center gap-1 text-[11px] text-destructive">
            <span className="h-2 w-2 rounded-full bg-destructive" />
            {urgent}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] text-status-warning">
            <span className="h-2 w-2 rounded-full bg-status-warning" />
            {warnings}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-2">
        <DropdownMenuLabel className="px-2 py-2">
          <div className="flex items-center justify-between gap-3">
            <span>CRM Értesítések</span>
            <div className="flex items-center gap-3 text-[11px] font-normal">
              <span className="text-destructive">🔴 {urgent} sürgős</span>
              <span className="text-status-warning">🟡 {warnings} figyelmeztetés</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Események</p>
        {events.isLoading ? <p role="status" className="px-2 py-2 text-sm text-muted-foreground">Betöltés…</p>
          : events.error ? <p role="alert" className="px-2 py-2 text-sm text-destructive">Az események most nem tölthetők be.</p>
          : !evOpen.length ? <p className="px-2 py-2 text-sm text-muted-foreground">Nincs olvasatlan esemény.</p>
          : evOpen.map((g) => {
            const n = g.lead, many = g.rows.length > 1;
            const link = safeLink(n.link_path) ?? "/notifications";
            const now = g.rows.some((r) => isImmediate(r, isOwner, events.data?.me));
            return <DropdownMenuItem key={g.key} asChild><Link to={link as "/notifications"} className="flex items-start gap-2 rounded-md px-2 py-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.severity === "critical" ? "bg-destructive" : n.severity === "warning" ? "bg-status-warning" : "bg-status-info"}`} />
              <span className="min-w-0 flex-1"><span className="block text-sm leading-snug">{n.title}{many ? ` (${g.rows.length} db)` : n.occurrences > 1 ? ` (${n.occurrences}×)` : ""}</span>
                <span className="block truncate text-xs text-muted-foreground">{NOTIFICATION_CATEGORY[n.category as keyof typeof NOTIFICATION_CATEGORY] ?? n.category}{g.requiresDecision ? " · döntést igényel" : ""}{now ? "" : " · napi összesítő"}</span></span>
            </Link></DropdownMenuItem>;
          })}
        <DropdownMenuItem asChild><Link to="/notifications" className="flex items-center justify-between rounded-md px-2 py-2 text-sm font-medium text-primary">Összes értesítés megnyitása <ArrowRight className="h-4 w-4" /></Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <p className="px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Nyitott teendők</p>

        {!isMarketing && (
          <NotificationLink to="/followups" icon={AlertTriangle} tone="danger" label="Lejárt utánkövetések" count={overdueFollowups.data ?? 0} />
        )}
        <NotificationLink to="/today" icon={Sparkles} tone="warning" label="Átadható leadek" count={transferableLeads.data ?? 0} />
        <NotificationLink to="/data-quality" icon={ShieldCheck} tone="warning" label="Hiányos cégek" count={overview.counts.incompleteCompanies} />
        <NotificationLink to="/data-quality" icon={Copy} tone="warning" label="Duplikációk" count={overview.counts.companyDuplicates} />
        <NotificationLink to="/data-quality" icon={Link2} tone="info" label="Linkeletlen leadek" count={overview.counts.unlinkedLeads} />
        <NotificationLink to="/data-quality" icon={Mail} tone="info" label="Linkeletlen email threadek" count={overview.counts.unlinkedThreads} />

        {overdueCount + warnings === 0 && (
          <div className="rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Nincs nyitott CRM teendő.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationLink({
  to,
  icon: Icon,
  tone,
  label,
  count,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "info" | "warning" | "danger";
  label: string;
  count: number;
}) {
  const toneClass =
    tone === "danger"
      ? "text-destructive"
      : tone === "warning"
        ? "text-status-warning"
        : "text-primary";

  return (
    <DropdownMenuItem asChild>
      <Link to={to} className="flex items-center gap-3 rounded-md px-2 py-2">
        <Icon className={`h-4 w-4 ${toneClass}`} />
        <span className="flex-1 text-sm">{label}</span>
        <span className={`tabular-nums text-sm font-semibold ${toneClass}`}>{count}</span>
      </Link>
    </DropdownMenuItem>
  );
}