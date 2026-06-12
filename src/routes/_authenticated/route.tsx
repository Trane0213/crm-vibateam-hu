import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PulseBar } from "@/components/pulse-bar";
import { UserMenu } from "@/components/user-menu";
import { GlobalSearch } from "@/components/global-search";
import { QuickAddMenu } from "@/components/quick-add-menu";
import { supabase } from "@/integrations/supabase/client";
import { useEnsureProfile } from "@/hooks/use-ensure-profile";
import { usePermissions } from "@/hooks/use-permissions";
import { canAccessRoute, ROLE_LABEL } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { ShieldAlert } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth" });
    }
  },
  component: AppShell,
});

function AppShell() {
  useEnsureProfile();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { role, isLoading: permLoading } = usePermissions();
  const allowed = permLoading ? true : canAccessRoute(role, pathname);
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="flex h-12 items-center justify-between gap-2 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sticky top-0 z-30">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <Link to="/dashboard" className="flex items-center gap-2">
                <BrandLogo className="h-6 md:h-7" />
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <GlobalSearch />
              <QuickAddMenu />
              <UserMenu />
            </div>
          </header>
          <PulseBar />
          <main className="flex-1 min-w-0 overflow-auto">
            {allowed ? (
              <Outlet />
            ) : (
              <Forbidden role={ROLE_LABEL[role]} />
            )}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function Forbidden({ role }: { role: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold tracking-tight">Nincs jogosultságod</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A jelenlegi szerepkörödhöz ({role}) ez az oldal nem érhető el.
          Ha hozzáférést szeretnél, kérd a rendszergazdát.
        </p>
        <div className="mt-5">
          <Button asChild size="sm">
            <Link to="/dashboard">Vissza az irányítópultra</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}