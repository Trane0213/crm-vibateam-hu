import { beforeEach, describe, expect, it } from "vitest";
import { registerCrmTools } from "./crm-tools.server";
import { getTool, toolsForAgent } from "../tool-registry";
import { quoteContext, quoteFieldChanges, quotePageSummary, quoteSendEvidence, sameQuoteScope } from "./quote-context";
import type { ToolContext } from "../types";

type Row = Record<string, unknown>;
function fixture(tables: Record<string, Row[]>, hidden: string[] = [], errors: string[] = []) {
  const calls: { table: string; filters: [string, unknown][] }[] = [];
  const sb = { from(table: string) {
    const call = { table, filters: [] as [string, unknown][] }; calls.push(call);
    let start = 0, end = 999, single = false;
    const ors: string[] = [];
    const q = { select() { return q; }, eq(key: string, value: unknown) { call.filters.push([key, value]); return q; },
      is(key: string, value: unknown) { call.filters.push([key, value]); return q; }, order() { return q; },
      or(filter: string) { ors.push(filter); return q; },
      range(a: number, b: number) { start = a; end = b; return q; }, maybeSingle() { single = true; return q; },
      then(resolve: (value: unknown) => unknown) {
        const rows = (tables[table] ?? []).filter((r) => !hidden.includes(String(r.id))).filter(r => ors.every(() => r.is_current !== false && !['accepted','rejected','withdrawn','won','lost'].includes(String(r.status)))).filter((r) => call.filters.every(([k, v]) => {
          if (k === "leads.company_id" || k === "projects.company_id") {
            const source = k.split(".")[0];
            return (tables[source] ?? []).some((s) => s.id === r[source === "leads" ? "lead_id" : "project_id"] && s.company_id === v && !hidden.includes(String(s.id)));
          }
          return r[k] === v;
        }));
        return Promise.resolve(resolve({ data: errors.includes(table) ? null : single ? rows[0] ?? null : rows.slice(start, end + 1), count: rows.length, error: errors.includes(table) ? { message: "TESZT read error" } : null }));
      },
    }; return q;
  } };
  return { calls, ctx: { supabaseUser: sb, supabaseAdmin: new Proxy({}, { get() { throw new Error("Admin read forbidden"); } }), agentId: "timothy", userId: "TESZT" } as unknown as ToolContext };
}
async function run(name: string, args: Row, ctx: ToolContext): Promise<any> {
  const tool = getTool(name); if (!tool) throw new Error("Missing tool"); return tool.execute(args, ctx);
}
const quote = (id: string, extra: Row = {}) => ({ id, group_id: "g", lead_id: "l", project_id: null, status: "draft", is_current: true, quote_kind: "viba_offer", quote_items: [{ count: 0 }], ...extra });
beforeEach(registerCrmTools);

