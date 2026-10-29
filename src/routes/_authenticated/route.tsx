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
import { ROLE_LABEL } from "@/lib/permissions";
import { useRoutePermissions, resolveAccess } from "@/hooks/use-route-permissions";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Sparkles } from "lucide-react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { BrandLogo } from "@/components/brand-logo";
import { CrmNotificationsMenu } from "@/components/crm-notifications-menu";

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
  const rp = useRoutePermissions();
  const allowed = permLoading || rp.isLoading
    ? true
    : resolveAccess(role, pathname, rp.data);
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col min-w-0">
          <header className="sticky top-0 z-30 grid h-14 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b bg-background/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/75 md:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <SidebarTrigger className="hidden md:inline-flex" />
              <Link to="/today" className="flex shrink-0 items-center md:hidden">
                <BrandLogo className="h-6" />
              </Link>
              <div className="hidden min-w-0 md:block">
                <GlobalSearch />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1 md:gap-2">
              <div className="md:hidden">
                <GlobalSearch />
              </div>
              <QuickAddMenu />
              {/* AI-panel helye: a 3. lépésben ez a gomb nyitja az állandó panelt. */}
              <Button asChild size="sm" variant="glow" className="hidden h-8 gap-1.5 rounded-full px-3 sm:inline-flex" data-ai-panel-trigger>
                <Link to="/ai-assistant" search={{ agent: "crm" } as never}>
                  <Sparkles className="h-4 w-4" /> George
                </Link>
              </Button>
              <CrmNotificationsMenu />
              <UserMenu />
            </div>
          </header>
          <PulseBar />
          <main className="flex-1 min-w-0 overflow-auto pb-20 md:pb-0">
            {allowed ? (
              <Outlet />
            ) : (
              <Forbidden role={ROLE_LABEL[role]} />
            )}
          </main>
          <MobileBottomNav />
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
            <Link to="/today">Vissza a kezdőoldalra</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}