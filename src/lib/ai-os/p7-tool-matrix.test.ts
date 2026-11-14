/**
 * P7 — P2–P6 asszisztenseszközök jogosultsági mátrixa (regresszió): ki látja az eszközt, és egyik sem ír/küld/hagy jóvá.
 * A szerveroldali végrehajtás saját szerepkör-ellenőrzését az adott eszközök tesztjei fedik; ez a futásidejű szűrőt rögzíti.
 */
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
import { listAgents } from "./agents";
import { getTool, toolsForAgent } from "./tool-registry";
import { registerDocumentTools } from "./adapters/document-tools.server";
import { registerPackageTools } from "./adapters/package-tools.server";
import { registerPricingTools } from "./adapters/pricing-tools.server";
import { registerPlanTools } from "./adapters/plan-tools.server";
import { registerQuotePackageTools } from "./adapters/quote-package-tools.server";
import { registerVibaOfferTools } from "./adapters/viba-offer-tools.server";

registerDocumentTools(); registerPackageTools(); registerPricingTools(); registerPlanTools(); registerQuotePackageTools(); registerVibaOfferTools();

const QUOTE_TOOLS = ["crm_price_received_budget", "crm_quote_plan_review", "crm_quote_package_preview", "crm_viba_offer_calculate", "crm_vbf_defects_extract"];
const PACKAGE_TOOLS = ["crm_package_overview", "crm_read_package_file", "crm_search_package"];
const ROLES = ["owner", "sales", "marketing", "project_manager", "agent", null];

describe("P7 eszközmátrix — P3–P6 ajánlati eszközök", () => {
  it("mind regisztrálva, mind biztonságos (nincs jóváhagyásköteles, író vagy küldő eszköz)", () => {
    for (const n of [...QUOTE_TOOLS, ...PACKAGE_TOOLS]) {
      const t = getTool(n);
      expect(t, n).toBeTruthy();
      expect(t!.needs_approval ?? false, n).toBe(false);
      expect(t!.approval ?? "safe", n).toBe("safe");
      expect(JSON.stringify(t!.parameters), n).not.toMatch(/"(write|send|approve|persist|save)"/);
    }
  });
  it.each(listAgents().map((a) => a.id))("%s asszisztens: ajánlati eszköz csak Timothy-nál, csak Tulajdonos/Sales szerepkörrel", (agentId) => {
    const agent = listAgents().find((a) => a.id === agentId)!;
    for (const role of ROLES) {
      const names = toolsForAgent({ agentId, agentDomains: agent.tool_domains, agentExtraTools: (agent as { extra_tools?: string[] }).extra_tools, userRole: role }).map((t) => t.name);
      const visible = QUOTE_TOOLS.filter((n) => names.includes(n));
      expect(visible, `${agentId}/${role}`).toEqual(agentId === "timothy" && (role === "owner" || role === "sales") ? QUOTE_TOOLS : []);
    }
  });
});

describe("P7 eszközmátrix — P2 tervcsomag-olvasók", () => {
  it("szerepkör nélkül egyik asszisztens sem látja; Michael (Google Ads) soha", () => {
    for (const a of listAgents()) {
      const none = toolsForAgent({ agentId: a.id, agentDomains: a.tool_domains, userRole: null }).map((t) => t.name);
      expect(PACKAGE_TOOLS.filter((n) => none.includes(n)), a.id).toEqual([]);
      if (a.id === "michael") for (const role of ROLES) expect(PACKAGE_TOOLS.filter((n) => toolsForAgent({ agentId: a.id, agentDomains: a.tool_domains, userRole: role }).some((t) => t.name === n))).toEqual([]);
    }
  });
});
