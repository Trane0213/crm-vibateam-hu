// Izolált TESZT-próba bemenete: kitalált TESZT-sorokból a valódi buildOrgSignals állítja elő a választ.
import { buildOrgSignals, summarizeOrgSignals, type OrgInputs } from "../../src/lib/george/org-signals";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", L1 = "11111111-1111-4111-8111-111111111111", L2 = "22222222-2222-4222-8222-222222222222";
const inputs: OrgInputs = {
  now: "2026-11-14T09:00:00.000Z",
  leads: [
    { id: L1, status: "follow_up", assigned_to: "TESZT-sales", next_step_type: "phone", next_step_due_at: "2026-11-12T09:00:00Z", company_id: "TESZT-company", created_at: "2026-11-01T00:00:00Z" },
    { id: L2, status: "won", assigned_to: "TESZT-sales", next_step_type: null, next_step_due_at: null, company_id: "TESZT-company", created_at: "2026-10-01T00:00:00Z" },
  ],
  projects: [
    { id: P1, title: "TESZT Árnyas utca felújítás", status: "atadas", lead_id: L2, company_id: "TESZT-company", project_manager_user_id: "TESZT-pm", handoff_payload: { summary: "ok" }, handoff_at: "2026-11-09T10:00:00Z", start_date: "2026-11-09", deadline: null, address: null },
    { id: P2, title: "TESZT Lépcsőház", status: "kivitelezes", lead_id: null, company_id: null, project_manager_user_id: null, handoff_payload: null, handoff_at: null, start_date: null, deadline: "2026-11-01", address: "TESZT utca 2." },
  ],
  tasks: [{ id: "t1", title: "TESZT lejárt villanyszerelés", status: "open", due_date: "2026-11-12T09:00:00Z", project_id: P2, assigned_user: null }],
  followups: [{ id: "f1", lead_id: L1, project_id: null, due_date: "2026-11-13T09:00:00Z", followup_type: "call", assigned_to: "TESZT-sales" }],
  sentQuotes: [{ id: "q-unproven", status: "sent", lead_id: L1, project_id: null, title: "TESZT ajánlat bizonyíték nélkül" }],
  provenQuoteIds: [], projectQuoteIds: [], projectContacts: [{ project_id: P2 }],
  issues: [
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccc01", category: "ux", status: "new", page_path: `/quotes/${P1}`, reporter_role: "sales", created_at: "2026-11-10T10:00:00Z", updated_at: null, technical_code: null, ai_analyzed_at: null, reporter_verdict: null },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccc02", category: "ux", status: "new", page_path: `/quotes/${P2}`, reporter_role: "project_manager", created_at: "2026-11-12T10:00:00Z", updated_at: null, technical_code: null, ai_analyzed_at: null, reporter_verdict: null },
    { id: "cccccccc-cccc-4ccc-8ccc-cccccccccc03", category: "bug", status: "closed", page_path: "/tasks", reporter_role: "project_manager", created_at: "2026-11-05T10:00:00Z", updated_at: "2026-11-08T10:00:00Z", technical_code: null, ai_analyzed_at: null, reporter_verdict: "resolved" },
  ],
  findings: [],
  signals: [{ id: "s1", signal_key: `sales_overdue:${L1}:2026-11-12`, domain: "sales", agent: "timothy", severity: "warning", title: "Lejárt következő lépés", source_table: "leads", source_id: L1, occurrences: 3, first_seen_at: "2026-11-12T10:07:00Z", last_seen_at: "2026-11-14T08:07:00Z", review_status: "pending", issue_id: null }],
  notices: [], documentErrors: [], documentsNeedReview: 0, imports: [{ kind: "company", count: 14 }, { kind: "email_thread", count: 39 }],
  people: { "TESZT-pm": "TESZT Projektvezető", "TESZT-sales": "TESZT Értékesítő" }, companies: { "TESZT-company": "TESZT Társasház" },
};
const items = buildOrgSignals(inputs);
const sources = ["leads", "projects", "tasks"].map((k) => ({ key: k, label: k, state: "ok", rows: 1, total: 1 }));
console.log(JSON.stringify({ generatedAt: inputs.now, items, summary: summarizeOrgSignals(items), sources, collectorEnabled: false, llmCalls: 0, writes: 0 }));
