import { Link } from "@tanstack/react-router";
import { WelcomeHeader } from "@/components/welcome-header";
import { DailyBriefing } from "@/components/ai/daily-briefing";
import { OwnerWorkspace } from "@/components/dashboard/owner-workspace";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";
export function OwnerHome() {
  return <div className="crm-today flex flex-col">
    <WelcomeHeader title="Vezetői áttekintés" subtitle="Üzleti állapot, döntések és a csapat következő lépései." />
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <div className="flex flex-wrap justify-end gap-2"><Button asChild variant="outline" size="sm"><Link to="/owner-report">George jelentése<ArrowUpRight className="h-4 w-4" /></Link></Button><Button asChild variant="outline" size="sm"><Link to="/dashboard" search={{ period: "30" }}>Időszakos részletek<ArrowUpRight className="h-4 w-4" /></Link></Button></div>
      <OwnerWorkspace />
      <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-semibold">Vezetői AI-összefoglaló</summary><div className="pt-3"><DailyBriefing /></div></details>
    </div>
  </div>;
}
