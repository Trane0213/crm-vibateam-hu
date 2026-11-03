import { z } from "zod";
import type { ToolSpec } from "./types";

export type ActionStatus = "pending" | "executing" | "succeeded" | "failed" | "rejected" | "expired" | "unknown";
export type ApprovalSnapshot = {
  action_id: string; tool_call_id: string; tool_name: string; arguments_json: string;
  status: ActionStatus; approval: "confirm" | "dangerous"; supports_dry_run: boolean;
  expires_at: string; error?: string; no_op?: boolean;
};
export const decisionSchema = z.object({ actionId: z.string().uuid(), decision: z.enum(["approve", "reject", "check"]), confirmation: z.string().max(40).optional() }).strict();
export const statusSchema = z.object({ actionIds: z.array(z.string().uuid()).max(100) }).strict();
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export async function contractHash(tool: ToolSpec): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(tool)));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}
const sensitiveKey = /^(authorization|password|secret|.*token.*|.*secret.*|api[_-]?key|refresh_token_cipher|refresh_token_iv|signature)$/i;
export function hasSensitive(value: unknown): boolean {
  if (typeof value === "string") return /Bearer\s+\S+|(?:api[_-]?key|password|secret|access_token|refresh_token)\s*[=:]\s*\S+|[?&](token|signature|x-amz-signature|x-goog-signature|attachment_token)=/i.test(value);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([k, v]) => sensitiveKey.test(k) || hasSensitive(v));
}
export function safeAudit(value: unknown): unknown {
  if (typeof value === "string") return hasSensitive(value) ? "[védett adat]" : value;
  if (Array.isArray(value)) return value.map(safeAudit);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sensitiveKey.test(k) ? "[védett adat]" : safeAudit(v)]));
  return value;
}
export function failureResult(value: unknown): boolean {
  return !!value && typeof value === "object" && ((value as Record<string, unknown>).ok === false || "error" in value);
}
export function verifyExecution(toolName: string, value: unknown, args: Record<string, unknown>): { status: "succeeded" | "failed" | "unknown"; no_op?: boolean } {
  if (failureResult(value)) return { status: "failed" };
  const out = value as { ok?: boolean; id?: string; data?: Record<string, unknown> } | null;
  if (out?.ok !== true) return { status: "unknown" };
  if (toolName === "memory_write") return { status: typeof out.id === "string" && out.id.length > 0 ? "succeeded" : "unknown" };
  const data = out.data;
  if (toolName === "sales_mark_won_with_project") return { status: typeof data?.project_id === "string" && z.string().uuid().safeParse(data.project_id).success ? "succeeded" : "unknown" };
  const campaign = data?.campaign as { id?: string; status?: string } | undefined;
  if (data?.no_op === true && data.dry_run === false && String(campaign?.id) === args.campaign_id && campaign?.status === (toolName === "pause_campaign" ? "PAUSED" : toolName === "enable_campaign" ? "ENABLED" : "")) return { status: "succeeded", no_op: true };
  const response = data?.response as { results?: Array<{ resourceName?: string }> } | undefined;
  const results = response?.results;
  const resource = results?.[0]?.resourceName;
  const prefix = `customers/${args.customer_id}/`;
  const expected = toolName === "update_campaign_budget" ? `${prefix}campaignBudgets/${data?.budget_id}` : toolName === "add_campaign_negative_keyword" ? `${prefix}campaignCriteria/${args.campaign_id}~` : `${prefix}campaigns/${args.campaign_id}`;
  const matches = typeof resource === "string" && (toolName === "add_campaign_negative_keyword" ? resource.startsWith(expected) && resource.length > expected.length : resource === expected);
  return { status: data?.executed === true && data.dry_run === false && results?.length === 1 && matches ? "succeeded" : "unknown" };
}
export const ACTION_LABELS: Record<ActionStatus, string> = {
  pending: "Jóváhagyásra vár", executing: "Végrehajtás folyamatban", succeeded: "Sikeresen végrehajtva", failed: "Sikertelen", rejected: "Elutasítva", expired: "Lejárt", unknown: "A végrehajtás eredménye még nem igazolt.",
};