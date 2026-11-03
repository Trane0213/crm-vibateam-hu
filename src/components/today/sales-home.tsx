import { AlertOctagon, BellRing, Sparkles, FileText } from "lucide-react";
import { WelcomeHeader } from "@/components/welcome-header";
import { HeroStat } from "@/components/today/today-shell";
import { SalesWorklists } from "@/components/today/sales-worklists";
import { useDailyWork } from "@/lib/sales/use-daily-work";

/** Sales „Ma": a tulajdonosi KPI-kártyák (HeroStat) vizuális nyelvén, de kizárólag
 *  a saját (useDailyWork) adatokból. Hibánál „!" jelenik meg, nem hamis 0. */
export function SalesHome() {
  const query = useDailyWork();
  const d = query.data;
  const v = (n: number | undefined) => (query.isError ? "!" : n ?? "…");
  const sub = query.isError ? "lekérdezési hiba" : undefined;
  return (
    <div className="flex flex-col">
      <WelcomeHeader subtitle="Saját ügyek és teendők" />
      <div className="space-y-6 px-6 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <HeroStat to="/sales/todo" search={{ bucket: "overdue" }} tone="danger" icon={AlertOctagon}
            label="Lejárt teendők" value={v(d?.buckets.overdue.length)} sub={sub ?? "határidőn túli következő lépés"} />
          <HeroStat to="/sales/todo" search={{ bucket: "today" }} tone="warning" icon={BellRing}
            label="Ma esedékes" value={v(d?.buckets.today.length)} sub={sub ?? "budapesti nap szerint"} />
          <HeroStat to="/leads" tone="info" icon={Sparkles}
            label="Új érdeklődők" value={v(d?.newLeads.length)} sub={sub ?? "utolsó 7 nap, lépés nélkül"} />
          <HeroStat to="/sales/leads" tone="primary" icon={FileText}
            label="Válaszra váró ajánlatok" value={v(d?.waiting.length)} sub={sub ?? "kiküldött, nem piszkozat"} />
        </div>
        <SalesWorklists />
      </div>
    </div>
  );
}
