import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/r2.server", () => ({ presignR2Url: () => { throw new Error("no network in tests"); } }));
vi.mock("@/lib/pricing/reference-kv11026.server", () => ({ kv11026ReferenceSources: () => [] }));
import { quotePackageTool } from "./quote-package-tools.server";

function sb(role: string | null, quote: Record<string, unknown> | null) {
  const from = (table: string) => { const b: any = { select: () => b, eq: () => b, in: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => ({ data: table === "quotes" ? quote : null, error: null }), then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) }; return b; };
  return { from, rpc: async () => ({ data: role, error: null }) } as never;
}
const Q = "11111111-1111-4111-8111-111111111111";
const quote = { id: Q, title: "TESZT", version: 1, alternative_key: "A", quote_kind: "received_budget", scope_type: null, technical_scope: null, exclusions: null, valid_until: null, manual_net_amount: null, locked_at: null, status: "draft", contact_id: null };

describe("Timothy crm_quote_package_preview", () => {
  it.each(["marketing", "project_manager"])("%s szerepkör elutasítva", async (role) => {
    await expect(quotePackageTool({ quote_id: Q }, { supabaseUser: sb(role, quote), userId: "u", userRole: role } as never)).rejects.toThrow(/Tulajdonos és Sales/);
  });
  it("ismeretlen paraméter (pl. send/save) elutasítva", async () => {
    await expect(quotePackageTool({ quote_id: Q, send: true }, { supabaseUser: sb("sales", quote), userId: "u", userRole: "sales" } as never)).rejects.toThrow();
  });
  it("költségvetés nélkül: hiányos csomag, fájltartalom és tárolási kulcs nincs a válaszban, nem-mentés jelezve", async () => {
    const r = await quotePackageTool({ quote_id: Q, section: "letter" }, { supabaseUser: sb("sales", quote), userId: "u", userRole: "sales" } as never);
    expect(r.status).toBe("incomplete");
    expect(r.gates.find((g) => g.key === "budget")!.ok).toBe(false);
    expect(JSON.stringify(r)).not.toMatch(/base64|quote-documents\//);
    expect(r.not_done[0]).toMatch(/nem mentődött/);
    expect(r).toHaveProperty("cover_letter_draft.subject");
  });
});
