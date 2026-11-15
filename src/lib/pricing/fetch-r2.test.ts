import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../r2.server", () => ({ presignR2Url: () => "https://r2.example.test/obj" }));

describe("fájltár-letöltés a Worker-futtatókörnyezetben", () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  it("nem használ redirect:'error'-t (a Worker elutasítja), és az átirányítást nem követi", async () => {
    const calls: RequestInit[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => { calls.push(init); return new Response(new Uint8Array([1, 2, 3])); });
    const { fetchR2 } = await import("./pricing.server");
    expect(await fetchR2("quote-documents/x.xlsx", 100)).toEqual(new Uint8Array([1, 2, 3]));
    expect(calls[0]?.redirect).toBe("manual");
  });
  it("átirányító (3xx) válasz hibát ad, nem tölti le a célt", async () => {
    vi.stubGlobal("fetch", async () => new Response(null, { status: 302, headers: { location: "https://mas.example.test" } }));
    const { fetchR2 } = await import("./pricing.server");
    await expect(fetchR2("quote-documents/x.xlsx", 100)).rejects.toThrow("nem tölthető le");
  });
});
