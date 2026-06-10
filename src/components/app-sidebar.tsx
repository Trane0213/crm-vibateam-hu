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

const sales: Item[] = [
  { title: "Leadek", url: "/leads", icon: Sparkles },
  { title: "Ajánlatok", url: "/quotes", icon: FileText, highlight: true },
  { title: "Follow-up", url: "/followups", icon: BellRing, highlight: true },
];

const projects: Item[] = [
  { title: "Projektek", url: "/projects", icon: Briefcase, highlight: true },
  { title: "Feladatok", url: "/tasks", icon: ListChecks },
  { title: "Dokumentumok", url: "/documents", icon: FolderOpen },
];

const contacts: Item[] = [
  { title: "Cégek", url: "/companies", icon: Building2 },
  { title: "Kapcsolattartók", url: "/contacts", icon: UserPlus },
];

const comms: Item[] = [
  { title: "Emailek", url: "/emails", icon: Mail },
  { title: "Hívások", url: "/calls", icon: Phone },
  { title: "Találkozók", url: "/meetings", icon: Calendar },
];

const ai: Item[] = [
  { title: "CRM Asszisztens", url: "/ai-assistant", icon: Bot, highlight: true },
];

const sys: Item[] = [{ title: "Beállítások", url: "/settings", icon: Settings }];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isActive = (url: string) => pathname === url || pathname.startsWith(url + "/");
  const { role } = usePermissions();
  const visible = (items: Item[]) => items.filter((i) => canAccessRoute(role, i.url));

  const renderGroup = (label: string, items: Item[], withDivider = true) => (
    <SidebarGroup
      key={label || "home"}
      className={withDivider && !collapsed ? "mt-1 border-t border-sidebar-border/60 pt-1" : ""}
    >
      {label && !collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <span className={item.highlight ? "font-medium" : ""}>{item.title}</span>
                  )}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground font-bold">
            V
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold text-sidebar-foreground">VIBA CRM</div>
              <div className="text-[10px] text-sidebar-foreground/60">VIBA-TEAM Kft</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-1">
        {visible(home).length > 0 && renderGroup("", visible(home), false)}
        {visible(sales).length > 0 && renderGroup("Értékesítés", visible(sales))}
        {visible(projects).length > 0 && renderGroup("Projektek", visible(projects))}
        {visible(contacts).length > 0 && renderGroup("Kapcsolatok", visible(contacts))}
        {visible(comms).length > 0 && renderGroup("Kommunikáció", visible(comms))}
        {visible(ai).length > 0 && renderGroup("AI", visible(ai))}
        {visible(sys).length > 0 && renderGroup("Rendszer", visible(sys))}
      </SidebarContent>
    </Sidebar>
  );
}