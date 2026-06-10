import { supabase } from "@/integrations/supabase/client";
import { AGENTS, type AgentId, type CrmResource } from "@/lib/ai/agents";

export async function buildAgentContext(
  agentId: AgentId, resources: CrmResource[], limitPerResource = 20,
): Promise<Record<string, any[]>> {
  const agent = AGENTS[agentId];
  const out: Record<string, any[]> = {};
  for (const r of resources) {
    if (!agent.capabilities[r]?.includes("read")) { out[r] = []; continue; }
    const { data, error } = await supabase.from(r).select("*").limit(limitPerResource);
    if (error) { console.warn(`[ai] ${r}:`, error.message); out[r] = []; continue; }
    out[r] = data ?? [];
  }
  return out;
}

export function serializeContext(ctx: Record<string, any[]>): string {
  const parts: string[] = [];
  for (const [k, rows] of Object.entries(ctx)) {
    if (!rows.length) continue;
    parts.push(`# ${k} (${rows.length})\n${JSON.stringify(rows.slice(0, 10), null, 2)}`);
  }
  return parts.join("\n\n");
}