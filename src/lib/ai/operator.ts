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

/** Norm: levágja a fehér karaktereket, kisbetűsít, többszörös szóközöket egyetlenné von össze. */
function norm(s?: string | null): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Kerek perc — durva időegyezést detektál (max 5 perc különbség = duplikátum). */
function withinMinutes(a: string, b: string, mins: number): boolean {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (!Number.isFinite(da) || !Number.isFinite(db)) return false;
  return Math.abs(da - db) <= mins * 60 * 1000;
}

/** Duplikátum-jelzés a UI felé — barátságos hibaüzenet. */
class DuplicateError extends Error {
  constructor(public readonly entity: string, public readonly existingId: string, message: string) {
    super(message);
    this.name = "DuplicateError";
  }
}

/** Pre-insert dedup: ha azonos rekord már létezik, ne hozzunk létre másikat. */
async function checkDuplicate(p: Proposal): Promise<{ id: string; reason: string } | null> {
  switch (p.kind) {
    case "create_followup": {
      // Ugyanaz a (company_id | project_id | quote_id) + due_date ±5 perc + típus → duplikátum.
      const filterCol = p.quote_id ? "quote_id" : p.project_id ? "project_id" : p.company_id ? "company_id" : null;
      const filterVal = p.quote_id ?? p.project_id ?? p.company_id ?? null;
      if (!filterCol || !filterVal) return null;
      const q: any = supabase.from("followups").select("id,due_date,followup_type,completed");
      const { data } = await q.eq(filterCol, filterVal).eq("completed", false).limit(50);
      const hit = (data ?? []).find((r: any) =>
        withinMinutes(r.due_date, p.due_date, 5) &&
        (!p.followup_type || !r.followup_type || r.followup_type === p.followup_type),
      );
      return hit ? { id: (hit as any).id, reason: "Hasonló nyitott utókövetés már létezik ezen időpontra." } : null;
    }
    case "create_task": {
      const title = norm(p.title);
      if (!title || !p.project_id) return null;
      const { data } = await supabase
        .from("tasks")
        .select("id,title,status,due_date,project_id")
        .eq("project_id", p.project_id)
        .limit(100);
      const hit = (data ?? []).find((r: any) =>
        norm(r.title) === title &&
        r.status !== "done" && r.status !== "completed" && r.status !== "cancelled",
      );
      return hit ? { id: (hit as any).id, reason: "Ugyanezzel a címmel már létezik nyitott feladat a projekten." } : null;
    }
    case "create_contact": {
      // Email egyezés (case-insensitive) erős jel; ha nincs email, név + company_id.
      if (p.email && p.email.trim()) {
        const email = p.email.trim().toLowerCase();
        const { data } = await supabase
          .from("contacts")
          .select("id,email")
          .ilike("email", email)
          .limit(5);
        const hit = (data ?? [])[0];
        if (hit) return { id: (hit as any).id, reason: "Kapcsolattartó ezzel az e-mail címmel már létezik." };
      }
      if (p.company_id && p.name) {
        const name = norm(p.name);
        const { data } = await supabase
          .from("contacts")
          .select("id,name,company_id")
          .eq("company_id", p.company_id)
          .limit(100);
        const hit = (data ?? []).find((r: any) => norm(r.name) === name);
        if (hit) return { id: (hit as any).id, reason: "Ugyanilyen nevű kapcsolattartó már létezik ehhez a céghez." };
      }
      return null;
    }
    case "create_lead": {
      // Ha van company_id: ugyanaz a cég + nyitott lead → duplikátum (status nem won/lost).
      if (p.company_id) {
        const { data } = await supabase
          .from("leads")
          .select("id,status,summary,company_id")
          .eq("company_id", p.company_id)
          .limit(20);
        const hit = (data ?? []).find((r: any) => !["won", "lost"].includes(String(r.status)));
        if (hit) return { id: (hit as any).id, reason: "Ezen céghez már létezik nyitott érdeklődő." };
      }
      // Egyébként summary alapján — csak teljes szöveg egyezés erős jel.
      const summary = norm(p.summary);
      if (summary.length > 8) {
        const { data } = await supabase.from("leads").select("id,summary,status").limit(200);
        const hit = (data ?? []).find((r: any) =>
          norm(r.summary) === summary && !["won", "lost"].includes(String(r.status)),
        );
        if (hit) return { id: (hit as any).id, reason: "Ugyanezzel az összefoglalóval már van nyitott érdeklődő." };
      }
      return null;
    }
  }
}

/** Adott proposal alapján beszúrja a rekordot. RLS érvényesül. */
export async function executeProposal(p: Proposal): Promise<ExecResult> {
  // 1) Duplikátum-szűrés mentés előtt.
  try {
    const dup = await checkDuplicate(p);
    if (dup) {
      throw new DuplicateError(p.kind, dup.id, `${dup.reason} (azonosító: ${dup.id})`);
    }
  } catch (e) {
    if (e instanceof DuplicateError) throw e;
    // Ha maga a dedup-lekérdezés esik el, ne blokkoljuk az insertet — csak naplózzuk.
    console.warn("[executeProposal] dedup ellenőrzés sikertelen:", (e as any)?.message);
  }
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