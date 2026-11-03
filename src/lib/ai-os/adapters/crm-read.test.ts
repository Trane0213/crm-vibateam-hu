import { beforeEach, describe, expect, it } from "vitest";
import { registerCrmTools } from "./crm-tools.server";
import { getTool, toolsForAgent } from "../tool-registry";
import { crmReadPage, leadTimeline, readWindow } from "./crm-read-page";
import { modelToolPayload } from "../tool-payload";
import type { ToolContext } from "../types";
import { userReference, readTimestamp } from './crm-read-input';
import { quoteContext } from './quote-context';

type Row = Record<string, unknown>;
function fixture(tables: Record<string, Row[]>, visibleLeadIds?: string[], errors: string[] = []) {
  const calls: string[] = [];
  const client = { from(table: string) {
    calls.push(table);
    let rows = [...(tables[table] ?? [])];
    if (table === "leads" && visibleLeadIds) rows = rows.filter((r) => visibleLeadIds.includes(String(r.id)));
    let from = 0, to = 999;
    let single = false;
    const filters: [string, unknown][] = [];
    const q = {
      select() { return q; },
      eq(key: string, value: unknown) { filters.push([key, value]); return q; },
      is(key: string, value: unknown) { filters.push([key, value]); return q; },
      order() { return q; },
      range(a: number, b: number) { from = a; to = b; return q; },
      maybeSingle() { single = true; return q; },
      then(resolve: (value: unknown) => unknown) {
        const filtered = rows.filter((r) => filters.every(([key, value]) => {
          if (key.startsWith("details->>")) return (r.details as Row)?.[key.slice(10)] === value;
          if (key === "leads.company_id") return (tables.leads ?? []).some((l) => l.id === r.lead_id && l.company_id === value && (!visibleLeadIds || visibleLeadIds.includes(String(l.id))));
          if (key === "projects.company_id") return (tables.projects ?? []).some((p) => p.id === r.project_id && p.company_id === value);
          return r[key] === value;
        }));
        return Promise.resolve(resolve({ data: errors.includes(table) ? null : single ? filtered[0] ?? null : filtered.slice(from, to + 1), count: filtered.length, error: errors.includes(table) ? { message: "TESZT query failure" } : null }));
      },
    };
    return q;
  } };
  return { calls, ctx: { userId: "00000000-0000-4000-8000-000000000001", agentId: "timothy", threadId: null, runId: "TESZT", supabaseUser: client, supabaseAdmin: {} } as unknown as ToolContext };
}
async function execute(name: string, args: Row, ctx: ToolContext): Promise<any> {
  const tool = getTool(name);
  if (!tool) throw new Error("Missing tool");
  return tool.execute(args, ctx);
}

