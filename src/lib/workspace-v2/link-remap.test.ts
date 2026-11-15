import { describe, it, expect } from "vitest";
import { remapToWorkspace } from "./link-remap";

const id = "b454cd40-3473-4653-9424-9cc5bbebe527";

describe("régi hivatkozások az új munkaterületen", () => {
  it("ügyfél, kapcsolattartó, ügy és ajánlat az új képernyőn nyílik", () => {
    expect(remapToWorkspace({ to: "/customers/$id", params: { id }, search: { tab: "contacts" } })).toEqual({ to: "/munka/ugyfel/$id", params: { id }, search: { tab: "contacts" } });
    expect(remapToWorkspace({ to: "/contacts/$id", params: { id } })?.to).toBe("/munka/kapcsolattarto/$id");
    expect(remapToWorkspace({ to: "/leads", search: { lead: id } })).toEqual({ to: "/munka/ugy/$id", params: { id } });
    expect(remapToWorkspace({ to: "/sales/leads", search: { lead: id } })).toEqual({ to: "/munka/ugy/$id", params: { id } });
    expect(remapToWorkspace({ to: "/quotes/$id", params: { id } })?.to).toBe("/munka/sales/ajanlat/$id");
  });
  it("érdeklődő, kampány és levélszál az új képernyőn nyílik, a kampány-paraméterek megmaradnak", () => {
    expect(remapToWorkspace({ to: "/web-quote-requests/$id", params: { id } })?.to).toBe("/munka/marketing/erdeklodo/$id");
    expect(remapToWorkspace({ to: "/campaign-list", search: { campaignId: id, junk: "x" } })).toEqual({ to: "/munka/marketing/kampany", search: { campaignId: id } });
    expect(remapToWorkspace({ to: "/emails/$threadId", params: { threadId: "t1" }, search: { mailbox: "a@b.hu" } })).toEqual({ to: "/munka/levelezes/$threadId", params: { threadId: "t1" }, search: { mailbox: "a@b.hu" } });
  });
  it("ismeretlen vagy dokumentum-cél (nyomtatás) változatlan marad", () => {
    expect(remapToWorkspace({ to: "/quotes/$id/print", params: { id } })).toBeNull();
    expect(remapToWorkspace({ to: "/attendance" })).toBeNull();
  });
});
