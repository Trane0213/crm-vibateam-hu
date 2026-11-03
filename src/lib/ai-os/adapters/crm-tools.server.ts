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
import { toolError } from "../tool-errors";
import { CRM_PAGE_PROPERTIES, LEAD_CONTEXT_SELECT, crmReadPage, readWindow, leadTimeline } from "./crm-read-page";
import { OWNER_ROLES } from "../roles";
import { safeMailText } from "./gmail-context";
import { registerQuoteTools } from "./quote-tools.server";
import { readQuoteList } from "./quote-read.server";
import { prepActionSchema,verifyPrepAction } from '../prep-action';
import { nextStepActionSchema,verifyNextStepAction } from '../next-step-action';
import { NEXT_STEP_TYPES } from '@/lib/sales/constants';
import {followupActionSchema,verifyFollowupAction} from '../followup-action';
import {contactActionSchema,verifyContactAction} from '../contact-action';

const fail = (err: unknown) => toolError.fromException(err);

function ok<T>(data: T) { return { ok: true, data }; }

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
        sb.from("companies").select("id,name,website,company_type,tax_number,notes").or(`name.ilike.${like},website.ilike.${like}`).limit(limit),
        sb.from("contacts").select("id,name,email,company_id").or(`name.ilike.${like},email.ilike.${like}`).limit(limit),
        sb.from("leads").select("id,company_id,status,summary,assigned_to").or(`summary.ilike.${like}`).limit(limit),
        sb.from("projects").select("id,title,status").or(`title.ilike.${like}`).limit(limit),
      ]);
      const results = { companies, contacts, leads, projects };
      for (const result of Object.values(results)) if (result.error) return fail(result.error.message);
      return ok({ results: Object.fromEntries(Object.entries(results).map(([table, result]) => [table, crmReadPage(result.data ?? [], null, { limit, offset: 0 }, table, 3500)])), limitations: ["Keresési találatok, nem teljes listák; céges/lead listával folytasd a lapozást."] });
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
          ...CRM_PAGE_PROPERTIES,
          name_like: { type: "string", description: "Opcionális név töredék szűrő." },
        },
      },
    },
    async (args, ctx) => {
      const window = readWindow(args);
      let q = ctx.supabaseUser
        .from("companies")
        .select("id,name,website,company_type,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }).range(window.offset, window.offset + window.limit - 1);
      if (args.name_like) q = q.ilike("name", `%${String(args.name_like)}%`);
      const { data, error, count } = await q;
      if (error) return fail(error.message);
      return ok(crmReadPage(data ?? [], count, window, "companies"));
    },
  );

  registerTool(
    {
      name: "crm_company_overview",
      description: "Jogosultan látható céges helyzetkép. Lapozható szekciók, pontos látható darabszám; nem teljes cégtörténet. Lead előzményhez crm_lead_history.",
      domain: "crm.companies",
      parameters: { type: "object", properties: {
        company_id: { type: "string" }, section: { type: "string", enum: ["summary", "contacts", "leads", "projects", "quotes"], default: "summary" }, ...CRM_PAGE_PROPERTIES,
      }, required: ["company_id"] },
    },
    async (args, ctx) => {
      const id = String(args.company_id);
      const sb = ctx.supabaseUser;
      const company = await sb.from("companies").select("id,name,website,company_type,tax_number,notes").eq("id", id).maybeSingle();
      if (company.error) return fail(company.error.message);
      if (!company.data) return fail("Nem található hozzáférhető cég.");
      const section = String(args.section ?? "summary");
      if (!["summary", "contacts", "leads", "projects", "quotes"].includes(section)) return fail("Ismeretlen szekció.");
      const window = readWindow(args, section === "summary" ? 5 : 25);
      const sections = section === "summary" ? ["contacts", "leads", "projects", "quotes"] : [section];
      const results = await Promise.all(sections.map(async (name) => {
        if (name === "quotes") return [name, await readQuoteList({ ...args, company_id: id, limit: window.limit }, ctx, window.limit, section === "summary" ? 3500 : 10000)] as const;
        let query = sb.from(name).select(name === "contacts" ? "id,name,email,phone,position,email_invalid,created_at" : name === "leads" ? LEAD_CONTEXT_SELECT : "id,lead_id,company_id,title,status,created_at", { count: "exact" }).eq("company_id", id);
        query = query.order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true }).range(window.offset, window.offset + window.limit - 1);
        const result = await query;
        if (result.error) throw result.error;
        return [name, crmReadPage(result.data ?? [], result.count, window, name, section === "summary" ? 3500 : 18000)] as const;
      }));
      const companyPage = crmReadPage([company.data], 1, { limit: 1, offset: 0 }, "companies", 2500);
      return ok({ company: companyPage.items[0], company_completeness: companyPage.completeness, sections: Object.fromEntries(results),
        scope: "Csak a felhasználó számára olvasható rekordok; nem teljes cégtörténet.",
        limitations: ["Levéltörzs külön P1/B eszközökkel, ajánlatrészlet crm_quote_context eszközzel olvasható. Dokumentumtartalom P1/D előtt nem értelmezett."],
        sources: companyPage.sources });
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
      return ok(crmReadPage([data], 1, { limit: 1, offset: 0 }, "companies"));
    },
  );

  registerTool(
    {
      name: "crm_list_company_contacts",
      description: "Egy céghez tartozó kapcsolattartók listája.",
      domain: "crm.contacts",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" }, ...CRM_PAGE_PROPERTIES },
        required: ["company_id"],
      },
    },
    async (args, ctx) => {
      const window = readWindow(args);
      const { data, error, count } = await ctx.supabaseUser.from("contacts")
        .select("id,name,email,phone,position,email_invalid,created_at", { count: "exact" }).eq("company_id", String(args.company_id))
        .order("created_at", { ascending: false }).order("id", { ascending: true }).range(window.offset, window.offset + window.limit - 1);
      if (error) return fail(error.message);
      return ok(crmReadPage(data ?? [], count, window, "contacts"));
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
        .from("leads").select(LEAD_CONTEXT_SELECT).eq("id", String(args.id)).maybeSingle();
      if (error) return fail(error.message);
      if (!data) return fail("Nem található lead.");
      return ok(crmReadPage([data], 1, { limit: 1, offset: 0 }, "leads"));
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
          ...CRM_PAGE_PROPERTIES,
        },
      },
    },
    async (args, ctx) => {
      const window = readWindow(args);
      let q = ctx.supabaseUser.from("leads").select(LEAD_CONTEXT_SELECT, { count: "exact" })
        .order("created_at", { ascending: false, nullsFirst: false }).order("id", { ascending: true })
        .range(window.offset, window.offset + window.limit - 1);
      if (args.status) q = q.eq("status", String(args.status));
      if (args.assigned_to) q = q.eq("assigned_to", String(args.assigned_to));
      if (args.company_id) q = q.eq("company_id", String(args.company_id));
      const { data, error, count } = await q;
      if (error) return fail(error.message);
      return ok(crmReadPage(data ?? [], count, window, "leads"));
    },
  );

  registerTool(
    {
      name: "crm_lead_history",
      description: "RLS-látható lead időrendi előzményei. section=status_history/followups/activities külön lapozható; a lead olvashatóságát minden lap előtt ellenőrzi. Audit esemény nem ügyfélkapcsolat. A visszaadott oldal nem teljes történet.",
      domain: "crm.leads", allowed_agents: ["timothy"], allowed_roles: [...OWNER_ROLES, "sales"],
      parameters: { type: "object", properties: { lead_id: { type: "string" }, section: { type: "string", enum: ["status_history", "followups", "activities"], default: "status_history" }, ...CRM_PAGE_PROPERTIES }, required: ["lead_id"] },
    },
    async (args, ctx) => {
      const id = String(args.lead_id);
      const window = readWindow(args);
      const lead = await ctx.supabaseUser.from("leads").select(LEAD_CONTEXT_SELECT).eq("id", id).maybeSingle();
      if (lead.error) return fail(lead.error.message);
      if (!lead.data) return fail("Nem található hozzáférhető lead; előzmény nem olvasható.");
      const section = String(args.section ?? "status_history");
      const table = section === "status_history" ? "lead_status_history" : section === "followups" ? "followups" : section === "activities" ? "activities" : null;
      if (!table) return fail("Ismeretlen előzményszekció.");
      const clock = table === "lead_status_history" ? "changed_at" : table === "followups" ? "due_date" : "created_at";
      let query = ctx.supabaseUser.from(table).select(table === "lead_status_history" ? "id,lead_id,from_status,to_status,changed_by,changed_at,note" : table === "followups" ? "id,lead_id,company_id,followup_type,completed,result,due_date,created_at,assigned_to" : "id,action,details,created_at,user_id", { count: "exact" });
      query = table === "activities" ? query.eq("details->>entity_type", "leads").eq("details->>entity_id", id) : query.eq("lead_id", id);
      const result = await query.order(clock, { ascending: false, nullsFirst: false }).order("id", { ascending: true }).range(window.offset, window.offset + window.limit - 1);
      if (result.error) return fail(result.error.message);
      const page = crmReadPage(result.data ?? [], result.count, window, table, 6500);
      const timeline = leadTimeline(table === "lead_status_history" ? page.items : [], table === "followups" ? page.items : [], table === "activities" ? page.items : []);
      const contacts = timeline.filter((e) => e.kind === "recorded_contact" && ["call", "email", "meeting"].includes(String(e.record.followup_type)));
      return ok({ lead: crmReadPage([lead.data], 1, { limit: 1, offset: 0 }, "leads", 3500), section, ...page, timeline,
        last_recorded_contact_on_page: contacts.at(-1) ?? null,
        limitations: ["Az utolsó rögzített kapcsolat ezen az oldalon nem bizonyítja a teljes Gmail-levelezés utolsó válaszát.", "A due_date tervezett határidő; csak completed=true rekord kerül kapcsolat-eseményként az idővonalra.", "A lead auditnapló nem hívás és nem ügyfélválasz."],
      });
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
        .select("id,title,status,project_manager_user_id,start_date,deadline,created_at")
        .order("created_at", { ascending: false })
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (args.status) q = q.eq("status", String(args.status));
      if (args.project_manager_user_id) q = q.eq("project_manager_user_id", String(args.project_manager_user_id));
      const { data, error } = await q;
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- QUOTES ----------------
  registerQuoteTools();

  // ---------------- EMAILS ----------------
  registerTool(
    {
      name: "crm_list_company_email_threads",
      description: "Pontos mentett company_id-hoz kötött, RLS-látható szálak lapozott metadata-listája. Nem postafiók-hozzáférési bizonyíték; levéltartalomhoz crm_read_email_thread külön fiókellenőrzéssel.",
      domain: "crm.emails",
      parameters: {
        type: "object",
        properties: { company_id: { type: "string" }, lead_id: { type: "string" }, ...CRM_PAGE_PROPERTIES },
        required: ["company_id"],
      },
    },
    async (args, ctx) => {
      const window = readWindow(args, 20);
      if (args.lead_id) {
        const lead = await ctx.supabaseUser.from("leads").select("id,company_id").eq("id", String(args.lead_id)).maybeSingle();
        if (lead.error || !lead.data || lead.data.company_id !== String(args.company_id)) return fail("A lead nem hozzáférhető vagy más céghez tartozik.");
      }
      let query = ctx.supabaseUser
        .from("email_threads")
        .select("id,subject,last_message_at,lead_id,project_id", { count: "exact" })
        .eq("company_id", String(args.company_id))
        .order("last_message_at", { ascending: false, nullsFirst: false }).order("id")
        .range(window.offset, window.offset + window.limit - 1);
      if (args.lead_id) query = query.eq("lead_id", String(args.lead_id));
      const { data, error, count } = await query;
      if (error) return fail(error.message);
      const safeRows = (data ?? []).map((row) => ({ ...row, subject: safeMailText(row.subject).text, subject_status: safeMailText(row.subject).status }));
      return ok(crmReadPage(safeRows, count, window, "email_threads"));
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
        .select("id,lead_id,project_id,company_id,quote_id,followup_type,assigned_to,due_date,completed,result")
        .eq("completed", false)
        .order("due_date", { ascending: true })
        .limit(Math.min(Number(args.limit ?? 25), 100));
      if (args.assigned_to) q = q.eq("assigned_to", String(args.assigned_to));
      if (args.due_before) q = q.lte("due_date", String(args.due_before));
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
        .select("id,project_id,title,status,priority,assigned_user,due_date,created_at")
        .order("created_at", { ascending: false })
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
        .select("id,title,meeting_date,location,summary,company_id,project_id")
        .gte("meeting_date", fromIso)
        .order("meeting_date", { ascending: true })
        .limit(Math.min(Number(args.limit ?? 20), 100));
      if (error) return fail(error.message);
      return ok(data ?? []);
    },
  );

  // ---------------- WRITE: SALES WORKFLOW ----------------
  registerTool({name:'sales_set_lead_contact',domain:'sales.contact',allowed_agents:['timothy'],allowed_roles:['owner','sales'],needs_approval:true,
    description:'Nyitott lead kapcsolattartójának kiválasztása meglévő, azonos céges kontaktra, P0 jóváhagyással. Nem szerkeszt személyadatot/ajánlatot, nem hoz létre vagy töröl kontaktot.',
    parameters:{type:'object',additionalProperties:false,properties:{leadId:{type:'string',format:'uuid'},contactId:{type:'string',format:'uuid'}},required:['leadId','contactId']}},
    async(args,ctx)=>{
      contactActionSchema.parse(args);
      if(!ctx.approvalActionId)throw new Error('Tartós jóváhagyás szükséges.');
      const saved=await ctx.supabaseUser.rpc('sales_set_approved_contact',{p_action_id:ctx.approvalActionId});
      if(saved.error)return fail(saved.error);
      if(!verifyContactAction(saved.data,args))throw new Error('A kapcsolattartó mentése nem igazolt.');
      return ok(saved.data);
    });
  registerTool({name:'sales_create_followup',domain:'sales.followup',allowed_agents:['timothy'],allowed_roles:['owner','sales'],needs_approval:true,
    description:'Tervezett lead-utánkövetés a meglévő followups táblába, P0 jóváhagyással. Meglévő nyitott utánkövetés mellett nem készül új. Nem változtat lead next-step/státuszt és nem küld levelet.',
    parameters:{type:'object',additionalProperties:false,properties:{leadId:{type:'string',format:'uuid'},type:{type:'string',enum:['call','email','meeting','other']},dueAt:{type:'string',description:'Teljes ISO időpont pontos időzónával'},note:{type:'string',maxLength:10000}},required:['leadId','type','dueAt','note']}},
    async(args,ctx)=>{
      followupActionSchema.parse(args);
      if(!ctx.approvalActionId)throw new Error('Tartós jóváhagyás szükséges.');
      const saved=await ctx.supabaseUser.rpc('sales_create_approved_followup',{p_action_id:ctx.approvalActionId});
      if(saved.error)return fail(saved.error);
      if(!verifyFollowupAction(saved.data,args))throw new Error('Az utánkövetés mentése nem igazolt.');
      return ok(saved.data);
    });
  registerTool({name:'sales_update_next_step',domain:'sales.next_step',allowed_agents:['timothy'],allowed_roles:['owner','sales'],needs_approval:true,
    description:'Pontos lead következő lépés típus/dátum/idő/jegyzet mentése P0 jóváhagyással. Nincs törlés, státuszváltás, új followup vagy levélküldés. Hiányzó időpontot tisztázni kell.',
    parameters:{type:'object',additionalProperties:false,properties:{leadId:{type:'string',format:'uuid'},type:{type:'string',enum:[...NEXT_STEP_TYPES]},dueAt:{type:'string',description:'Érvényes ISO dátum+idő pontos Z vagy ±HH:MM időzónával; felhasználó által megadott időpont.'},note:{type:'string',maxLength:10000}},required:['leadId','type','dueAt','note']}},
    async(args,ctx)=>{
      nextStepActionSchema.parse(args);
      if(!ctx.approvalActionId)throw new Error('Tartós jóváhagyás szükséges.');
      const saved=await ctx.supabaseUser.rpc('sales_update_approved_next_step',{p_action_id:ctx.approvalActionId});
      if(saved.error)return fail(saved.error);
      if(!verifyNextStepAction(saved.data,args))throw new Error('A következő lépés mentése nem igazolt.');
      return ok(saved.data);
    });
  registerTool({name:'sales_record_prep_activity',domain:'sales.prep_activity',allowed_agents:['timothy'],allowed_roles:['owner','sales'],needs_approval:true,
    description:'Megtörtént Hívás/E-mail eredmény rögzítése csak előkészítésben lévő ügyön, P0 jóváhagyással és szerveridővel. NEM ment következő lépést, státuszt vagy felelőst.',
    parameters:{type:'object',additionalProperties:false,properties:{leadId:{type:'string',format:'uuid'},type:{type:'string',enum:['call','email']},result:{type:'string',maxLength:10000}},required:['leadId','type','result']}},
    async(args,ctx)=>{
      const input=prepActionSchema.parse(args);
      if(!ctx.approvalActionId)throw new Error('Tartós jóváhagyás szükséges.');
      const lead=await ctx.supabaseUser.from('leads').select('id,company_id,contact_id,assigned_to').eq('id',input.leadId).maybeSingle();
      if(lead.error||!lead.data||lead.data.company_id!==input.context.company_id||lead.data.contact_id!==input.context.contact_id||lead.data.assigned_to!==input.context.assigned_to)throw new Error('Az ügy kapcsolatai változtak; új jóváhagyás szükséges.');
      const saved=await ctx.supabaseUser.rpc('sales_record_approved_prep_activity',{p_action_id:ctx.approvalActionId});
      if(saved.error) return fail(saved.error);
      if(!verifyPrepAction(saved.data,args)) throw new Error('Az aktivitás mentése nem igazolt.');
      return ok(saved.data);
    });
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