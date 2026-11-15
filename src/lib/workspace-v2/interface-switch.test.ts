import { describe, expect, it } from "vitest";
import { INTERFACE_OPTIONS } from "./interface-switch";

describe("felületváltó", () => {
  it("Fő CRM a teljes régi CRM kezdőlapjára visz és kikapcsolja az új felület választását", () => {
    const crm = INTERFACE_OPTIONS.find((o) => o.key === "crm")!;
    expect(crm.to).toBe("/today");
    expect(crm.workspaceEnabled).toBe(false);
  });
  it("Új munkafelület a /munka felületre visz és megjegyzi a választást", () => {
    const ws = INTERFACE_OPTIONS.find((o) => o.key === "workspace")!;
    expect(ws.to).toBe("/munka");
    expect(ws.workspaceEnabled).toBe(true);
  });
});
