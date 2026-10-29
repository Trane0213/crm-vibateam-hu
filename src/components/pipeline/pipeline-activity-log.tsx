import { LEAD_STATUS_LABEL } from "@/lib/sales/constants";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Clock } from "lucide-react";

type ActivityRow = {
  id: string;
  created_at: string;
  action: string;
  user_id: string | null;
  details: any;
};

export function PipelineActivityLog({ leadId }: { leadId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["pipeline", "activity", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("id, created_at, action, user_id, details")
        .eq("details->>entity_type", "leads")
        .eq("details->>entity_id", leadId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Aktivitás betöltése…</div>;
  }
  if (!data || data.length === 0) {
    return (
      <div className="rounded border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Még nincs naplózott esemény ezen a leadhez.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {data.map((row) => {
        const payload = row.details?.payload ?? {};
        return (
          <li key={row.id} className="rounded-md border bg-card/40 p-2.5 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{describe(row.action, payload)}</span>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(row.created_at).toLocaleString("hu-HU")}
              </span>
            </div>
            {payload?.note && (
              <div className="mt-1 whitespace-pre-wrap text-muted-foreground">{payload.note}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const ST = (s: any) => (s ? (LEAD_STATUS_LABEL as Record<string, string>)[s] ?? s : "?");
const FIELD_HU: Record<string, string> = {
  next_step: "következő lépés", next_step_type: "következő lépés", next_step_due_at: "határidő",
  next_step_note: "jegyzet", assigned_to: "felelős", summary: "összefoglaló",
};

function describe(action: string, p: any): string {
  switch (action) {
    case "status_change":
      return `Státuszváltás: ${ST(p?.from)} → ${ST(p?.to)}`;
    case "create":
      return "Lead létrehozva";
    case "pipeline_entered":
      return "Pipeline-ba léptetve";
    case "marketing_handoff":
      return "Marketing átadta a salesnek";
    case "update": {
      const f: string[] = p?.field ? [p.field] : (p?.fields ?? []);
      const names = Array.from(new Set(f.map((x) => FIELD_HU[x] ?? x)));
      return names.length ? `Frissítve: ${names.join(", ")}` : "Frissítve";
    }
    default:
      return action;
  }
}