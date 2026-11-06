import { describe, it, expect } from "vitest";
import { decideIntake } from "./web-request-intake";

const base = { name: "Kiss Anna", company_name: null, email: "a@b.hu", isTest: false, contactMatches: [], companyNameMatches: [] };

describe("weboldali igény felvétele", () => {
  it('céghez kötött és cég nélküli azonos email nem kapcsolható automatikusan',()=>{
    expect(decideIntake({...base,contactMatches:[{id:'linked',company_id:'co1'},{id:'unlinked',company_id:null}]}).kind).toBe('ambiguous');
  });
  it("egy céghez tartozó meglévő email esetén nem hoz létre új céget", () => {
    expect(decideIntake({ ...base, contactMatches: [{ id: "c1", company_id: "co1" }] })).toEqual({ kind: "existing", companyId: "co1" });
  });
  it("több cégnél szereplő email kézi döntést kér", () => {
    expect(decideIntake({ ...base, contactMatches: [{ id: "c1", company_id: "co1" }, { id: "c2", company_id: "co2" }] }).kind).toBe("ambiguous");
  });
  it("azonos nevű cégnél nem von össze automatikusan", () => {
    expect(decideIntake({ ...base, companyNameMatches: [{ id: "co9" }] }).kind).toBe("ambiguous");
  });
  it("TESZT igény TESZT jelölésű céget kap", () => {
    const d = decideIntake({ ...base, isTest: true });
    expect(d).toEqual({ kind: "create", companyName: "TESZT – Kiss Anna", contactName: "Kiss Anna" });
  });
  it("név nélkül nem vehető fel", () => {
    expect(decideIntake({ ...base, name: null }).kind).toBe("blocked");
  });
});
