import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Home,
  Briefcase,
  FileText,
  Sparkles,
  Building2,
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
  Activity,
  ShieldCheck,
  BookOpen,
  ListPlus,
  Target,
  CheckSquare,
  Inbox,
} from "lucide-react";
import { XCircle } from "lucide-react";
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
import { useVisibleAgents } from "@/hooks/use-visible-agents";
import { BrandLogo } from "@/components/brand-logo";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
  /** Ezekhez a szerepkörökhöz NEM jelenik meg a menüpont. */
  hideForRoles?: import("@/lib/permissions").RoleSlug[];
};

const home: Item[] = [
  { title: "Ma", url: "/today", icon: Home, highlight: true },
];

type AiItem = Item & { search?: Record<string, string> };

type AiAgentItem = AiItem & { agentId?: string };

const aiAgents: AiAgentItem[] = [
  { title: "AI Asszisztensek",                  url: "/ai-assistants",  icon: LayoutGrid, highlight: true },
  { title: "George – CRM Navigátor",            url: "/ai-assistant",   icon: Search,     search: { agent: "crm" },   agentId: "crm",       highlight: true },
  { title: "Timothy – Értékesítési Segítő",     url: "/ai-assistant",   icon: TrendingUp, search: { agent: "sales" }, agentId: "sales",     highlight: true },
  { title: "Boss – Projektfelügyelő",           url: "/ai-assistant",   icon: Hammer,     search: { agent: "pm" },    agentId: "pm",        highlight: true },
  { title: "Scarlet – Marketing Stratéga",      url: "/sales/research", icon: Radar,      agentId: "marketing",                              highlight: true },
];

// A napi sales útvonal: Ma → Workspace → Pipeline → Projekt.
// Ez az egyetlen szerkeszthető folyamat — minden más nézet/riport vagy
// szerepkör-specifikus admin felület.
const workflow: Item[] = [
  { title: "Workspace", url: "/leads", icon: Sparkles, highlight: true },
  { title: "Pipeline", url: "/sales/leads", icon: Target, highlight: true },
  { title: "Elveszett", url: "/leads/lost", icon: XCircle },
  { title: "Projektek", url: "/projects", icon: Briefcase, highlight: true },
];

// Olvasó nézetek — NEM munkafelületek. Szerkesztés a Workspace/Pipeline-on.
const reports: Item[] = [
  { title: "Teendők (riport)", url: "/sales/todo", icon: CheckSquare },
  { title: "Ajánlatok (riport)", url: "/sales/quotes", icon: FileText },
];

const contacts: Item[] = [
  { title: "Ügyfelek", url: "/customers", icon: Users, highlight: true },
  { title: "Cégek", url: "/companies", icon: Building2 },
  { title: "Kapcsolattartók", url: "/contacts", icon: UserPlus },
  { title: "Kampánylista", url: "/campaign-list", icon: ListPlus },
  { title: "Weboldali ajánlatkérések", url: "/web-quote-requests", icon: Inbox },
];

const comms: Item[] = [
  { title: "Emailek", url: "/emails", icon: Mail },
  // Hívások: salesnek elrejtve (kérésre). Email és Találkozók marad.
  { title: "Hívások", url: "/calls", icon: Phone, hideForRoles: ["sales"] },
  { title: "Találkozók", url: "/meetings", icon: Calendar },
];

const sys: Item[] = [
  // Sales nem nyitja meg a régi Irányítópultot — neki a Sales → Áttekintés a fő nézet.
  { title: "Irányítópult", url: "/dashboard", icon: LayoutDashboard, hideForRoles: ["sales"] },
  { title: "Adatminőség", url: "/data-quality", icon: ShieldCheck },
  { title: "Dokumentumok", url: "/documents", icon: FolderOpen },
  { title: "Aktivitás", url: "/activity", icon: Activity, hideForRoles: ["sales"] },
  { title: "Marketing súgó", url: "/help/marketing", icon: BookOpen, hideForRoles: ["sales"] },
  { title: "Beállítások", url: "/settings", icon: Settings },
];

const sales: Item[] = [
  // Sales-nek a Ma az egyetlen kezdőoldal — a Sales Áttekintés ugyanazt
  // a célt szolgálta, ezért náluk elrejtve. Owner/PM számára marad,
  // adminisztratív áttekintésként.
  { title: "Sales áttekintés", url: "/sales", icon: LayoutDashboard, hideForRoles: ["sales"] },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  // A /leads és /leads/lost különálló menüpontok — a Workspace ne villanjon
  // aktívvá, amikor az Elveszett listán vagyunk.
  const isActive = (url: string) => {
    if (url === "/leads") {
      return pathname === "/leads" || /^\/leads\/(?!lost(\/|$))/.test(pathname);
    }
    return pathname === url || pathname.startsWith(url + "/");
  };
  const isAiActive = (agent: string) =>
    pathname.startsWith("/ai-assistant") && new URLSearchParams(searchStr ?? "").get("agent") === agent;
  const { role } = usePermissions();
  const { visibleAgentIds } = useVisibleAgents();
  const visible = (items: Item[]) =>
    items.filter((i) => canAccessRoute(role, i.url))
         .filter((i) => !(i.hideForRoles?.includes(role) ?? false));

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
    const items = aiAgents.filter((i) => {
      if (!canAccessRoute(role, i.url)) return false;
      // A landing item (nincs agentId) mindig látszódik, ha route engedi.
      if (!i.agentId) return true;
      return visibleAgentIds.has(i.agentId);
    });
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
        <Link
          to="/today"
          className="flex items-center gap-2.5 px-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
        >
          {collapsed ? (
            <BrandLogo
              onDark
              className="h-7 w-7 [object-position:left]"
              alt="VIBA-TEAM"
            />
          ) : (
            <BrandLogo onDark className="h-9 max-w-full" alt="VIBA-TEAM Kft" />
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent className="gap-0 px-2 py-2">
        {visible(home).length > 0 && renderGroup("", visible(home), false)}
        {renderAiGroup()}
        {visible(workflow).length > 0 && renderGroup("Workflow", visible(workflow))}
        {visible(reports).length > 0 && renderGroup("Riportok", visible(reports))}
        {visible(contacts).length > 0 && renderGroup("Ügyfelek", visible(contacts))}
        {visible(comms).length > 0 && renderGroup("Kommunikáció", visible(comms))}
        {visible(sales).length > 0 && renderGroup("Admin", visible(sales))}
        {visible(sys).length > 0 && renderGroup("Rendszer", visible(sys))}
      </SidebarContent>
    </Sidebar>
  );
}