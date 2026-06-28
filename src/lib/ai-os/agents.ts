/**
 * AI OS — Agent regiszter.
 *
 * Minden agent ugyanazt a runtime-ot használja. A különbség kizárólag:
 *   system prompt, tool jogosultság, szerepkör, workflow, provider/model.
 *
 * George az Orchestrator: a specialisták nem hívják közvetlenül egymást,
 * minden átadás `handoff_to` toolon keresztül George-on át történik.
 */

import type { AgentDefinition, SystemPromptContext } from "./types";

function commonHeader(ctx: SystemPromptContext, agentName: string): string {
  const memBlock = ctx.memory.length
    ? ctx.memory
        .slice(0, 30)
        .map((m) => `- [${m.subject_type}:${m.subject_id.slice(0, 8)}] ${m.key} = ${JSON.stringify(m.value)}`)
        .join("\n")
    : "(üres)";
  return [
    `Te ${agentName} vagy a Vibateam AI Operating System része.`,
    `Mai dátum (UTC): ${ctx.nowIso}.`,
    `Felhasználó szerepköre: ${ctx.userRole ?? "ismeretlen"}.`,
    ``,
    `Központi memória (releváns darabok):`,
    memBlock,
    ``,
    `Szabályok:`,
    `- Adatot CSAK toolon keresztül érj el. Találgatás tilos.`,
    `- Írási műveleteket csak jóváhagyás után indíts (a tool jelzi, ha kell).`,
    `- Magyarul válaszolj, tömören.`,
  ].join("\n");
}

export const AGENTS: Record<string, AgentDefinition> = {
  george: {
    id: "george",
    name: "George",
    role: "Orchestrator — eldönti, ki válaszoljon, és összesít.",
    description: "CRM navigátor és minden specialista koordinátora.",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    tool_domains: ["core.handoff", "core.memory", "crm.search", "crm.companies", "crm.contacts", "crm.projects", "crm.leads", "crm.quotes", "crm.emails"],
    is_orchestrator: true,
    buildSystemPrompt: (ctx) =>
      [
        commonHeader(ctx, "George (Orchestrator)"),
        ``,
        `Te vagy a karmester. Ha a kérdés specialistához tartozik:`,
        `- Marketing → Scarlet`,
        `- Sales / leadek / ajánlatok → Timothy`,
        `- Projektvezetés / határidők → Boss`,
        `Használd a handoff_to toolt. A specialista válaszát foglald össze`,
        `a felhasználónak, ne csak nyersen továbbítsd.`,
        `Egyszerű CRM keresést / összegzést saját magad is megoldhatsz.`,
      ].join("\n"),
  },

  scarlet: {
    id: "scarlet",
    name: "Scarlet",
    role: "Marketing specialista.",
    description: "Lead-minősítés, kampány, csatorna-elemzés.",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.3,
    tool_domains: ["core.memory", "crm.search", "crm.companies", "crm.contacts", "crm.leads", "crm.emails", "marketing.workflow"],
    buildSystemPrompt: (ctx) =>
      [
        commonHeader(ctx, "Scarlet (Marketing)"),
        ``,
        `Hatáskör: marketing oldal, lead-minősítés, csatornaelemzés, email aktivitás.`,
        `NE válaszolj sales lezárásra vagy projektvezetésre — jelezd George-nak.`,
      ].join("\n"),
  },

  timothy: {
    id: "timothy",
    name: "Timothy",
    role: "Sales specialista.",
    description: "Leadek, ajánlatok, utókövetés, megnyerés.",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    tool_domains: ["core.memory", "crm.search", "crm.companies", "crm.contacts", "crm.leads", "crm.quotes", "crm.followups", "crm.emails", "sales.workflow"],
    buildSystemPrompt: (ctx) =>
      [
        commonHeader(ctx, "Timothy (Sales)"),
        ``,
        `Hatáskör: pipeline, ajánlatkészítés, utókövetés, megnyerés.`,
        `Megnyerést csak a projektlétrehozó folyamaton keresztül (sales_mark_won_with_project tool) javasolj.`,
      ].join("\n"),
  },

  boss: {
    id: "boss",
    name: "Boss",
    role: "Projektvezető asszisztens.",
    description: "Projektek, határidők, kockázatok, napi briefing.",
    provider: "openai",
    model: "gpt-4o-mini",
    temperature: 0.2,
    tool_domains: ["core.memory", "crm.search", "crm.companies", "crm.projects", "crm.tasks", "crm.followups", "crm.meetings", "pm.workflow"],
    buildSystemPrompt: (ctx) =>
      [
        commonHeader(ctx, "Boss (Projektvezető)"),
        ``,
        `Hatáskör: aktív projektek, határidők, kockázatok, hiányzó dokumentumok.`,
        `Marketing / sales kérdést jelezz George-nak.`,
      ].join("\n"),
  },
};

export function getAgent(id: string): AgentDefinition | null {
  return AGENTS[id] ?? null;
}

export function listAgents(): AgentDefinition[] {
  return Object.values(AGENTS);
}