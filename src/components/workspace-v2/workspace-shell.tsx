import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/brand-logo";
import { AiPanel, useAiPanel } from "@/components/ai/ai-panel";
import { AGENT_META } from "@/components/ai/chat-shared";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { ROLE_LABEL } from "@/lib/permissions";
import { WS_AREA_LABEL, wsAgentFor, wsAreasForRole, wsItemActive, wsItemsForRole } from "@/lib/workspace-v2/nav";
import { WorkspaceLinkProvider } from "./crm-link";
import { InterfaceSwitch } from "./interface-switch";
import { cn } from "@/lib/utils";

/** Az új Sales/Marketing munkaterület önálló kerete: egyetlen menü, a régi CRM menüi nélkül. */
export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role } = usePermissions();
  const items = wsItemsForRole(role);
  const areas = wsAreasForRole(role);
  const grouped = role === "owner";

  const navLinks = (mobile: boolean) => areas.map((a) => (
    <div key={a} className={mobile ? "contents" : "space-y-0.5 pb-3"}>
      {grouped && !mobile && <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/50">{WS_AREA_LABEL[a]}</div>}
      {items.filter((i) => i.area === a).map((i) => {
        const active = wsItemActive(i, pathname);
        return (
          <Link key={i.key} to={i.url} aria-current={active ? "page" : undefined}
            className={cn(mobile
              ? "shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm"
              : "block rounded-md px-3 py-2 text-sm transition",
              active ? (mobile ? "bg-primary text-primary-foreground" : "bg-sidebar-accent font-semibold text-sidebar-accent-foreground") : (mobile ? "text-muted-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"))}>
            {grouped && mobile && a !== "common" ? `${a === "sales" ? "Sales" : "Mkt"} · ` : ""}{i.title}
          </Link>
        );
      })}
    </div>
  ));

  return (
    <WorkspaceLinkProvider>
      <div className="crm-workspace flex min-h-screen w-full bg-background">
        <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
          <div className="space-y-3 px-3 pb-3 pt-4"><div className="px-1"><BrandLogo onDark className="h-8 max-w-full" alt="VIBA-TEAM Kft" /></div><InterfaceSwitch current="workspace" /></div>
          <nav aria-label="Munkaterület" className="flex-1 overflow-y-auto px-2">{navLinks(false)}</nav>
          <AccountBlock />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
            <div className="flex h-14 items-center gap-2 px-3 lg:px-5">
              <BrandLogo className="h-6 lg:hidden" />
              <div className="flex-1" />
              <AssistantButton agent={wsAgentFor(role, pathname)} />
              <div className="lg:hidden"><AccountMenuCompact /></div>
            </div>
            <InterfaceSwitch current="workspace" compact wrapperClassName="mx-3 mb-2 rounded-lg bg-sidebar lg:hidden" />
            <nav aria-label="Munkaterület" className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">{navLinks(true)}</nav>
          </header>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
        <AiPanel />
      </div>
    </WorkspaceLinkProvider>
  );
}

function AssistantButton({ agent }: { agent: "sales" | "marketing" }) {
  const { open, setOpen, openWith } = useAiPanel();
  const meta = AGENT_META[agent];
  return (
    <Button size="sm" variant={open ? "secondary" : "glow"} aria-pressed={open} className="h-8 gap-1.5 rounded-full px-2.5 sm:px-3"
      onClick={() => (open ? setOpen(false) : openWith(agent, ""))}>
      <img src={meta.portrait} alt="" className="h-5 w-5 rounded-full object-cover" />
      <span>{meta.firstName}</span>
    </Button>
  );
}

function useAccountActions() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return {
    signOut: async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); },
  };
}

function AccountBlock() {
  const { user } = useAuth();
  const { role } = usePermissions();
  const a = useAccountActions();
  return (
    <div className="space-y-1 border-t border-sidebar-border px-3 py-3 text-xs">
      <div className="truncate text-sidebar-foreground/90">{user?.email}</div>
      <div className="text-sidebar-foreground/60">{ROLE_LABEL[role]}</div>
      <div className="flex gap-1 pt-1">
        <Button size="sm" variant="ghost" className="h-7 flex-1 justify-start px-2 text-sidebar-foreground/80" onClick={() => void a.signOut()}><LogOut className="h-3.5 w-3.5" />Kijelentkezés</Button>
      </div>
    </div>
  );
}

function AccountMenuCompact() {
  const a = useAccountActions();
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => void a.signOut()} aria-label="Kijelentkezés"><LogOut className="h-4 w-4" /></Button>
    </div>
  );
}
