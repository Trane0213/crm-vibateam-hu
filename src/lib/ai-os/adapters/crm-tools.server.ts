/**
 * AI OS — CRM tool adapterek. SERVER-ONLY.
 *
 * Ezek a toolok a központi Tool Registrybe regisztrálódnak. A CRM séma
 * ismeretét innentől a runtime NEM látja — csak ezek a toolok.
 *
 * Olvasási toolok: a ctx.supabaseUser klienst használják (RLS érvényesül).
 * Írási toolok: needs_approval=true, és a sales_mark_won_with_project RPC-t
 * hívják, ami maga is tartalmaz jogosultság-ellenőrzést.
 */

import { registerTool } from "../tool-registry";

function ok<T>(data: T) { return { ok: true, data }; }
function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, error: message };
}

export function registerCrmTools() {
  // ---------------- GLOBAL SEARCH ----------------
  registerTool(
    {
      name: "crm_search",
      description:
        "Globális keresés cégek, kapcsolattartók, leadek és projektek között név/email/telefon töredékre.",
      domain: "crm.search",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Keresett szöveg (min. 2 karakter)." },
          limit: { type: "integer", default: 10, minimum: 1, maximum: 25 },
        },
        required: ["query"],
      },
    },
    async (args, ctx) => {
      const q = String(args.query ?? "").trim();
      if (q.length < 2) return fail("A keresőszó legalább 2 karakter legyen.");
      const limit = Math.min(Number(args.limit ?? 10), 25);
      const like = `%${q}%`;
      const sb = ctx.supabaseUser;
      const [companies, contacts, leads, projects] = await Promise.all([
        sb.from("companies").select("id,name,domain").or(`name.ilike.${like},domain.ilike.${like}`).limit(limit),
        sb.from("contacts").select("id,full_name,email,company_id").or(`full_name.ilike.${like},email.ilike.${like}`).limit(limit),
        sb.from("leads").select("id,company_id,status,summary,assigned_to").or(`summary.ilike.${like}`).limit(limit),
        sb.from("projects").select("id,name,status").or(`name.ilike.${like}`).limit(limit),
      ]);
      return ok({
        companies: companies.data ?? [],
        contacts: contacts.data ?? [],
        leads: leads.data ?? [],
        projects: projects.data ?? [],
      });
    },
  );

  // ---------------- LIST COMPANIES (no query required) ----------------
  registerTool(
    {
      name: "crm_list_companies",
      description:
        "Cégek listázása a CRM-ből (név, domain, frissítés). Nem igényel keresőszót — alapból a legutóbb frissített cégeket adja. Használd ezt, ha nincs konkrét keresőszó.",
      domain: "crm.companies",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", default: 50, minimum: 1, maximum: 200 },
          name_like: { type: "string", description: "Opcionális név töredék szűrő." },
        },
      },
    },
    async (args, ctx) => {
      let q = ctx.supabaseUser
        .from("companies")
        .select("id,name,domain,updated_at")
        .order("updated_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 50), 200));
      if (args.name_like) q = q.ilike("name", `%${String(args.name_like)}%`);
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  registerTool(
    {
      name: "crm_company_overview",
      description:
        "Egy céghez tartozó összesítő: kapcsolattartók, leadek, projektek, ajánlatok darabszámokkal és rövid listával.",
      domain: "crm.companies",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" } },
        required: ["company_id"],
      },
    },
    async (args, ctx) => {
      const id = String(args.company_id);
      const sb = ctx.supabaseUser;
      const [company, contacts, leads, projects, quotes] = await Promise.all([
        sb.from("companies").select("id,name,domain").eq("id", id).maybeSingle(),
        sb.from("contacts").select("id,full_name,email,phone").eq("company_id", id).limit(25),
        sb.from("leads").select("id,status,summary,updated_at").eq("company_id", id).limit(25),
        sb.from("projects").select("id,name,status").eq("company_id", id).limit(25),
        sb.from("quotes").select("id,status,total_amount,currency,updated_at").eq("company_id", id).limit(25),
      ]);
      return ok({
        company: company.data,
        counts: {
          contacts: contacts.data?.length ?? 0,
          leads: leads.data?.length ?? 0,
          projects: projects.data?.length ?? 0,
          quotes: quotes.data?.length ?? 0,
        },
        contacts: contacts.data ?? [],
        leads: leads.data ?? [],
        projects: projects.data ?? [],
        quotes: quotes.data ?? [],
      });
    },
  );

  // ---------------- COMPANIES ----------------
  registerTool(
    {
      name: "crm_get_company",
      description: "Egy cég részletes adatai ID alapján.",
      domain: "crm.companies",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("companies").select("*").eq("id", String(args.id)).maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("Nem található cég.");
      return ok(data);
    },
  );

  registerTool(
    {
      name: "crm_list_company_contacts",
      description: "Egy céghez tartozó kapcsolattartók listája.",
      domain: "crm.contacts",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" }, limit: { type: "integer", default: 25 } },
        required: ["company_id"],
      },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("contacts")
        .select("id,full_name,email,phone,role,is_primary")
        .eq("company_id", String(args.company_id))
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- LEADS ----------------
  registerTool(
    {
      name: "crm_get_lead",
      description: "Egy lead részletes adatai ID alapján (státusz, fázis, assignee, next_step).",
      domain: "crm.leads",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("leads").select("*").eq("id", String(args.id)).maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("Nem található lead.");
      return ok(data);
    },
  );

  registerTool(
    {
      name: "crm_list_leads",
      description: "Leadek listázása szűrőkkel (status, assigned_to, company_id).",
      domain: "crm.leads",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", description: "pl. new | qualified | pipeline | won | lost" },
          assigned_to: { type: "string" },
          company_id: { type: "string" },
          limit: { type: "integer", default: 25 },
        },
      },
    },
    async (args, ctx) => {
      let q = ctx.supabaseUser.from("leads")
        .select("id,company_id,status,summary,assigned_to,next_step,updated_at")
        .order("updated_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (args.status) q = q.eq("status", String(args.status));
      if (args.assigned_to) q = q.eq("assigned_to", String(args.assigned_to));
      if (args.company_id) q = q.eq("company_id", String(args.company_id));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- PROJECTS ----------------
  registerTool(
    {
      name: "crm_get_project",
      description: "Egy projekt részletei ID alapján.",
      domain: "crm.projects",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("projects").select("*").eq("id", String(args.id)).maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("Nem található projekt.");
      return ok(data);
    },
  );

  registerTool(
    {
      name: "crm_list_projects",
      description: "Projektek listázása szűrőkkel (status, project_manager_user_id).",
      domain: "crm.projects",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          project_manager_user_id: { type: "string" },
          limit: { type: "integer", default: 25 },
        },
      },
    },
    async (args, ctx) => {
      let q = ctx.supabaseUser.from("projects")
        .select("id,name,status,project_manager_user_id,start_date,end_date,updated_at")
        .order("updated_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (args.status) q = q.eq("status", String(args.status));
      if (args.project_manager_user_id) q = q.eq("project_manager_user_id", String(args.project_manager_user_id));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- QUOTES ----------------
  registerTool(
    {
      name: "crm_list_quotes",
      description: "Ajánlatok listázása (lead_id vagy company_id szűrővel).",
      domain: "crm.quotes",
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          company_id: { type: "string" },
          limit: { type: "integer", default: 25 },
        },
      },
    },
    async (args, ctx) => {
      let q = ctx.supabaseUser.from("quotes")
        .select("id,lead_id,company_id,status,total_amount,currency,valid_until,updated_at")
        .order("updated_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (args.lead_id) q = q.eq("lead_id", String(args.lead_id));
      if (args.company_id) q = q.eq("company_id", String(args.company_id));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- EMAILS ----------------
  registerTool(
    {
      name: "crm_list_company_email_threads",
      description: "Egy céghez kötött email szálak listája.",
      domain: "crm.emails",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" }, limit: { type: "integer", default: 20 } },
        required: ["company_id"],
      },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser
        .from("email_threads")
        .select("id,subject,last_message_at,message_count")
        .eq("company_id", String(args.company_id))
        .order("last_message_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 20), 100));
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- FOLLOWUPS / TASKS / MEETINGS ----------------
  registerTool(
    {
      name: "crm_list_followups",
      description: "Aktív utókövetések listája (assignee szerint, határidővel).",
      domain: "crm.followups",
      parameters: {
        type: "object",
        properties: {
          assigned_to: { type: "string" },
          due_before: { type: "string", description: "ISO dátum (csak ezen idő előttiek)." },
          limit: { type: "integer", default: 25 },
        },
      },
    },
    async (args, ctx) => {
      let q = ctx.supabaseUser.from("followups")
        .select("id,subject_type,subject_id,assigned_to,due_at,status,note")
        .neq("status", "done")
        .order("due_at", { ascending: true })
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (args.assigned_to) q = q.eq("assigned_to", String(args.assigned_to));
      if (args.due_before) q = q.lte("due_at", String(args.due_before));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  registerTool(
    {
      name: "crm_list_tasks",
      description: "Projekt feladatok listája (project_id-vel szűrve).",
      domain: "crm.tasks",
      parameters: {
        type: "object",
        properties: {
          project_id: { type: "string" },
          status: { type: "string" },
          limit: { type: "integer", default: 50 },
        },
      },
    },
    async (args, ctx) => {
      let q = ctx.supabaseUser.from("tasks")
        .select("id,project_id,title,status,assigned_to,due_at,updated_at")
        .order("updated_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 50), 200));
      if (args.project_id) q = q.eq("project_id", String(args.project_id));
      if (args.status) q = q.eq("status", String(args.status));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  registerTool(
    {
      name: "crm_list_meetings",
      description: "Közelgő találkozók.",
      domain: "crm.meetings",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "ISO dátum kezdet (alapértelmezett: ma)." },
          limit: { type: "integer", default: 20 },
        },
      },
    },
    async (args, ctx) => {
      const fromIso = args.from ? String(args.from) : new Date().toISOString();
      const { data, error } = await ctx.supabaseUser.from("meetings")
        .select("id,title,starts_at,ends_at,company_id,lead_id,project_id")
        .gte("starts_at", fromIso)
        .order("starts_at", { ascending: true })
        .limit(Math.min(Number(args.limit ?? 20), 100));
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- WRITE: SALES WORKFLOW ----------------
  registerTool(
    {
      name: "sales_mark_won_with_project",
      description:
        "Atomi tranzakció: lead → won státusz + projekt létrehozás. CSAK Timothy hívhatja, felhasználói jóváhagyással.",
      domain: "sales.workflow",
      allowed_agents: ["timothy"],
      needs_approval: true,
      parameters: {
        type: "object",
        properties: {
          lead_id: { type: "string" },
          title: { type: "string" },
          start_date: { type: "string", description: "ISO dátum (YYYY-MM-DD)." },
          project_manager_user_id: { type: "string" },
          notes: { type: "string" },
        },
        required: ["lead_id", "title", "start_date", "project_manager_user_id"],
      },
    },
    async (args, ctx) => {
      const { data, error } = await ctx.supabaseUser.rpc("sales_mark_won_with_project", {
        p_lead_id: String(args.lead_id),
        p_title: String(args.title),
        p_start_date: String(args.start_date),
        p_project_manager_user_id: String(args.project_manager_user_id),
        p_notes: args.notes ? String(args.notes) : null,
      });
      if (error) return fail(error.message);
      return ok({ project_id: data as string });
    },
  );
}