import { describe, it, expect } from "vitest";
import { AI_ITEMS } from "@/lib/nav-config";
import { Route } from "@/routes/_authenticated/sales.research";

describe("Scarlet cégkutató kivezetése", () => {
  it("Scarlet menüpont a valódi marketing chatre mutat", () => {
    const s = AI_ITEMS.find((i) => i.agentId === "marketing")!;
    expect(s.url).toBe("/ai-assistant");
    expect(s.search).toEqual({ agent: "marketing" });
  });
  it("a régi /sales/research cím átirányít a Scarlet chatre", () => {
    let thrown: any;
    try { (Route.options.beforeLoad as any)({}); } catch (e) { thrown = e; }
    const opts = thrown?.options ?? thrown;
    expect(opts.to).toBe("/ai-assistant");
    expect(opts.search).toEqual({ agent: "marketing" });
  });
});
