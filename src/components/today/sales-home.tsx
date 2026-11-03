import { WelcomeHeader } from "@/components/welcome-header";
import { SalesWorklists } from "@/components/today/sales-worklists";
import { useDailyWork } from "@/lib/sales/use-daily-work";

export function SalesHome() {
  const query = useDailyWork();
  const d = query.data;
  return <div className="flex flex-col">
    <WelcomeHeader subtitle="Saját ügyek és teendők" />
    <div className="px-6 py-4"><SalesWorklists /></div>
    {!query.isError && <div className="grid gap-3 border-t px-6 py-4 sm:grid-cols-4">
      {[{ label: "Lejárt teendők", value: d?.buckets.overdue.length },
        { label: "Mai feladatok", value: d?.buckets.today.length },
        { label: "Új érdeklődők", value: d?.newLeads.length },
        { label: "Nyitott ajánlatok", value: d?.quotes.length }].map(s =>
        <div key={s.label}><div className="text-xs text-muted-foreground">{s.label}</div><div className="text-xl font-semibold">{s.value ?? "—"}</div></div>)}
    </div>}
  </div>;
}
