import type { LeadStatus } from "@/lib/sales/constants";

export type PipelineLead = {
  id: string;
  status: LeadStatus;
  source: string | null;
  summary: string | null;
  assigned_to: string | null;
  next_step_type: string | null;
  next_step_due_at: string | null;
  next_step_note: string | null;
  created_at: string;
  pipeline_entered_at: string | null;
  company_id: string | null;
  company_name?: string | null;
  assignee_name?: string | null;
  quote_total?: number | null;
  won_at?: string | null;
  lost_at?: string | null;
  lost_reason?: string | null;
};

/** A kanban 4 oszlopa — a jóváhagyott Pipeline szakaszok. */
export const PIPELINE_COLUMNS: LeadStatus[] = [
  "quote_prep",
  "quote_sent",
  "follow_up",
  "contract",
];