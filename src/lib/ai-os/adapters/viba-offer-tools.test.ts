import { describe, expect, it } from "vitest";
import { vbfExtractTool, vibaOfferCalcTool } from "./viba-offer-tools.server";
import { DEFAULT_COMMERCIAL, emptyProfile } from "@/lib/viba-offer/calc-model";
import { decodeImport } from "@/lib/viba-offer/calc-schema";

const Q = "11111111-1111-4111-8111-111111111111";
function sb(role: string | null, quote: Record<string, unknown> | null, items: unknown[] = []) {
  const writes: string[] = [];
  const from = (table: string) => { const b: any = { select: () => b, eq: () => b, limit: () => Promise.resolve({ data: table === "quote_items" ? items : [], error: null }),
    insert: () => { writes.push(`insert ${table}`); return b; }, update: () => { writes.push(`update ${table}`); return b; }, delete: () => { writes.push(`delete ${table}`); return b; },
    maybeSingle: async () => ({ data: table === "quotes" ? quote : null, error: null }) }; return b; };
  return { client: { from, rpc: async () => ({ data: role, error: null }) } as never, writes };
}
const own = { id: Q, quote_kind: "viba_offer", locked_at: null, scope_type: "material_labor" };
const calc = { mode: "material_labor", commercial: DEFAULT_COMMERCIAL, profile: { ...emptyProfile("house_sqm"), areaM2: 80, areaStatus: "measured", packageLabel: "TESZT", packageVersion: "v1", conditionsNote: "TESZT",
  content: { outlets: "included", distribution: "included", cabling: "included", devices: "included", low_voltage: "excluded", metering: "excluded" }, laborPerM2: { huf: 5000, basis: "sell", source: "manual", note: "TESZT" } } };
const ctx = (s: ReturnType<typeof sb>, role: string | null) => ({ supabaseUser: s.client, userId: "u", userRole: role } as never);

describe("Timothy crm_viba_offer_calculate", () => {
  it.each(["marketing", "project_manager", null])("%s szerepkör elutasítva", async (role) => {
    await expect(vibaOfferCalcTool({ quote_id: Q, calc }, ctx(sb(role, own), role))).rejects.toThrow(/Tulajdonos és Sales/);
  });
  it("nem látható ajánlat elutasítva", async () => {
    await expect(vibaOfferCalcTool({ quote_id: Q, calc }, ctx(sb("sales", null), "sales"))).rejects.toThrow(/nem hozzáférhető/);
  });
  it("kapott költségvetéses ajánlaton nem fut", async () => {
    await expect(vibaOfferCalcTool({ quote_id: Q, calc }, ctx(sb("sales", { ...own, quote_kind: "received_budget" }), "sales"))).rejects.toThrow(/csak saját VIBA-ajánlat/);
  });
  it("ismeretlen paraméter (pl. write) elutasítva", async () => {
    await expect(vibaOfferCalcTool({ quote_id: Q, calc, write: true }, ctx(sb("sales", own), "sales"))).rejects.toThrow();
  });
  it("számol, nem ír; panel_import visszatölthető, ugyanazt az eredményt adja", async () => {
    const s = sb("sales", own);
    const r = await vibaOfferCalcTool({ quote_id: Q, calc }, ctx(s, "sales"));
    expect(r.totals.netHuf).toBe(400_000);
    expect(r.item_plan_preview.new_rows).toBe(1);
    expect(s.writes).toEqual([]);
    expect(decodeImport(r.panel_import)).toEqual(calc);
    expect(r.not_done[0]).toMatch(/nem került az ajánlatba/);
  });
  it("meglévő azonos tétel: nem lenne újra beírva", async () => {
    const r = await vibaOfferCalcTool({ quote_id: Q, calc }, ctx(sb("owner", own, [{ section: "Alapcsomag (m²)", name: "Villamos szerelés – TESZT (v1) – munkadíj", quantity: 80, unit: "m2", unit_price: 5000 }]), "owner"));
    expect(r.item_plan_preview).toMatchObject({ new_rows: 0, already_on_quote: 1 });
  });
});

describe("Timothy crm_vbf_defects_extract", () => {
  it("Marketing elutasítva; Sales kinyer", async () => {
    await expect(vbfExtractTool({ text: "1. Hiányzik a földelés" }, ctx(sb("marketing", null), "marketing"))).rejects.toThrow(/Tulajdonos és Sales/);
    const r = await vbfExtractTool({ text: "1. Hiányzik a földelés, azonnal javítandó" }, ctx(sb("sales", null), "sales"));
    expect(r.defects[0]).toMatchObject({ ref: "1", priority: "urgent" });
    expect(r.untrusted_content).toBe(true);
  });
});
