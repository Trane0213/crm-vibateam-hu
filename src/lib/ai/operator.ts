/**
 * Sales Agent → CRM operátor.
 * Proposal típusok és executor függvények: a CRUD műveleteket NEM hajtjuk
 * végre azonnal — előbb proposal-t adunk vissza a felhasználónak,
 * jóváhagyás után fut le az insert.
 *
 * RLS érvényesül (a user saját session-je), ai_action_log audit minden lépésnél.
 */
import { supabase } from "@/integrations/supabase/client";

export type FollowupProposal = {
  kind: "create_followup";
  due_date: string; // ISO
  followup_type?: "call" | "email" | "meeting" | "other";
  result?: string | null;
  project_id?: string | null;
  contact_id?: string | null;
  company_id?: string | null;
  quote_id?: string | null;
};

export type TaskProposal = {
  kind: "create_task";
  title: string;
  description?: string | null;
  project_id?: string | null;
  due_date?: string | null;
  status?: string;
  priority?: string;
};

export type ContactProposal = {
  kind: "create_contact";
  name: string;
  email?: string | null;
  phone?: string | null;
  company_id?: string | null;
  role?: string | null;
  notes?: string | null;
};

export type LeadProposal = {
  kind: "create_lead";
  summary: string;
  source?: string | null;
  project_type?: string | null;
  status?: string;
  company_id?: string | null;
  contact_id?: string | null;
};

export type Proposal = FollowupProposal | TaskProposal | ContactProposal | LeadProposal;

/** Egy létrejött rekord id-ját + cél route-ot ad vissza. */
export type ExecResult = {
  id: string;
  route?: string;
  params?: Record<string, string>;
};

function pruneNull<T extends Record<string, any>>(obj: T): Partial<T> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/** Adott proposal alapján beszúrja a rekordot. RLS érvényesül. */
export async function executeProposal(p: Proposal): Promise<ExecResult> {
  switch (p.kind) {
    case "create_followup": {
      const payload = pruneNull({
        due_date: p.due_date,
        followup_type: p.followup_type,
        result: p.result,
        project_id: p.project_id,
        contact_id: p.contact_id,
        company_id: p.company_id,
        quote_id: p.quote_id,
        completed: false,
      });
      const { data, error } = await supabase.from("followups").insert(payload as any).select("id").single();
      if (error) throw new Error(error.message);
      return { id: (data as any).id, route: "/followups" };
    }
    case "create_task": {
      const payload = pruneNull({
        title: p.title,
        description: p.description,
        project_id: p.project_id,
        due_date: p.due_date,
        status: p.status ?? "todo",
        priority: p.priority ?? "normal",
      });
      const { data, error } = await supabase.from("tasks").insert(payload as any).select("id").single();
      if (error) throw new Error(error.message);
      return { id: (data as any).id, route: "/tasks" };
    }
    case "create_contact": {
      const payload = pruneNull({
        name: p.name,
        email: p.email,
        phone: p.phone,
        company_id: p.company_id,
        role: p.role,
        notes: p.notes,
      });
      const { data, error } = await supabase.from("contacts").insert(payload as any).select("id").single();
      if (error) throw new Error(error.message);
      return { id: (data as any).id, route: "/contacts/$id", params: { id: (data as any).id } };
    }
    case "create_lead": {
      const payload = pruneNull({
        summary: p.summary,
        source: p.source,
        project_type: p.project_type,
        status: p.status ?? "new",
        company_id: p.company_id,
        contact_id: p.contact_id,
      });
      const { data, error } = await supabase.from("leads").insert(payload as any).select("id").single();
      if (error) throw new Error(error.message);
      return { id: (data as any).id, route: "/leads/$id", params: { id: (data as any).id } };
    }
  }
}

/** Magyar címke proposal típushoz (UI-hoz). */
export function proposalTitle(p: Proposal): string {
  switch (p.kind) {
    case "create_followup": return "Utókövetés létrehozása";
    case "create_task":     return "Feladat létrehozása";
    case "create_contact":  return "Kapcsolattartó létrehozása";
    case "create_lead":     return "Lead létrehozása";
  }
}