import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Settings, Mail, Bot, FolderOpen, Users, Shield, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsLayout,
});

const items = [
  { to: "/settings", label: "Áttekintés", icon: Settings, exact: true },
  { to: "/settings/gmail", label: "Gmail", icon: Mail },
  { to: "/settings/openai", label: "OpenAI", icon: Bot },
  { to: "/settings/storage", label: "Tárhely (R2)", icon: FolderOpen },
  { to: "/settings/users", label: "Felhasználók", icon: Users },
  { to: "/settings/roles", label: "Szerepkörök", icon: Shield },
  { to: "/settings/audit", label: "Security Audit", icon: ShieldCheck },
];

function SettingsLayout() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <div className="flex flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Beállítások</h1>
        <p className="mt-1 text-sm text-muted-foreground">Integrációk, felhasználók, jogosultságok.</p>
      </div>
      <div className="grid flex-1 grid-cols-1 md:grid-cols-[220px_1fr]">
        <nav className="border-r p-3 space-y-0.5">
          {items.map((i) => {
            const active = i.exact ? path === i.to : path === i.to || path.startsWith(i.to + "/");
            return (
              <Link key={i.to} to={i.to} className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors ${active ? "bg-secondary text-secondary-foreground font-medium" : "text-muted-foreground hover:bg-muted/50"}`}>
                <i.icon className="h-4 w-4" />{i.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-6"><Outlet /></div>
      </div>
    </div>
  );
}