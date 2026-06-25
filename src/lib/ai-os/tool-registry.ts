/**
 * AI OS — központi Tool Registry.
 *
 * Az agent NEM dönti el, milyen toolokat ismer.
 * A registry tárol mindent; a runtime futáskor az (agent, role) páros
 * alapján szűr.
 *
 * CRM-független. A CRM toolok az adapters/crm-tools.ts-ben regisztrálódnak.
 */

import type { RegisteredTool, ToolSpec, ToolExecutor } from "./types";

const REGISTRY = new Map<string, RegisteredTool>();

export function registerTool(spec: ToolSpec, execute: ToolExecutor): void {
  if (REGISTRY.has(spec.name)) {
    // Idempotens: dev hot-reload alatt felülírjuk.
    REGISTRY.delete(spec.name);
  }
  REGISTRY.set(spec.name, { ...spec, execute });
}

export function getTool(name: string): RegisteredTool | undefined {
  return REGISTRY.get(name);
}

export function listAllTools(): RegisteredTool[] {
  return Array.from(REGISTRY.values());
}

/**
 * Egy adott agentnek (és user role-nak) elérhető toolok.
 * Szabályok:
 *   - a tool domainjének szerepelnie kell az agent.tool_domains listájában,
 *     VAGY a tool nevének az agent.extra_tools listájában.
 *   - ha tool.allowed_agents nem üres, az agent.id-nak benne kell lennie.
 *   - ha tool.allowed_roles nem üres, a userRole-nak benne kell lennie.
 */
export function toolsForAgent(opts: {
  agentId: string;
  agentDomains: string[];
  agentExtraTools?: string[];
  userRole: string | null;
}): RegisteredTool[] {
  const domains = new Set(opts.agentDomains);
  const extras = new Set(opts.agentExtraTools ?? []);
  const role = opts.userRole;
  const out: RegisteredTool[] = [];
  for (const tool of REGISTRY.values()) {
    const domainOk = domains.has(tool.domain) || extras.has(tool.name);
    if (!domainOk) continue;
    if (tool.allowed_agents?.length && !tool.allowed_agents.includes(opts.agentId)) continue;
    if (tool.allowed_roles?.length && (!role || !tool.allowed_roles.includes(role))) continue;
    out.push(tool);
  }
  return out;
}

/** Csak a registry sémáit adja vissza (futáshoz: execute nélkül). */
export function toSpec(tool: RegisteredTool): ToolSpec {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { execute, ...spec } = tool;
  return spec;
}