import { describe, it, expect, vi } from "vitest";
import { decisionSchema, verifyExecution, hasSensitive, safeAudit, contractHash } from "./approval";
import { registerTool, getTool, toSpec } from "./tool-registry";
import { decideAction, createApproval, type ActionRow } from "./approval.server";
import { callLlm } from "./providers.server";
vi.mock("./providers.server", () => ({ callLlm: vi.fn(() => { throw new Error("Approval must not generate"); }) }));

const userId = "00000000-0000-4000-8000-000000000001";
const actionId = "00000000-0000-4000-8000-000000000002";
const projectId = "00000000-0000-4000-8000-000000000003";
async function fixture(opts: { name?: string; domain?: string; agent?: string; status?: ActionRow["approval_status"]; output?: unknown; throwExecute?: boolean; dbFail?: string; wrongOwner?: boolean; expired?: boolean; role?: string } = {}) {
 const name = opts.name ?? "sales_mark_won_with_project";
 const agent = opts.agent ?? "timothy";
 const execute = vi.fn(async (_args: Record<string, unknown>) => { if (opts.throwExecute) throw new Error("network interrupted"); return opts.output ?? { ok: true, data: { project_id: projectId } }; });
 registerTool({ name, description: "TESZT", domain: opts.domain ?? "sales.workflow", needs_approval: true, allowed_agents: [agent], parameters: { type: "object" } }, execute);
 const tool = getTool(name);
 if (!tool) throw new Error("fixture registration failed");
 const row: ActionRow = { id: actionId, run_id: projectId, agent_id: agent, tool_name: name, approval_origin_call_id: "original", input_json: { args: { lead_id: projectId, customer_id: "123", campaign_id: "7", mode: "execute" }, approval: "confirm", supports_dry_run: false }, approval_status: opts.status ?? "pending", approval_expires_at: "2026-11-03T16:30:00Z", approval_contract_hash: await contractHash(toSpec(tool)), approval_token: null };
 const user = { from: (table: string) => {
  const result = table === "agent_run_steps" ? { data: opts.wrongOwner ? null : row } : table === "users_profile" ? { data: { role_id: "role", roles: { name: opts.role ?? "owner" } } } : { data: { agent_id: "sales" } };
  const query: Record<string, unknown> = {};
  for (const key of ["select", "eq", "not"]) query[key] = () => query;
  query.maybeSingle = async () => result;
  return query;
 }};
 const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
  if (opts.dbFail === fn) return { error: { message: "TESZT DB error" }, data: null };
  if (fn === "ai_os_approval_decide") {
   let claimed = false;
   if (row.approval_status === "pending" && opts.expired) row.approval_status = "expired";
   else if (row.approval_status === "pending" && args.p_decision !== "check") {
    row.approval_status = args.p_decision === "approve" ? "executing" : "rejected";
    row.approval_token = actionId; claimed = args.p_decision === "approve";
   }
   return { data: { action: { ...row }, claimed } };
  }
  row.approval_status = args.p_status as ActionRow["approval_status"];
  return { data: { ...row } };
 });
 return { row, execute, rpc, user: user as never, admin: { rpc } as never };
}
describe("AI OS P0 approval", () => {
 it("executes Timothy's stored operation and returns confirmed success", async () => {
  const f = await fixture(); const before = JSON.stringify(f.row.input_json.args);
  expect((await decideAction(f.user, f.admin, userId, { actionId, decision: "approve" })).status).toBe("succeeded");
  expect(f.execute).toHaveBeenCalledTimes(1); expect(JSON.stringify(f.execute.mock.calls[0]?.[0])).toBe(before);
  expect(callLlm).toHaveBeenCalledTimes(0);
 });
 it("rejection never executes", async () => { const f = await fixture(); await decideAction(f.user,f.admin,userId,{actionId,decision:"reject"}); await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"}); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("duplicate and concurrent approval execute once", async () => { const f=await fixture(); await Promise.all([1,2,3].map(()=>decideAction(f.user,f.admin,userId,{actionId,decision:"approve"}))); expect(f.execute).toHaveBeenCalledTimes(1); });
 it("expired approval never executes", async () => { const f=await fixture({expired:true}); expect((await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).status).toBe("expired"); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("other user cannot execute", async () => { const f=await fixture({wrongOwner:true}); await expect(decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("changed arguments in decision request are rejected",()=>{ expect(decisionSchema.safeParse({actionId,decision:"approve",args:{lead_id:"other"}}).success).toBe(false); });
 it("changed contract cannot execute",async()=>{ const f=await fixture(); f.row.approval_contract_hash="changed"; await expect(decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("claim database failure cannot execute",async()=>{ const f=await fixture({dbFail:"ai_os_approval_decide"}); await expect(decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("approval persistence failure does not return approval",async()=>{ const f=await fixture({dbFail:"ai_os_approval_create"}); await expect(createApproval(f.admin,{runId:projectId,userId,stepNo:1,agentId:"timothy",toolName:"sales_mark_won_with_project",callId:"original",args:{},approval:"confirm",supportsDryRun:false})).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("ok:false is failure",async()=>{ const f=await fixture({output:{ok:false}}); expect((await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).status).toBe("failed"); });
 it("legacy error is failure",()=>expect(verifyExecution("memory_write",{error:"DB error"},{}).status).toBe("failed"));
 it("network interruption stays unknown and is not replayed",async()=>{ const f=await fixture({throwExecute:true}); expect((await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).status).toBe("unknown"); await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"}); expect(f.execute).toHaveBeenCalledTimes(1); });
 it("lost result persistence retains executing claim and cannot replay",async()=>{ const f=await fixture({dbFail:"ai_os_approval_finish"}); expect((await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).status).toBe("executing"); await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"}); expect(f.execute).toHaveBeenCalledTimes(1); });
 it("Michael mutation requires actual matching resource result",async()=>{ const f=await fixture({name:"pause_campaign",domain:"ads.google",agent:"michael",output:{ok:true,data:{executed:true,dry_run:false,response:{results:[{resourceName:"customers/123/campaigns/7"}]}}}}); expect((await decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).status).toBe("succeeded"); });
 it("Michael cannot run as Sales",async()=>{ const f=await fixture({name:"pause_campaign",domain:"ads.google",agent:"michael",role:"sales"}); await expect(decideAction(f.user,f.admin,userId,{actionId,decision:"approve"})).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("HTTP success without Google mutation proof stays unknown",()=>expect(verifyExecution("pause_campaign",{ok:true,data:{executed:true,dry_run:false,response:{raw:"ok"}}},{customer_id:"123",campaign_id:"7"}).status).toBe("unknown"));
 it("wrong Google target stays unknown",()=>expect(verifyExecution("pause_campaign",{ok:true,data:{executed:true,dry_run:false,response:{results:[{resourceName:"customers/123/campaigns/8"}]}}},{customer_id:"123",campaign_id:"7"}).status).toBe("unknown"));
 it("status read does not execute",async()=>{ const f=await fixture({status:"executing"}); await decideAction(f.user,f.admin,userId,{actionId,decision:"check"}); expect(f.execute).toHaveBeenCalledTimes(0); });
 it("secrets are rejected or redacted rather than logged",()=>{ expect(hasSensitive({access_token:"TESZT"})).toBe(true); expect(safeAudit({authorization:"Bearer TESZT",url:"https://example.test/?signature=TESZT"})).toEqual({authorization:"[védett adat]",url:"[védett adat]"}); });
});