describe("Timothy P1/C authoritative quote semantics", () => {
  it("unknown amount is null, not zero, even when a stale total exists without items", () => {
    expect(quoteContext(quote("q", { total_amount: 900 })).net).toBeNull();
  });
  it("manual received-budget net remains authoritative with no items", () => {
    const r = quoteContext(quote("q", { quote_kind: "received_budget", manual_net_amount: 120000, tax_percent: 27 }));
    expect(r.net).toBe(120000); expect(r.amounts?.gross).toBe(152400); expect(r.workflow).toBe("received_budget");
  });
  it("item trigger net wins over manual net and mismatch is reported", () => {
    const r = quoteContext(quote("q", { quote_items: [{ count: 2 }], total_amount: 180000, manual_net_amount: 200000 }));
    expect(r.net).toBe(180000); expect(r.amounts?.mismatch).toBe(true);
  });
  it("old versions and alternatives are not added to current active portfolio", () => {
    const rows = [quote("old", { is_current: false, manual_net_amount: 900000 }), quote("a", { manual_net_amount: 120000 }), quote("b", { manual_net_amount: 150000 }), quote("won", { status: "accepted", manual_net_amount: 300000 })].map(quoteContext);
    expect(quotePageSummary(rows, true)).toMatchObject({ net: 150000, deals: 1, activeCount: 2 });
  });
  it("partial selection never claims a full portfolio", () => {
    expect(quotePageSummary([quoteContext(quote("q"))], false)).toMatchObject({ full_portfolio: false, scope: "page_only_not_full_portfolio", net: null });
  });
  it("all closed and legacy won/lost states are excluded", () => {
    for (const status of ["accepted", "rejected", "withdrawn", "won", "lost"]) expect(quoteContext(quote("q", { status })).active).toBe(false);
  });
  it("send evidence requires successful status plus Gmail id plus timestamp, never proves a reply", () => {
    for (const r of [{ status: "failed", gmail_message_id: "m", sent_at: "2026-11-03" }, { status: "sent", sent_at: "2026-11-03" }, { status: "sent", gmail_message_id: "m" }, { status: "sent", gmail_message_id: "  ", sent_at: "2026-11-03" }]) expect(quoteSendEvidence(r).verified_send_record).toBe(false);
    for (const status of ["sent", "recorded"]) expect(quoteSendEvidence({ status, gmail_message_id: "m", sent_at: "2026-11-03" })).toMatchObject({ verified_send_record: true, customer_response_proven: false });
  });
  it("comparison rejects differing groups or saved cases", () => {
    expect(sameQuoteScope(quote("a"), quote("b"))).toBe(true);
    for (const b of [quote("b", { group_id: "foreign" }), quote("b", { lead_id: "other" }), quote("b", { project_id: "other" })]) expect(sameQuoteScope(quote("a"), b)).toBe(false);
  });
  it("reports explicit field differences without modifying either quote", () => {
    const a = quoteContext(quote("a", { manual_net_amount: 100, technical_scope: "Első" }));
    const b = quoteContext(quote("b", { manual_net_amount: 200, technical_scope: "Második" }));
    const before = JSON.stringify([a, b]);
    expect(quoteFieldChanges(a, b)).toContainEqual({ field: "net", from: 100, to: 200 });
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it("withholds secrets and marks truncated quote text", () => {
    const r = quoteContext(quote("q", { notes: "password=TESZTSECRET", technical_scope: "x".repeat(1800) }));
    expect(r.notes).toBeNull(); expect(JSON.stringify(r)).not.toContain("TESZTSECRET");
    expect(r.content_status).toMatchObject({ technical_scope: { status: "partial", next_offset: 1500 } });
  });
});

describe("Timothy P1/C user-scoped tool flow", () => {
  it('filters historical and closed quotes before open-list pagination on all branches', async () => {
    const rows=[quote('old',{is_current:false}),quote('closed',{status:'accepted'}),quote('open'),quote('p-old',{lead_id:null,project_id:'p',is_current:false}),quote('p-open',{lead_id:null,project_id:'p'})];
    const f=fixture({quotes:rows,leads:[{id:'l',company_id:'c'}],projects:[{id:'p',company_id:'c'}]});
    for(const args of [{selection:'open'}, {selection:'open',company_id:'c'}]) {
      const out=await run('crm_list_quotes',{...args,limit:1},f.ctx);
      expect(out.data.pagination.total_visible).toBe(2);expect(out.data.items[0].id).toBe('open');
      const next=await run('crm_list_quotes',{...args,limit:1,offset:1},f.ctx);
      expect(next.data.items[0].id).toBe('p-open');expect(next.data.historical_items).toEqual([]);
    }
    const history=await run('crm_quote_context',{quote_id:'open',section:'versions'},f.ctx);
    expect(history.data.historical_items.map((r:Row)=>r.id)).toEqual(['old','p-old']);
  });
  it("includes project-only quotes and deduplicates won-lead quotes", async () => {
    const f = fixture({ leads: [{ id: "l", company_id: "c" }], projects: [{ id: "p", company_id: "c" }], quotes: [quote("both", { project_id: "p" }), quote("project", { lead_id: null, project_id: "p" }), quote("other", { lead_id: "foreign" })] });
    const out = await run("crm_list_quotes", { company_id: "c" }, f.ctx);
    expect(out.ok).toBe(true); expect(out.data.items.map((r: Row) => r.id)).toEqual(["both", "project"]); expect(out.data.pagination.total_visible).toBe(2);
  });
  it("pages over 1000 quotes across company branches without gaps", async () => {
    const f = fixture({ leads: [{ id: "l", company_id: "c" }], projects: [{ id: "p", company_id: "c" }], quotes: [...Array.from({ length: 1005 }, (_, i) => quote(`l${i}`)), ...Array.from({ length: 7 }, (_, i) => quote(`p${i}`, { lead_id: null, project_id: "p" }))] });
    const ids: string[] = []; let offset: number | null = 0;
    while (offset !== null) { const out = await run("crm_list_quotes", { company_id: "c", limit: 100, offset }, f.ctx); expect(out.ok).toBe(true); ids.push(...out.data.items.map((r: Row) => String(r.id))); offset = out.data.pagination.next_offset; }
    expect(ids.length).toBe(1012); expect(new Set(ids).size).toBe(1012);
  });
  it("checks quote access before reading child records", async () => {
    const f = fixture({ quotes: [quote("secret")], followups: [{ id: "private", quote_id: "secret" }] }, ["secret"]);
    expect((await run("crm_quote_context", { quote_id: "secret", section: "followups" }, f.ctx)).ok).toBe(false);
    expect(f.calls.map((c) => c.table)).toEqual(["quotes"]);
  });
  it("comparison checks both quotes before reading items", async () => {
    const f = fixture({ quotes: [quote("a"), quote("b")] }, ["b"]);
    expect((await run("crm_compare_quotes", { from_quote_id: "a", to_quote_id: "b" }, f.ctx)).ok).toBe(false);
    expect(f.calls.every((c) => c.table === "quotes")).toBe(true);
  });
  it("reads exact quote children and returns continuation for both comparison sides", async () => {
    const f = fixture({ quotes: [quote("a"), quote("b")], quote_items: [...Array.from({ length: 12 }, (_, i) => ({ id: `a${i}`, quote_id: "a", name: "Tétel" })), { id: "b1", quote_id: "b", name: "Másik" }, { id: "secret", quote_id: "foreign" }] });
    const out = await run("crm_compare_quotes", { from_quote_id: "a", to_quote_id: "b", limit: 5 }, f.ctx);
    expect(out.ok).toBe(true); expect(out.data.from_items.pagination.total_visible).toBe(12); expect(out.data.from_items.pagination.next_offset).toBe(5);
    expect(out.data.to_items.items.map((r: Row) => r.id)).toEqual(["b1"]); expect(out.data.complete_item_comparison).toBe(false);
  });
  it("reads only selected quote send records, not a different version", async () => {
    const f = fixture({ quotes: [quote("a")], quote_sends: [{ id: "proof", quote_id: "a", status: "recorded", gmail_message_id: "m", sent_at: "2026-11-03" }, { id: "other", quote_id: "b", status: "sent" }] });
    const out = await run("crm_quote_context", { quote_id: "a", section: "sends" }, f.ctx);
    expect(out.data.items.map((r: Row) => r.id)).toEqual(["proof"]); expect(out.data.items[0].verified_send_record).toBe(true);
  });
  it("returns child and company-query errors instead of fake empty success", async () => {
    const f = fixture({ quotes: [quote("a")] }, [], ["followups"]);
    expect((await run("crm_quote_context", { quote_id: "a", section: "followups" }, f.ctx)).ok).toBe(false);
    const bad = fixture({}, [], ["quotes"]); expect((await run("crm_list_quotes", { company_id: "c" }, bad.ctx)).ok).toBe(false);
  });
  it("continues long technical text with explicit source and protects secrets across all offsets", async () => {
    const f = fixture({ quotes: [quote("a", { technical_scope: "x".repeat(6100) + "Vége" }), quote("b", { notes: "x".repeat(6100) + " password=TESZTSECRET" })] });
    const first = await run("crm_quote_context", { quote_id: "a", section: "content" }, f.ctx);
    expect(first.data.content.next_offset).toBe(6000);
    const next = await run("crm_quote_context", { quote_id: "a", section: "content", text_offset: 6000 }, f.ctx);
    expect(next.data.content.text).toBe("x".repeat(100) + "Vége"); expect(next.data.source).toEqual({ table: "quotes", id: "a" });
    const hidden = await run("crm_quote_context", { quote_id: "b", section: "content", field: "notes", text_offset: 6000 }, f.ctx);
    expect(hidden.data.content.status).toBe("sensitive_withheld"); expect(JSON.stringify(hidden)).not.toContain("TESZTSECRET");
  });
  it("new context and compare tools remain Timothy owner/sales-only and read-only", () => {
    for (const name of ["crm_quote_context", "crm_compare_quotes"]) {
      expect(getTool(name)?.allowed_agents).toEqual(["timothy"]); expect(getTool(name)?.needs_approval).toBeUndefined();
      for (const role of ["marketing", "pm", null]) expect(toolsForAgent({ agentId: "timothy", agentDomains: ["crm.quotes"], userRole: role }).some((t) => t.name === name)).toBe(false);
    }
  });
});