import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, ChevronDown, MoreHorizontal } from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton,
  SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/use-permissions";
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { BrandLogo } from "@/components/brand-logo";
import { ROLE_LABEL } from "@/lib/permissions";
import { aiItems, isNavActive, moreGroups, primaryItems, type NavItem } from "@/lib/nav-config";

const itemCls =
  "h-9 rounded-lg px-3 text-sidebar-foreground/75 transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:font-medium data-[active=true]:shadow-glow";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const { role } = usePermissions();
  const { visibleAgentIds } = useVisibleAgents();
  const primary = primaryItems(role);
  const ai = aiItems(role, visibleAgentIds);
  const more = moreGroups(role);
  const moreActive = more.some((g) => g.items.some((i) => isNavActive(pathname, i.url)));
  const [moreOpen, setMoreOpen] = useState(moreActive);
  const [aiOpen, setAiOpen] = useState(false);

  const active = (i: NavItem) =>
    i.search?.agent
      ? pathname.startsWith("/ai-assistant") && new URLSearchParams(searchStr ?? "").get("agent") === i.search.agent
      : isNavActive(pathname, i.url);

  const renderItem = (i: NavItem) => (
    <SidebarMenuItem key={i.url + (i.search?.agent ?? "")}>
      <SidebarMenuButton asChild isActive={active(i)} tooltip={i.title} className={itemCls}>
        <Link to={i.url} {...(i.search ? { search: i.search as never } : {})} className="flex items-center gap-2.5">
          <i.icon className="h-[18px] w-[18px] shrink-0" />
          {!collapsed && <span className="truncate text-[13px]">{i.title}</span>}
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  const toggle = (label: string, open: boolean, onClick: () => void, Icon: typeof Bot) =>
    collapsed ? null : (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50 hover:text-sidebar-foreground"
        aria-expanded={open}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <Link to="/today" className="flex items-center gap-2.5 rounded-md px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {collapsed ? (
            <BrandLogo onDark className="h-7 w-7 [object-position:left]" alt="VIBA-TEAM" />
          ) : (
            <BrandLogo onDark className="h-9 max-w-full" alt="VIBA-TEAM Kft" />
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 py-3">
        <SidebarGroup>
          {!collapsed && (
            <SidebarGroupLabel className="px-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50">
              Munkafelület
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">{primary.map(renderItem)}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {ai.length > 0 && (
          <SidebarGroup className="mt-2 border-t border-sidebar-border/40 pt-2">
            {toggle("AI asszisztensek", aiOpen, () => setAiOpen((v) => !v), Bot)}
            {(aiOpen || collapsed) && (
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">{(collapsed ? ai.slice(0, 1) : ai).map(renderItem)}</SidebarMenu>
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        )}

        {more.length > 0 && (
          <SidebarGroup className="mt-2 border-t border-sidebar-border/40 pt-2">
            {toggle("Továbbiak", moreOpen, () => setMoreOpen((v) => !v), MoreHorizontal)}
            {(moreOpen && !collapsed) &&
              more.map((g) => (
                <div key={g.label} className="mt-2">
                  <div className="px-3 pb-1 text-[10px] font-medium text-sidebar-foreground/40">{g.label}</div>
                  <SidebarMenu className="gap-0.5">{g.items.map(renderItem)}</SidebarMenu>
                </div>
              ))}
          </SidebarGroup>
        )}
      </SidebarContent>
      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border/60 px-4 py-3 text-[11px] text-sidebar-foreground/50">
          Szerepkör: <span className="text-sidebar-foreground/80">{ROLE_LABEL[role]}</span>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
