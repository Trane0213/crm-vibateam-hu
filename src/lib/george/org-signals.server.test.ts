import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOwner, loadOrgSignals, OrgAccessError, SOURCE_LIMIT } from "./org-signals.server";

const READ_OPS = ["select", "eq", "neq", "in", "is", "lt", "gte", "not", "or", "order", "range", "limit", "maybeSingle"];
const WRITE_OPS = ["insert", "update", "upsert", "delete"];

function fake(opts: { owner?: boolean; ownerError?: boolean; fail?: string; counts?: Record<string, number>; rows?: Record<string, unknown[]> } = {}) {
  const calls: { table: string; ops: string[] }[] = [];
  const rpcs: string[] = [];
  const client = {
    rpc: (fn: string) => { rpcs.push(fn); return Promise.resolve(opts.ownerError ? { data: null, error: { message: "x" } } : { data: opts.owner ?? true, error: null }); },
    from: (table: string) => {
      const entry = { table, ops: [] as string[] }; calls.push(entry);
      const res = () => ({ data: opts.fail === table ? null : opts.rows?.[table] ?? [], error: opts.fail === table ? { message: "fail" } : null, count: opts.counts?.[table] ?? (opts.rows?.[table]?.length ?? 0) });
      const b: Record<string, unknown> = {};
      for (const op of [...READ_OPS, ...WRITE_OPS]) b[op] = () => { entry.ops.push(op); return op === "maybeSingle" ? Promise.resolve({ data: { enabled: false }, error: null }) : b; };
      b.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolve(res()));
      return b;
    },
  };
  return { client: client as unknown as SupabaseClient, calls, rpcs };
}

describe("George szervezeti jelzések — jogosultság és csak olvasás", () => {
  it("nem Tulajdonos: elutasítás, egyetlen tábla-olvasás nélkül", async () => {
    const f = fake({ owner: false });
    await expect(assertOwner(f.client, "u-1")).rejects.toBeInstanceOf(OrgAccessError);
    expect(f.calls).toHaveLength(0);
    expect(f.rpcs).toEqual(["is_owner_role"]);
  });
  it("ellenőrizhetetlen jogosultság is elutasítás", async () => {
    await expect(assertOwner(fake({ ownerError: true }).client, "u-1")).rejects.toThrow("A jogosultság nem ellenőrizhető.");
  });
  it("Tulajdonos: kizárólag olvasó műveletek, RPC-mutáció és írás nélkül", async () => {
    const f = fake({ rows: { projects: [{ id: "p-1", company_id: null }], quotes: [{ id: "q-1", status: "sent" }], issue_reports: [{ id: "i-1" }] } });
    await assertOwner(f.client, "u-1");
    await loadOrgSignals(f.client, new Date("2026-11-14T10:00:00Z"));
    const ops = f.calls.flatMap((c) => c.ops);
    expect(ops.some((o) => WRITE_OPS.includes(o))).toBe(false);
    expect(ops.every((o) => READ_OPS.includes(o))).toBe(true);
    expect(f.rpcs).toEqual(["is_owner_role"]);
    expect(new Set(f.calls.map((c) => c.table))).toEqual(new Set([
      "leads", "projects", "tasks", "followups", "quotes", "issue_reports", "ai_review_signals", "crm_notifications", "import_review_items",
      "project_candidates", "users_profile_lookup", "knowledge_documents", "project_contacts", "quote_sends", "issue_report_findings", "ai_review_config",
    ]));
  });
  it("a modul nem használ admin klienst és nem hív AI-t", () => {
    const src = readFileSync(new URL("./org-signals.server.ts", import.meta.url), "utf8") + readFileSync(new URL("./org-signals.functions.ts", import.meta.url), "utf8") + readFileSync(new URL("./org-signals.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/client\.server|supabaseAdmin|ai-os|runtime|openai|providers/);
  });
  it("hibás forrás jelölt, a többi betöltődik; levágott forrás részleges", async () => {
    const f = fake({ fail: "tasks", counts: { leads: SOURCE_LIMIT + 5 }, rows: { leads: [{ id: "l-1", status: "new", company_id: null }] } });
    const load = await loadOrgSignals(f.client, new Date("2026-11-14T10:00:00Z"));
    expect(load.sources.find((s) => s.key === "tasks")?.state).toBe("error");
    expect(load.sources.find((s) => s.key === "leads")).toMatchObject({ state: "partial", rows: 1, total: SOURCE_LIMIT + 5 });
    expect(load.sources.find((s) => s.key === "projects")?.state).toBe("ok");
    expect(load.collectorEnabled).toBe(false);
  });
  it("ismételt betöltés azonos bemenetre azonos eredményt ad (idempotens, mellékhatás nélkül)", async () => {
    const rows = { leads: [{ id: "l-1", status: "new", assigned_to: null, company_id: null, created_at: "2026-11-01T00:00:00Z", next_step_due_at: null, next_step_type: null }] };
    const a = await loadOrgSignals(fake({ rows }).client, new Date("2026-11-14T10:00:00Z"));
    const b = await loadOrgSignals(fake({ rows }).client, new Date("2026-11-14T10:00:00Z"));
    expect(b).toEqual(a);
  });
});
