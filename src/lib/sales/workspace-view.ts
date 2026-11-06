import { salesFocusSections, type DailyLead, type dailyWork } from "./daily-work";
/** Presentation of the existing scoped daily rows; never transitions stages. */
export function salesWorkspaceView(data: ReturnType<typeof dailyWork>, now = new Date()) {
  const stages = [
    { key: "new", title: "Új / kapcsolat", tone: "info", statuses: ["new", "contacted"] },
    { key: "prep", title: "Ajánlatkészítés", tone: "primary", statuses: ["quote_prep"] },
    { key: "quote", title: "Ajánlat / követés", tone: "warning", statuses: ["quote_sent", "follow_up"] },
    { key: "contract", title: "Szerződés", tone: "success", statuses: ["contract"] },
  ].map(stage => ({ ...stage, rows: data.leads.filter(lead => !!lead.pipeline_entered_at && stage.statuses.includes(lead.status ?? "")) }));
  const upcoming = data.leads.filter(lead => lead.next_step_due_at && Date.parse(lead.next_step_due_at) >= now.getTime()).sort((a, b) => (a.next_step_due_at ?? "").localeCompare(b.next_step_due_at ?? "") || a.id.localeCompare(b.id));
  return { focus: salesFocusSections(data).flat(), stages, upcoming, closing: stages.find(stage => stage.key === "contract")?.rows.length ?? 0 };
}
export const salesLeadName = (lead: DailyLead) => lead.company_name || lead.summary || lead.source || `Ügy #${lead.id.slice(0, 8)}`;