import { describe, expect, it } from "vitest";
import { canContinueThread, pickThreadForScope, threadScopeOf } from "./ai-thread-scope";

const t = (id: string, scope: string | null | undefined, updatedAt = 1, agent = "sales") => ({ id, agent, updatedAt, scope });
describe("AI-beszélgetés rekordonként", () => {
  it("másik ajánlat beszélgetése nem folytatható új ajánlaton (Excel-törlési eset)", () => {
    const old = t("a", threadScopeOf({ kind: "quote", id: "q-old" }));
    expect(canContinueThread(old, "sales", threadScopeOf({ kind: "quote", id: "q-new" }))).toBe(false);
    expect(pickThreadForScope([old], "sales", "quote:q-new")).toBeNull();
  });
  it("ugyanannak az ajánlatnak a saját beszélgetése folytatódik", () => {
    const own = t("b", "quote:q1", 5);
    expect(pickThreadForScope([t("x", "quote:q1", 1), own], "sales", "quote:q1")?.id).toBe("b");
  });
  it("régi, jelölés nélküli beszélgetés csak általános oldalon folytatódik", () => {
    const legacy = t("c", undefined);
    expect(canContinueThread(legacy, "sales", null)).toBe(true);
    expect(canContinueThread(legacy, "sales", "quote:q1")).toBe(false);
  });
  it("másik asszisztens beszélgetése nem folytatódik", () => {
    expect(canContinueThread(t("d", "quote:q1", 1, "crm"), "sales", "quote:q1")).toBe(false);
  });
});
