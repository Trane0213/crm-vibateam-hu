import { describe, expect, it } from "vitest";
import { AGENTS } from "./agents";
import { toResponsesInput, fromResponsesOutput } from "./providers.server";
import { collectLeadCompanies, correctLeadAsCompany } from "./read-quality";

describe("Timothy modellváltás", () => {
  it("csak Timothy fut gpt-6-astra Responses API-n high effortral", () => {
    const t = (AGENTS as any).timothy;
    expect([t.model, t.api, t.reasoning_effort]).toEqual(["gpt-6-astra", "responses", "high"]);
    for (const [id, a] of Object.entries(AGENTS as any)) if (id !== "timothy") expect((a as any).model).toBe("gpt-4o-mini");
  });
  it("eszközeredmény visszajut a modellhez call_id-val", () => {
    const r = toResponsesInput([{ role: "system", content: "S" }, { role: "user", content: "Q" },
      { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "t", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "c1", content: "{\"ok\":true}" }]);
    expect(r.instructions).toBe("S");
    expect(r.input).toContainEqual({ type: "function_call", call_id: "c1", name: "t", arguments: "{}" });
    expect(r.input).toContainEqual({ type: "function_call_output", call_id: "c1", output: "{\"ok\":true}" });
  });
  it("Responses kimenet tool_calls-ra fordul", () => {
    const r = fromResponsesOutput({ output: [{ type: "function_call", call_id: "c9", name: "x", arguments: "{}" }] }, "openai", "m");
    expect(r.tool_calls[0].id).toBe("c9");
  });
  it("lead-ID company_id-ként a lead mentett cégére javul", () => {
    const m = new Map<string, string>();
    collectLeadCompanies("crm_get_lead", { ok: true, data: { items: [{ id: "L1", status: "won", company_id: "C1" }] } }, m);
    expect(correctLeadAsCompany({ company_id: "L1" }, m)).toEqual({ args: { company_id: "C1" }, corrected: true });
    expect(correctLeadAsCompany({ company_id: "C2" }, m).corrected).toBe(false);
  });
});
