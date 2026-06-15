import { supabase } from "@/integrations/supabase/client";
import type { PipelineLead } from "./pipeline-types";
import { PIPELINE_COLUMNS } from "./pipeline-types";
import type { LeadStatus } from "@/lib/sales/constants";

/** Pipeline kanban adatlekérés — pipeline_entered_at NOT NULL + 4 oszlop. */
export async function fetchPipelineLeads(): Promise<PipelineLead[]> {
  const statuses: LeadStatus[] = [...PIPELINE_COLUMNS];
  const { data: leads, error } = await supabase
    .from("leads")
    .select(
      "id, status, source, summary, assigned_to, next_step_type, next_step_due_at, next_step_note, created_at, pipeline_entered_at, company_id, won_at, lost_at, lost_reason",
    )
    .not("pipeline_entered_at", "is", null)
    .in("status", statuses)
    .order("pipeline_entered_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return enrich((leads ?? []) as PipelineLead[]);
}

/** Pipeline-ban lévő won/lost leadek — kis lista a header-be. */
export async function fetchPipelineClosed(): Promise<{ won: number; lost: number }> {
  const { data, error } = await supabase
    .from("leads")
    .select("status")
    .not("pipeline_entered_at", "is", null)
    .in("status", ["won", "lost"]);
  if (error) throw error;
  let won = 0, lost = 0;
  for (const r of data ?? []) {
    if ((r as any).status === "won") won++;
    else if ((r as any).status === "lost") lost++;
  }
  return { won, lost };
}

async function enrich(leads: PipelineLead[]): Promise<PipelineLead[]> {
  if (leads.length === 0) return leads;

  const companyIds = Array.from(new Set(leads.map((l) => l.company_id).filter(Boolean) as string[]));
  const userIds = Array.from(new Set(leads.map((l) => l.assigned_to).filter(Boolean) as string[]));
  const leadIds = leads.map((l) => l.id);

  const [companies, users, quotes] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id,name").in("id", companyIds)
      : Promise.resolve({ data: [] as any[], error: null } as any),
    userIds.length
      ? supabase.from("users_profile_lookup").select("id,full_name").in("id", userIds)
      : Promise.resolve({ data: [] as any[], error: null } as any),
    supabase
      .from("quotes")
      .select("lead_id,total_amount,is_current")
      .in("lead_id", leadIds)
      .eq("is_current", true),
  ]);

  const cmap = new Map<string, string>((companies.data ?? []).map((c: any) => [c.id, c.name]));
  const umap = new Map<string, string>((users.data ?? []).map((u: any) => [u.id, u.full_name]));
  const qmap = new Map<string, number>(
    (quotes.data ?? []).map((q: any) => [q.lead_id as string, Number(q.total_amount ?? 0)]),
  );

  return leads.map((l) => ({
    ...l,
    company_name: l.company_id ? cmap.get(l.company_id) ?? null : null,
    assignee_name: l.assigned_to ? umap.get(l.assigned_to) ?? null : null,
    quote_total: qmap.get(l.id) ?? null,
  }));
}