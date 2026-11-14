// Egységes navigáció-konfiguráció: az oldalsáv, a mobil alsó menü és a
// „Továbbiak” lap mind ebből dolgozik. Láthatóságot kizárólag
// canAccessRoute + hideForRoles dönt el — jogosultságot nem módosít.
import {
  LayoutDashboard, Home, Briefcase, FileText, Sparkles, Building2, Mail, Phone,
  Calendar, FolderOpen, Settings, UserPlus, Search, TrendingUp, Hammer, Users,
  Radar, LayoutGrid, Activity, ShieldCheck, BookOpen, ListPlus, Target,
  CheckSquare, Inbox, ClipboardList, Wallet, XCircle,
} from "lucide-react";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";

export type NavItem = {
  title: string;
  short?: string; // mobil alsó menü felirata
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  search?: Record<string, string>;
  agentId?: string;
  hideForRoles?: RoleSlug[];
};

export type NavGroup = { label: string; items: NavItem[] };

export const HOME: NavItem = { title: "Ma", url: "/today", icon: Home };

export const WORKSPACES_BY_ROLE: Record<RoleSlug, NavItem[]> = {
  owner: [
    { title: "Irányítópult", short: "Vezetői", url: "/dashboard", icon: LayoutDashboard },
    { title: "Pipeline", url: "/sales/leads", icon: Target },
    { title: "Projektek", url: "/projects", icon: Briefcase },
    { title: "Ajánlatok", url: "/quotes", icon: FileText },
    { title: "Jelenlét", url: "/attendance", icon: ClipboardList },
  ],
  sales: [
    { title: "Sales-előkészítés", short: "Előkészítés", url: "/leads", icon: Sparkles },
    { title: "Pipeline", url: "/sales/leads", icon: Target },
    { title: "Ajánlatok", url: "/quotes", icon: FileText },
    { title: "Projektek", url: "/projects", icon: Briefcase },
  ],
  marketing: [
    { title: "Érdeklődők feldolgozása", short: "Ügyek", url: "/leads", icon: Sparkles },
    { title: "Weboldali igények", short: "Igények", url: "/web-quote-requests", icon: Inbox },
    { title: "Kampányok", short: "Kampány", url: "/campaign-list", icon: ListPlus },
    { title: "Emailek", url: "/emails", icon: Mail },
    { title: "Hívások", url: "/calls", icon: Phone },
  ],
  project_manager: [
    { title: "Projektek", url: "/projects", icon: Briefcase },
    { title: "Feladatok", url: "/tasks", icon: CheckSquare },
    { title: "Találkozók", url: "/meetings", icon: Calendar },
    { title: "Dokumentumok", short: "Doksik", url: "/documents", icon: FolderOpen },
    { title: "Jelenlét", url: "/attendance", icon: ClipboardList },
  ],
};

export const AI_ITEMS: NavItem[] = [
  { title: "AI Asszisztensek", url: "/ai-assistants", icon: LayoutGrid },
  { title: "George – CRM Navigátor", url: "/ai-assistant", icon: Search, search: { agent: "crm" }, agentId: "crm" },
  { title: "Timothy – Értékesítés", url: "/ai-assistant", icon: TrendingUp, search: { agent: "sales" }, agentId: "sales" },
  { title: "Boss – Projektfelügyelő", url: "/ai-assistant", icon: Hammer, search: { agent: "pm" }, agentId: "pm" },
  { title: "Scarlet – Marketing", url: "/ai-assistant", icon: Radar, search: { agent: "marketing" }, agentId: "marketing" },
];

