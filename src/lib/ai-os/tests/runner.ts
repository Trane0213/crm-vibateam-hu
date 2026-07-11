/**
 * AI OS — Acceptance runner (AI-1.8).
 *
 * Statikus, LLM-mentes ellenőrzések:
 *   1. Minden fixture-ben szereplő agent létezik-e.
 *   2. `required_domains` / `forbidden_domains` a definícióban stimmel-e.
 *   3. `required_tools` elérhetőek-e (owner role-lal) → toolsForAgent.
 *   4. `forbidden_tools` NEM elérhetőek.
 *   5. `required_prompt_phrases` szerepel-e a system promptban.
 *   6. `expected_handoff_targets` egyezik-e a listHandoffTargets()-vel.
 *   7. Minden `business_scenario.expected_tools` elérhető-e az agentnek.
 *
 * SERVER-ONLY. A registry-t `ensureBootstrapped()`-tel tölti fel.
 */

import { AGENTS, listHandoffTargets } from "../agents";
import { ensureBootstrapped } from "../bootstrap.server";
import { toolsForAgent } from "../tool-registry";
import { FIXTURES } from "./fixtures";
import type { AcceptanceIssue, AcceptanceReport, AgentAcceptance } from "./types";

/** Owner role — a legtágabb jogosultsági kör; így minden role-kötött tool látszik. */
const TEST_ROLE = "owner";

function checkAgent(fx: AgentAcceptance, issues: AcceptanceIssue[]): number {
  const agent = AGENTS[fx.agent];
  if (!agent) {
    issues.push({ agent: fx.agent, severity: "error", message: "Agent nem létezik az AGENTS registry-ben." });
    return 0;
  }

  const domains = new Set(agent.tool_domains);
  for (const d of fx.required_domains ?? []) {
    if (!domains.has(d)) {
      issues.push({ agent: fx.agent, severity: "error", message: `Hiányzó domain: "${d}"` });
    }
  }
  for (const d of fx.forbidden_domains ?? []) {
    if (domains.has(d)) {
      issues.push({ agent: fx.agent, severity: "error", message: `Tiltott domain jelen van: "${d}"` });
    }
  }

  const tools = toolsForAgent({
    agentId: agent.id,
    agentDomains: agent.tool_domains,
    agentExtraTools: agent.extra_tools,
    userRole: TEST_ROLE,
  });
  const toolNames = new Set(tools.map((t) => t.name));

  for (const t of fx.required_tools ?? []) {
    if (!toolNames.has(t)) {
      issues.push({ agent: fx.agent, severity: "error", message: `Hiányzó tool: "${t}"` });
    }
  }
  for (const t of fx.forbidden_tools ?? []) {
    if (toolNames.has(t)) {
      issues.push({ agent: fx.agent, severity: "error", message: `Tiltott tool elérhető: "${t}"` });
    }
  }

  // System prompt — minimum kontextussal renderelve.
  const prompt = agent.buildSystemPrompt({
    userId: "00000000-0000-0000-0000-000000000000",
    userRole: TEST_ROLE,
    nowIso: new Date("2026-01-01T00:00:00Z").toISOString(),
    memory: [],
  });
  const promptLc = prompt.toLowerCase();
  for (const p of fx.required_prompt_phrases ?? []) {
    if (!promptLc.includes(p.toLowerCase())) {
      issues.push({ agent: fx.agent, severity: "error", message: `System prompt hiányzó kifejezés: "${p}"` });
    }
  }

  if (fx.expected_handoff_targets) {
    if (!agent.is_orchestrator) {
      issues.push({
        agent: fx.agent,
        severity: "error",
        message: "expected_handoff_targets csak orchestrator agenten értelmezhető.",
      });
    } else {
      const actual = new Set(listHandoffTargets());
      const expected = new Set(fx.expected_handoff_targets);
      for (const t of expected) if (!actual.has(t)) issues.push({ agent: fx.agent, severity: "error", message: `Handoff target hiányzik: "${t}"` });
      for (const t of actual) if (!expected.has(t)) issues.push({ agent: fx.agent, severity: "warn", message: `Nem várt handoff target: "${t}" — frissítsd a fixture-t.` });
    }
  }

  let scenarioCount = 0;
  for (const sc of fx.business_scenarios ?? []) {
    scenarioCount++;
    for (const t of sc.expected_tools) {
      if (!toolNames.has(t)) {
        issues.push({
          agent: fx.agent,
          scenario: sc.id,
          severity: "error",
          message: `Scenárió "${sc.id}" — hiányzó tool: "${t}"`,
        });
      }
    }
  }
  return scenarioCount;
}

export function runAcceptance(): AcceptanceReport {
  ensureBootstrapped();
  const issues: AcceptanceIssue[] = [];
  let scenarios = 0;
  for (const fx of FIXTURES) scenarios += checkAgent(fx, issues);
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warn").length;
  return {
    ok: errors === 0,
    totals: { agents: FIXTURES.length, scenarios, errors, warnings },
    issues,
  };
}

export function formatReport(report: AcceptanceReport): string {
  const lines: string[] = [];
  lines.push(`AI OS Acceptance — ${report.ok ? "OK" : "FAIL"}`);
  lines.push(
    `  agents=${report.totals.agents}  scenarios=${report.totals.scenarios}  errors=${report.totals.errors}  warnings=${report.totals.warnings}`,
  );
  if (report.issues.length) {
    lines.push("");
    for (const i of report.issues) {
      const tag = i.severity === "error" ? "ERR " : "WARN";
      const sc = i.scenario ? ` [${i.scenario}]` : "";
      lines.push(`  ${tag} ${i.agent}${sc}: ${i.message}`);
    }
  }
  return lines.join("\n");
}
