import { createFileRoute, Link, Outlet, useRouterState, Navigate } from "@tanstack/react-router";
import { ClipboardList, CalendarPlus, BarChart3, Users, BookOpen, Zap } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/attendance")({
  component: AttendanceLayout,
});

const tabs = [
  { to: "/attendance", label: "Napló", icon: ClipboardList, exact: true },
  { to: "/attendance/quick", label: "Gyors rögzítés", icon: Zap },
  { to: "/attendance/new", label: "Új rögzítés", icon: CalendarPlus },
  { to: "/attendance/summary", label: "Időszak", icon: BarChart3 },
  { to: "/attendance/workers", label: "Dolgozók / projektek", icon: Users },
  { to: "/attendance/guide", label: "Útmutató", icon: BookOpen },
] as const;

function AttendanceLayout() {
  const { role, isLoading } = usePermissions();
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (isLoading) return null;
  if (role !== "owner" && role !== "project_manager") {
    return <Navigate to="/today" />;
  }
  return (
    <div className="flex flex-col">
      <div className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">Jelenlét</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Napi jelenléti napló, időszaki összesítő, dolgozó- és projektlista.
        </p>
      </div>
      <nav className="flex gap-1 border-b px-4 pt-2">
        {tabs.map((t) => {
          const exact = "exact" in t && t.exact;
          const active = exact ? path === t.to : path === t.to || path.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 rounded-t-md px-3 py-2 text-sm transition-colors ${
                active
                  ? "bg-background border border-b-background -mb-px text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-6">
        <Outlet />
      </div>
    </div>
  );
}