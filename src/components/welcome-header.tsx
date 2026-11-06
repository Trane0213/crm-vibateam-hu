import { Link } from "@tanstack/react-router";
import { Sun, Sunrise, Sunset, Moon, AlertCircle } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";

function greetingFor(hour: number) {
  if (hour < 5)  return { text: "Jó éjszakát", icon: Moon };
  if (hour < 10) return { text: "Jó reggelt",  icon: Sunrise };
  if (hour < 14) return { text: "Szép napot",  icon: Sun };
  if (hour < 18) return { text: "Üdv újra",    icon: Sun };
  if (hour < 22) return { text: "Jó estét",    icon: Sunset };
  return { text: "Jó éjszakát", icon: Moon };
}

function firstName(full: string | null | undefined, fallback?: string | null): string | null {
  const f = (full ?? "").trim();
  if (!f) return fallback?.trim() || null;
  const parts = f.split(/\s+/);
  // Magyar névsorrend: első szó a vezetéknév — a keresztnév általában a második.
  // Ha csak egy szó van, használjuk azt.
  return parts.length >= 2 ? parts[1] : parts[0];
}

export function WelcomeHeader({ subtitle, title }: { subtitle?: string; title?: string }) {
  const { user } = useAuth();
  const { profile, isLoading } = usePermissions();
  const fullName: string | null = profile?.full_name ?? (user?.user_metadata as any)?.full_name ?? null;
  const emailFallback = user?.email ? user.email.split("@")[0] : null;
  const name = firstName(fullName, emailFallback);
  const hour = new Date().getHours();
  const { text, icon: Icon } = greetingFor(hour);
  const needsName = !isLoading && (!fullName || !fullName.trim());

  return (
    <div className="border-b px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:flex">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-semibold tracking-normal">
              {title ?? <>{text}{name ? <>, <span className="text-primary">{name}</span></> : ""}!</>}
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {subtitle ?? "Kezdjük a mai feladatokkal."}
            </p>
          </div>
        </div>
      </div>
      {needsName && (
        <Link
          to="/settings/profile"
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-status-warning/40 bg-status-warning/10 px-3 py-1.5 text-xs text-foreground hover:bg-status-warning/20"
        >
          <AlertCircle className="h-3.5 w-3.5" />
          Egészítsd ki a teljes nevedet a profilodban →
        </Link>
      )}
    </div>
  );
}