beforeEach(registerCrmTools);
describe("Timothy P1/A CRM reads", () => {
  it('resolves me to the authenticated assignee in leads and followups', async () => {
    for (const table of ['leads', 'followups']) {
      const f = fixture({ [table]: [{id:'own',assigned_to:'00000000-0000-4000-8000-000000000001',completed:false},{id:'other',assigned_to:'00000000-0000-4000-8000-000000000002',completed:false}] });
      const out = await execute(`crm_list_${table}`, {assigned_to:'me'}, f.ctx);
      expect(out.data.items.map((r: Row) => r.id)).toEqual(['own']);
    }
  });
  it('rejects malformed assignees before a database call', async () => {
    const f = fixture({});
    await expect(execute('crm_list_followups', {assigned_to:'Ramon'}, f.ctx)).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  it('rejects me used as a quote entity before any database call', async () => {
    const f=fixture({}); const out=await execute('crm_list_quotes',{lead_id:'me'},f.ctx);
    expect(out.ok).toBe(false); expect(f.calls).toEqual([]);
  });
  it('rejects malformed dates and invalid legacy page sizes before querying', async () => {
    for (const args of [{due_before:'2026-11-03'}, {limit:-1}, {limit:1.5}, {offset:-1}]) {
      const f=fixture({}); await expect(execute('crm_list_followups',args,f.ctx)).rejects.toThrow(); expect(f.calls).toEqual([]);
    }
  });
  it('pages followups beyond the former silent 25-row limit', async () => {
    const f=fixture({followups:Array.from({length:39},(_,i)=>({id:`f${i}`,completed:false}))});
    const first=await execute('crm_list_followups',{limit:25},f.ctx);
    const second=await execute('crm_list_followups',{limit:25,offset:first.data.pagination.next_offset},f.ctx);
    expect(first.data.pagination.total_visible).toBe(39); expect(second.data.items.length).toBe(14); expect(second.data.pagination.has_more).toBe(false);
  });
  it('accepts offset ISO dates and does not resolve entity-like names',()=>{
    expect(readTimestamp('2026-11-03T19:00:00+01:00')).toBe('2026-11-03T19:00:00+01:00');
    expect(()=>userReference('Ramon','00000000-0000-4000-8000-000000000001')).toThrow();
  });
  it("filters leads directly by company_id and excludes another company", async () => {
    const { ctx } = fixture({ leads: [{ id: "a", company_id: "company-a" }, { id: "b", company_id: "company-b" }] });
    const out = await execute("crm_list_leads", { company_id: "company-a" }, ctx);
    expect(out.data.items.map((r: Row) => r.id)).toEqual(["a"]);
    expect(out.data.pagination.total_visible).toBe(1);
  });
  it("reads all 1205 visible leads in bounded pages without a 1000-row cap", async () => {
    const rows = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), company_id: "c" }));
    const { ctx } = fixture({ leads: rows });
    const ids: string[] = [];
    let offset: number | null = 0;
    while (offset !== null) {
      const out = await execute("crm_list_leads", { company_id: "c", offset, limit: 100 }, ctx);
      ids.push(...out.data.items.map((r: Row) => String(r.id)));
      offset = out.data.pagination.next_offset;
    }
    expect(ids.length).toBe(1205);
    expect(new Set(ids).size).toBe(1205);
  });
  it("does not leak another sales user's lead via company listing", async () => {
    const { ctx } = fixture({ leads: [{ id: "own", company_id: "c" }, { id: "other", company_id: "c" }] }, ["own"]);
    const out = await execute("crm_list_leads", { company_id: "c" }, ctx);
    expect(out.data.items.map((r: Row) => r.id)).toEqual(["own"]);
  });
  it("checks lead visibility before any broadly readable history table", async () => {
    const { ctx, calls } = fixture({ leads: [{ id: "foreign" }], followups: [{ id: "secret", lead_id: "foreign" }] }, []);
    const out = await execute("crm_lead_history", { lead_id: "foreign", section: "followups" }, ctx);
    expect(out.ok).toBe(false);
    expect(calls).toEqual(["leads"]);
  });
  it("requires exact lead entity type as well as id for audit history", async () => {
    const { ctx } = fixture({ leads: [{ id: "own" }], activities: [
      { id: "right", details: { entity_type: "leads", entity_id: "own" }, created_at: "2026-11-03T10:00:00Z" },
      { id: "wrong-type", details: { entity_type: "quotes", entity_id: "own" } },
      { id: "wrong-id", details: { entity_type: "leads", entity_id: "foreign" } },
    ] });
    const out = await execute("crm_lead_history", { lead_id: "own", section: "activities" }, ctx);
    expect(out.data.items.map((r: Row) => r.id)).toEqual(["right"]);
  });
  it("pages more than 30 status changes with concrete source IDs", async () => {
    const history = Array.from({ length: 39 }, (_, i) => ({ id: `s${i}`, lead_id: "own", changed_at: new Date(Date.UTC(2026, 10, 3, 0, i)).toISOString() }));
    const { ctx } = fixture({ leads: [{ id: "own" }], lead_status_history: history });
    const first = await execute("crm_lead_history", { lead_id: "own", limit: 25 }, ctx);
    expect(first.data.pagination.total_visible).toBe(39);
    expect(first.data.pagination.has_more).toBe(true);
    const second = await execute("crm_lead_history", { lead_id: "own", limit: 25, offset: first.data.pagination.next_offset }, ctx);
    expect(new Set([...first.data.items, ...second.data.items].map((r: Row) => r.id)).size).toBe(39);
    expect(second.data.pagination.has_more).toBe(false);
    expect(second.data.sources[0].table).toBe("lead_status_history");
  });
  it("visible company summary reports actual totals rather than the first five rows", async () => {
    const { ctx } = fixture({ companies: [{ id: "c" }], contacts: Array.from({ length: 35 }, (_, i) => ({ id: `c${i}`, company_id: "c" })) });
    const out = await execute("crm_company_overview", { company_id: "c" }, ctx);
    expect(out.data.sections.contacts.pagination.total_visible).toBe(35);
    expect(out.data.sections.contacts.items.length).toBe(5);
    expect(out.data.sections.contacts.pagination.next_offset).toBe(5);
    expect(out.data.sections.contacts.completeness.full_company_history).toBe(false);
  });
  it("returns query failures, not fake empty successes or zero counts", async () => {
    const { ctx } = fixture({ leads: [] }, undefined, ["leads"]);
    expect((await execute("crm_list_leads", {}, ctx)).ok).toBe(false);
    const empty = fixture({ leads: [] });
    const out = await execute("crm_list_leads", {}, empty.ctx);
    expect(out.ok).toBe(true);
    expect(out.data.pagination.total_visible).toBe(0);
  });
  it("fails company summary if any dependent query fails", async () => {
    const { ctx } = fixture({ companies: [{ id: "c" }] }, undefined, ["contacts"]);
    await expect(execute("crm_company_overview", { company_id: "c" }, ctx)).rejects.toMatchObject({ message: "TESZT query failure" });
  });
  it("company quote filter includes leads beyond the first 1000 without downloading IDs", async () => {
    const leads = Array.from({ length: 1205 }, (_, i) => ({ id: String(i), company_id: "c" }));
    const { ctx, calls } = fixture({ leads, quotes: [{ id: "q", lead_id: "1204" }] });
    const out = await execute("crm_list_quotes", { company_id: "c" }, ctx);
    expect(out.data.items.map((r: Row) => r.id)).toEqual(["q"]);
    expect(calls).toEqual(["quotes", "quotes", "quotes"]);
  });
  it("new history tool remains Timothy-only and owner/sales-only", () => {
    const tool = getTool("crm_lead_history");
    expect(tool?.allowed_agents).toEqual(["timothy"]);
    expect(tool?.allowed_roles).toContain("sales");
    for (const role of ["marketing", "pm", null]) expect(toolsForAgent({ agentId: "timothy", agentDomains: ["crm.leads"], userRole: role }).some((t) => t.name === "crm_lead_history")).toBe(false);
  });
});