/** A „Továbbiak” csoportjai — minden ritkábban használt modul itt marad. */
export const MORE_GROUPS: NavGroup[] = [
  {
    label: "Ügyfelek",
    items: [
      { title: "Lead munkafelület", url: "/leads", icon: Sparkles },
      { title: "Ügyfelek és magánszemélyek", short: "Ügyfelek", url: "/customers", icon: Users },
      { title: "Cégek", url: "/companies", icon: Building2 },
      { title: "Kapcsolattartók", url: "/contacts", icon: UserPlus },
      { title: "Kampánylista", url: "/campaign-list", icon: ListPlus },
      { title: "Weboldali ajánlatkérések", url: "/web-quote-requests", icon: Inbox, hideForRoles: ["sales"] },
    ],
  },
  {
    label: "Kommunikáció",
    items: [
      { title: "Emailek", url: "/emails", icon: Mail },
      { title: "Hívások", url: "/calls", icon: Phone, hideForRoles: ["sales"] },
      { title: "Találkozók", url: "/meetings", icon: Calendar, hideForRoles: ["sales"] },
      { title: "Utánkövetések", url: "/followups", icon: CheckSquare, hideForRoles: ["sales"] },
    ],
  },
  {
    label: "Nézetek",
    items: [
      { title: "Sales áttekintés", url: "/sales", icon: LayoutDashboard, hideForRoles: ["sales", "marketing"] },
      { title: "Teendők (riport)", url: "/sales/todo", icon: CheckSquare, hideForRoles: ["marketing"] },
      { title: "Ajánlatok (riport)", url: "/sales/quotes", icon: FileText, hideForRoles: ["sales", "marketing"] },
      { title: "Elveszett leadek", url: "/leads/lost", icon: XCircle, hideForRoles: ["marketing"] },
      { title: "Aktivitás", url: "/activity", icon: Activity, hideForRoles: ["sales", "marketing"] },
      { title: "Feladatok", url: "/tasks", icon: CheckSquare, hideForRoles: ["sales"] },
    ],
  },
  {
    label: "Tulajdonos",
    items: [
      { title: "Adatellenőrzés", url: "/import-review", icon: ShieldCheck },
      { title: "Levél–cég ellenőrzés", url: "/import-review/mail", icon: ShieldCheck },
      { title: "Adott fizetések", url: "/attendance/payouts", icon: Wallet, hideForRoles: ["sales", "marketing", "project_manager"] },
    ],
  },
  {
    label: "Rendszer",
    items: [
      { title: "Segítség / Probléma jelzése", short: "Segítség", url: "/help", icon: BookOpen },
      { title: "Dokumentumok", url: "/documents", icon: FolderOpen },
      { title: "Adatminőség", url: "/data-quality", icon: ShieldCheck },
      { title: "Marketing súgó", url: "/help/marketing", icon: BookOpen, hideForRoles: ["sales"] },
      { title: "Sales súgó", url: "/help/sales", icon: BookOpen, hideForRoles: ["marketing"] },
      { title: "Tulajdonosi súgó", url: "/help/owner", icon: BookOpen, hideForRoles: ["sales", "marketing", "project_manager"] },
      { title: "Projektvezetői súgó", url: "/help/pm", icon: BookOpen, hideForRoles: ["sales", "marketing"] },
      { title: "Saját Gmail-fiók", url: "/settings/gmail", icon: Settings, hideForRoles: ["owner"] },
      { title: "Beállítások", url: "/settings", icon: Settings },
    ],
  },
];

const allowed = (role: RoleSlug) => (i: NavItem) =>
  canAccessRoute(role, i.url) && !(i.hideForRoles?.includes(role) ?? false);

export function primaryItems(role: RoleSlug): NavItem[] {
  const home = { ...HOME, short: "Ma", title: role === "owner" ? "Mai vezetői munka" : role === "sales" ? "Ma · feladataim" : role === "project_manager" ? "Mai projektmunka" : "Mai munka" };
  return [home, ...(WORKSPACES_BY_ROLE[role] ?? WORKSPACES_BY_ROLE.owner)].filter(allowed(role));
}

export function aiItems(role: RoleSlug, visibleAgentIds: Set<string>): NavItem[] {
  return AI_ITEMS.filter(allowed(role)).filter((i) => !i.agentId || visibleAgentIds.has(i.agentId));
}

/** Továbbiak: ami már a fő menüben van, itt nem ismétlődik. */
export function moreGroups(role: RoleSlug): NavGroup[] {
  const primary = new Set(primaryItems(role).map((i) => i.url));
  return MORE_GROUPS.map((g) => ({
    label: g.label,
    items: g.items.filter(allowed(role)).filter((i) => !primary.has(i.url)),
  })).filter((g) => g.items.length > 0);
}

export function isNavActive(pathname: string, url: string): boolean {
  if (url === "/leads") return pathname === "/leads" || /^\/leads\/(?!lost(\/|$))/.test(pathname);
  if (url === "/sales") return pathname === "/sales";
  if (url === "/attendance") return pathname === "/attendance" || (pathname.startsWith("/attendance/") && !pathname.startsWith("/attendance/payouts"));
  return pathname === url || pathname.startsWith(url + "/");
}
