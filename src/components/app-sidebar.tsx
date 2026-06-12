import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  BellRing,
  Sparkles,
  Building2,
  ListChecks,
  Mail,
  Phone,
  Calendar,
  FolderOpen,
  Bot,
  Settings,
  UserPlus,
  Search,
  TrendingUp,
  Hammer,
  Users,
  Radar,
  LayoutGrid,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute } from "@/lib/permissions";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; highlight?: boolean };

const home: Item[] = [
  { title: "Irányítópult", url: "/dashboard", icon: LayoutDashboard },
];

type AiItem = Item & { search?: Record<string, string> };

const aiAgents: AiItem[] = [
  { title: "AI Asszisztensek",                  url: "/ai-assistants",  icon: LayoutGrid, highlight: true },
  { title: "George – CRM Navigátor",            url: "/ai-assistant",   icon: Search,     search: { agent: "crm" },   highlight: true },
  { title: "Timothy – Értékesítési Segítő",     url: "/ai-assistant",   icon: TrendingUp, search: { agent: "sales" }, highlight: true },
  { title: "Boss – Projektfelügyelő",           url: "/ai-assistant",   icon: Hammer,     search: { agent: "pm" },    highlight: true },
  { title: "Scarlet – Marketing Stratéga",      url: "/sales/research", icon: Radar,      highlight: true },
];

const sales: Item[] = [
  { title: "Érdeklődők", url: "/leads", icon: Sparkles },
  { title: "Ajánlatok", url: "/quotes", icon: FileText, highlight: true },
  { title: "Utókövetés", url: "/followups", icon: BellRing, highlight: true },
];

const projects: Item[] = [
  { title: "Projektek", url: "/projects", icon: Briefcase, highlight: true },
  { title: "Feladatok", url: "/tasks", icon: ListChecks },
  { title: "Dokumentumok", url: "/documents", icon: FolderOpen },
];

const contacts: Item[] = [
  { title: "Ügyfelek", url: "/customers", icon: Users, highlight: true },
  { title: "Cégek", url: "/companies", icon: Building2 },
  { title: "Kapcsolattartók", url: "/contacts", icon: UserPlus },
];

const comms: Item[] = [
  { title: "Emailek", url: "/emails", icon: Mail },
  { title: "Hívások", url: "/calls", icon: Phone },
  { title: "Találkozók", url: "/meetings", icon: Calendar },
];

const sys: Item[] = [{ title: "Beállítások", url: "/settings", icon: Settings }];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const isAiActive = (agent: string) =>
    pathname.startsWith("/ai-assistant") && new URLSearchParams(searchStr ?? "").get("agent") === agent;
  const { role } = usePermissions();
  const visible = (items: Item[]) => items.filter((i) => canAccessRoute(role, i.url));

  const renderGroup = (label: string, items: Item[], withDivider = true) => (
    <SidebarGroup
      key={label || "home"}
      className={withDivider && !collapsed ? "mt-3 pt-3 border-t border-sidebar-border/40" : ""}
    >
      {label && !collapsed && (
        <SidebarGroupLabel className="px-3 text-[10px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/50">
          {label}
        </SidebarGroupLabel>
      )}
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                asChild
                isActive={isActive(item.url)}
                tooltip={item.title}
                className="h-9 rounded-lg px-3 text-sidebar-foreground/80 transition-all duration-150 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-foreground data-[active=true]:font-medium data-[active=true]:shadow-sm"
              >
                <Link to={item.url} className="flex items-center gap-2.5">
                  <item.icon className="h-[18px] w-[18px] shrink-0 opacity-80" />
                  {!collapsed && (
                    <span className="truncate text-[13px]">{item.title}</span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  const renderAiGroup = () => {
    const items = aiAgents.filter((i) => canAccessRoute(role, i.url));
    if (items.length === 0) return null;
    return (
      <SidebarGroup className={!collapsed ? "mt-2 rounded-xl bg-primary/[0.04] px-1 py-2 ring-1 ring-primary/15" : ""}>
        {!collapsed && (
          <SidebarGroupLabel className="px-2 text-[10px] font-medium uppercase tracking-[0.08em] text-primary/80">
            <Bot className="mr-1.5 inline h-3 w-3" /> AI Asszisztensek
          </SidebarGroupLabel>
        )}
        <SidebarGroupContent>
          <SidebarMenu className="gap-0.5">
            {items.map((item) => {
              const agent = item.search?.agent;
              const key = agent ?? item.url;
              const active = agent
                ? isAiActive(agent)
                : isActive(item.url);
              return (
                <SidebarMenuItem key={key}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={item.title}
                    className="h-9 rounded-lg px-3 text-sidebar-foreground/85 transition-all duration-150 hover:bg-primary/10 hover:text-foreground data-[active=true]:bg-primary/15 data-[active=true]:text-foreground data-[active=true]:font-medium"
                  >
                    <Link
                      to={item.url}
                      {...(agent ? { search: { agent } as any } : {})}
                      className="flex items-center gap-2.5"
                    >
                      <item.icon className="h-[18px] w-[18px] shrink-0 text-primary" />
                      {!collapsed && <span className="truncate text-[13px]">{item.title}</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5 px-3 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold shadow-sm">
            V
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">VIBA CRM</div>
              <div className="text-[11px] text-sidebar-foreground/55">VIBA-TEAM Kft</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 py-2">
        {visible(home).length > 0 && renderGroup("", visible(home), false)}
        {renderAiGroup()}
        {visible(sales).length > 0 && renderGroup("Értékesítés", visible(sales))}
        {visible(projects).length > 0 && renderGroup("Projektek", visible(projects))}
        {visible(contacts).length > 0 && renderGroup("Ügyfelek", visible(contacts))}
        {visible(comms).length > 0 && renderGroup("Kommunikáció", visible(comms))}
        {visible(sys).length > 0 && renderGroup("Rendszer", visible(sys))}
      </SidebarContent>
    </Sidebar>
  );
}