describe("Explicit completeness and chronology", () => {
  it('does not expose a raw zero as a known amount when there are no items',()=>{
    const out=quoteContext({id:'TESZT',total_amount:0,quote_items:[{count:0}],manual_net_amount:null});
    expect(out.net).toBeNull(); expect(out.amount_display).toBe('Nincs megadva'); expect(out).not.toHaveProperty('total_amount');
  });
  it("sorts by actual timestamps and never marks pending followups as completed contact", () => {
    const timeline = leadTimeline([{ id: "s", changed_at: "2026-11-03T10:00:00Z" }], [
      { id: "done", completed: true, due_date: "2026-11-03T12:00:00+03:00" },
      { id: "pending", completed: false, due_date: "2026-11-01T09:00:00Z" },
    ]);
    expect(timeline.map((r) => r.source.id)).toEqual(["done", "s"]);
    expect(timeline[0].source.table).toBe("followups");
  });
  it("marks page and text truncation and provides non-skipping continuation", () => {
    const rows = Array.from({ length: 100 }, (_, i) => ({ id: String(i), summary: "x".repeat(3000) }));
    const page = crmReadPage(rows, 100, { limit: 100, offset: 0 }, "leads", 6000);
    expect(page.pagination.has_more).toBe(true);
    expect(page.pagination.next_offset).toBe(page.items.length);
    expect(page.completeness.truncated_fields).toContain("0.summary");
    expect(page.completeness.full_company_history).toBe(false);
    expect(page.sources[0]).toEqual({ table: "leads", id: "0" });
  });
  it("rejects invalid page arguments", () => {
    for (const args of [{ limit: 101 }, { limit: 0 }, { offset: -1 }, { offset: 1.5 }]) expect(() => readWindow(args)).toThrow();
  });
  it("oversized model result is valid explicit incomplete JSON, never a cut fragment", () => {
    const out = JSON.parse(modelToolPayload({ ok: true, data: "x".repeat(25000) }));
    expect(out.ok).toBe(false);
    expect(out.incomplete).toBe(true);
    expect(out.returned_records).toBe(0);
    expect(JSON.parse(modelToolPayload({ ok: true, data: [1] }))).toEqual({ ok: true, data: [1] });
  });
});