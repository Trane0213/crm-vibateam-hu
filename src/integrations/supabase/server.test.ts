import { afterEach, expect, it, vi } from "vitest";
import { authenticateRequest, getUserClient } from "./server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("reads current connection at call time and preserves caller bearer with opaque apikey", async () => {
  vi.stubEnv("SUPABASE_URL", "https://first.example.invalid");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers) });
    return new Response("[]", { headers: { "Content-Type": "application/json" } });
  }));
  await getUserClient("test-caller-jwt").from("companies").select("id");
  vi.stubEnv("SUPABASE_URL", "https://second.example.invalid");
  await getUserClient("second-caller-jwt").from("companies").select("id");
  expect(calls[0]?.url).toContain("https://first.example.invalid/rest/v1/companies");
  expect(calls[0]?.headers.get("authorization")).toBe("Bearer test-caller-jwt");
  expect(calls[0]?.headers.get("apikey")).toBe("sb_publishable_test");
  expect(calls[1]?.url).toContain("https://second.example.invalid/rest/v1/companies");
  expect(calls[1]?.headers.get("authorization")).toBe("Bearer second-caller-jwt");
});

it("does not silently connect to a hardcoded project when configuration is missing", () => {
  vi.stubEnv("SUPABASE_URL", "");
  expect(() => getUserClient("test-jwt")).toThrow("nincs beállítva");
});

it("missing bearer is rejected before any network read", async () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(authenticateRequest(new Request("https://test.example.invalid"))).rejects.toMatchObject({ status: 401 });
  expect(fetch).not.toHaveBeenCalled();
});