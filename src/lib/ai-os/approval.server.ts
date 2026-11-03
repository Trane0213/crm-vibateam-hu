import type { SupabaseClient } from "@supabase/supabase-js";
import { getAgent } from "./agents";
import { getTool, toSpec, toolsForAgent } from "./tool-registry";
import { contractHash, hasSensitive, safeAudit, verifyExecution, type ApprovalSnapshot, type ActionStatus } from "./approval";
import { normalizeRole } from "@/lib/permissions";

export type ActionRow = {
 id: string; run_id: string; agent_id: string; tool_name: string; approval_origin_call_id: string;
 input_json: { args: Record<string, unknown>; approval: "confirm" | "dangerous"; supports_dry_run: boolean };
 approval_status: ActionStatus; approval_expires_at: string; approval_contract_hash: string; approval_token: string | null;
 output_json?: { no_op?: boolean }; error?: string;
};
export function snapshot(row: ActionRow): ApprovalSnapshot {
 return { action_id: row.id, tool_call_id: row.approval_origin_call_id, tool_name: row.tool_name, arguments_json: JSON.stringify(row.input_json.args), status: row.approval_status, approval: row.input_json.approval, supports_dry_run: row.input_json.supports_dry_run, expires_at: row.approval_expires_at, error: row.error ?? undefined, no_op: row.output_json?.no_op };
}
export async function authorizeAgent(sb: SupabaseClient, userId: string, agentId: string): Promise<string | null> {
 const { data, error } = await sb.from("users_profile").select("role_id, roles:role_id (name)").eq("auth_user_id", userId).maybeSingle();
 if (error) throw new Error("A jogosultság ellenőrzése sikertelen.");
 const prof = data as { role_id?: string; roles?: { name?: string } } | null;
 const role = prof?.roles?.name ? normalizeRole(prof.roles.name) : null;
 const uiId = ({ george: "crm", timothy: "sales", boss: "pm", scarlet: "marketing", michael: "ads" } as Record<string, string>)[agentId];
 if (agentId === "michael" && role !== "owner") throw new Error("Ez az asszisztens csak tulajdonosnak elérhető.");
 if (uiId && uiId !== "crm") {
  if (!prof?.role_id) throw new Error("Az asszisztenshez nincs jogosultság.");
  const access = await sb.from("agent_role_access").select("agent_id").eq("role_id", prof.role_id).eq("agent_id", uiId).eq("can_view", true).maybeSingle();
  if (access.error || !access.data) throw new Error("Az asszisztenshez nincs jogosultság.");
 }
 return role;
}
export async function frozenArgs(sb: SupabaseClient, toolDomain: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
 if (hasSensitive(args)) throw new Error("A művelet nem tartalmazhat hozzáférési titkot.");
 if (toolDomain === 'sales.followup') {
  const {freezeFollowupAction}=await import('./adapters/followup-action.server');
  return freezeFollowupAction(sb,args);
 }
 if (toolDomain === 'sales.next_step') {
  const { freezeNextStepAction } = await import('./adapters/next-step-action.server');
  return freezeNextStepAction(sb,args);
 }
 if (toolDomain === 'sales.prep_activity') {
  const { freezePrepAction } = await import('./adapters/prep-action.server');
  return freezePrepAction(sb,args);
 }
 if (toolDomain !== "ads.google") return args;
 const { loadConnection, resolveCustomerId } = await import("@/lib/google-ads/client.server");
 const customer_id = resolveCustomerId(await loadConnection(sb), typeof args.customer_id === "string" ? args.customer_id : undefined);
 if (!/^\d+$/.test(customer_id)) throw new Error("Érvénytelen Google Ads fiókazonosító.");
 return { ...args, customer_id };
}
export async function createApproval(admin: SupabaseClient, input: { runId: string; userId: string; stepNo: number; agentId: string; toolName: string; callId: string; args: Record<string, unknown>; approval: "confirm" | "dangerous"; supportsDryRun: boolean }): Promise<ApprovalSnapshot> {
 const tool = getTool(input.toolName);
 if (!tool || hasSensitive(input.args)) throw new Error("A jóváhagyás nem rögzíthető.");
 const { data, error } = await admin.rpc("ai_os_approval_create", { p_run: input.runId, p_user: input.userId, p_step: input.stepNo, p_agent: input.agentId, p_tool: input.toolName, p_call: input.callId, p_input: { args: input.args, approval: input.approval, supports_dry_run: input.supportsDryRun }, p_hash: await contractHash(toSpec(tool)) });
 if (error || !data) throw new Error("A jóváhagyás mentése sikertelen; nem történt végrehajtás.");
 return snapshot(data as ActionRow);
}

export async function decideAction(user: SupabaseClient, admin: SupabaseClient, userId: string, input: { actionId: string; decision: "approve" | "reject" | "check"; confirmation?: string }): Promise<ApprovalSnapshot> {
 // RLS owner-read before privileged claim; never trust owner/agent/args from caller.
 const read = await user.from("agent_run_steps").select("*").eq("id", input.actionId).not("approval_status", "is", null).maybeSingle();
 if (read.error || !read.data) throw new Error("A művelet nem elérhető.");
 const original = read.data as ActionRow;
 const role = await authorizeAgent(user, userId, original.agent_id);
 const agent = getAgent(original.agent_id);
 const tool = getTool(original.tool_name);
 if (!agent || !tool || !toolsForAgent({ agentId: agent.id, agentDomains: agent.tool_domains, agentExtraTools: agent.extra_tools, userRole: role }).some(t => t.name === tool.name)) throw new Error("A művelethez nincs jogosultság.");
 if (await contractHash(toSpec(tool)) !== original.approval_contract_hash || hasSensitive(original.input_json.args)) throw new Error("A művelet megváltozott; új jóváhagyás szükséges.");
 const claim = await admin.rpc("ai_os_approval_decide", { p_id: input.actionId, p_user: userId, p_decision: input.decision, p_confirmation: input.confirmation ?? null });
 if (claim.error || !claim.data) throw new Error("A döntés mentése sikertelen.");
 const { action, claimed } = claim.data as { action: ActionRow; claimed: boolean };
 if (!claimed) return snapshot(action);
 if (!action.approval_token) throw new Error("A végrehajtás eredménye még nem igazolt.");
 let result: unknown;
 let status: "succeeded" | "failed" | "unknown" = "unknown";
 let no_op: boolean | undefined;
 let error: string | undefined;
 try {
  result = await tool.execute(action.input_json.args, { userId, agentId: agent.id, runId: action.run_id, threadId: null, supabaseUser: user, supabaseAdmin: admin, approvalActionId:action.id });
  ({ status, no_op } = verifyExecution(tool.name, result, action.input_json.args));
  // External failures may follow an applied mutation: never permit replay.
  if (tool.domain === "ads.google" && status === "failed") status = "unknown";
  if (status !== "succeeded") error = status === "unknown" ? "A végrehajtás eredménye még nem igazolt." : "A művelet végrehajtása sikertelen.";
 } catch { error = "A végrehajtás eredménye még nem igazolt."; }
 try {
  const finish = await admin.rpc("ai_os_approval_finish", { p_id: action.id, p_user: userId, p_token: action.approval_token, p_status: status, p_result: safeAudit({ result: result ?? null, no_op: no_op ?? false }), p_error: error ?? null });
  if (!finish.error && finish.data) return snapshot(finish.data as ActionRow);
 } catch { /* Persisted claim stays executing; never replay. */ }
 return { ...snapshot(action), status: "executing", error: "A végrehajtás eredménye még nem igazolt." };
}