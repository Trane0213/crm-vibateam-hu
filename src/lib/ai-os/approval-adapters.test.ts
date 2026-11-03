import { describe, it, expect, vi } from "vitest";
import { registerCrmTools } from "./adapters/crm-tools.server";
import { registerGoogleAdsTools } from "./adapters/google-ads-tools.server";
import { getTool } from "./tool-registry";
import { verifyExecution } from "./approval";
import { adsMutate } from "@/lib/google-ads/client.server";

vi.mock("@/lib/google-ads/client.server", () => ({
 loadConnection: vi.fn(async () => ({ active_customer_id: "123" })), resolveCustomerId: () => "123",
 gaqlSearch: vi.fn(async () => [{ campaign: { id: "7", name: "TESZT", status: "ENABLED" } }]),
 adsMutate: vi.fn(async () => ({ results: [{ resourceName: "customers/123/campaigns/7" }] })),
 writeChangeLog: vi.fn(async () => {}), GOOGLE_ADS_API_VERSION: "v21",
}));
describe("Existing AI write adapters — isolated", () => {
 it("Timothy uses the existing user-scoped won RPC with exact arguments", async () => {
  registerCrmTools(); const tool = getTool("sales_mark_won_with_project");
  if (!tool) throw new Error("Missing Timothy tool");
  const project = "00000000-0000-4000-8000-000000000001";
  const rpc = vi.fn(async () => ({ data: project, error: null }));
  const args = { lead_id: project, title: "TESZT", start_date: "2026-11-03", project_manager_user_id: project, notes: "TESZT" };
  const output = await tool.execute(args, { userId: project, agentId: "timothy", threadId: null, runId: project, supabaseUser: { rpc } as never, supabaseAdmin: {} as never });
  expect(rpc).toHaveBeenCalledWith("sales_mark_won_with_project", { p_lead_id: project, p_title: "TESZT", p_start_date: "2026-11-03", p_project_manager_user_id: project, p_notes: "TESZT" });
  expect(verifyExecution(tool.name, output, args).status).toBe("succeeded");
 });
 it("Michael existing pause executes and verifies resource without live campaign", async () => {
  registerGoogleAdsTools(); const tool=getTool("pause_campaign"); if (!tool) throw new Error("Missing Michael tool");
  const args={customer_id:"123",campaign_id:"7",mode:"execute",reason:"TESZT"};
  const out=await tool.execute(args,{userId:"TESZT",agentId:"michael",threadId:null,runId:"TESZT",supabaseUser:{} as never,supabaseAdmin:{} as never});
  expect(verifyExecution(tool.name,out,args).status).toBe("succeeded"); expect(adsMutate).toHaveBeenCalledTimes(1);
 });
 it("Michael malformed mutation response cannot be recorded as executed", async () => {
  vi.mocked(adsMutate).mockResolvedValueOnce({ raw:"ok" });
  registerGoogleAdsTools(); const tool=getTool("pause_campaign"); if (!tool) throw new Error("Missing Michael tool");
  const out=await tool.execute({campaign_id:"7",mode:"execute"},{userId:"TESZT",agentId:"michael",threadId:null,runId:"TESZT",supabaseUser:{} as never,supabaseAdmin:{} as never});
  expect((out as {ok:boolean}).ok).toBe(false);
 });
});