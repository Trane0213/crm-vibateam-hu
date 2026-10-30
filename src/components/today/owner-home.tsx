import { Link } from "@tanstack/react-router";
import { TrendingUp, Sparkles } from "lucide-react";
import { WelcomeHeader } from "@/components/welcome-header";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { OwnerKpiStrip } from "@/components/dashboard/owner-kpi-strip";
import { SectionLabel } from "@/components/today/today-shell";

/**
 * Tulajdonosi „Ma" — gyors napi vezetői fókusz. A részletes bontás az
 * Irányítópulton van; a KPI sáv mindkét oldalon ugyanaz a komponens.
 */
export function OwnerHome() {
  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Vezetői napi áttekintés — a teljes csapat mai fókusza." />

      <div className="px-6 pt-4">
        <OwnerKpiStrip />
      </div>

      <div className="px-6 pt-4">
        <DailyBriefing />
      </div>

      <SectionLabel
        title="Részletek"
        action={<Link to="/dashboard" className="text-xs text-primary hover:underline">Részletes irányítópult →</Link>}
      />
      <div className="px-6 pb-6 text-xs text-muted-foreground">
        Ügyfél-, projekt-, terheltségi és utókövetési bontás az Irányítópulton.
        <div className="mt-2 flex gap-4">
          <Link to="/dashboard" className="inline-flex items-center gap-2 text-primary hover:underline">
            <TrendingUp className="h-3.5 w-3.5" /> Irányítópult
          </Link>
          <Link to="/ai-assistants" className="inline-flex items-center gap-2 text-primary hover:underline">
            <Sparkles className="h-3.5 w-3.5" /> AI Asszisztensek
          </Link>
        </div>
      </div>
    </div>
  );
}
