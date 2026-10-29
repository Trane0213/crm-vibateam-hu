import { describe, it, expect } from "vitest";
import { detectRecordContext, contextPrefix } from "./ai-panel-context";

const ID = "a8dbfa16-0000-4000-8000-000000000001";

describe("AI-panel kontextus", () => {
  it("projekt adatlapon felismeri a projektet", () => {
    expect(detectRecordContext(`/projects/${ID}`)).toEqual({ kind: "project", id: ID, label: "Projekt" });
  });
  it("cég, lead és ajánlat adatlapot is felismer", () => {
    expect(detectRecordContext(`/companies/${ID}`)?.kind).toBe("company");
    expect(detectRecordContext(`/leads/${ID}`)?.kind).toBe("lead");
    expect(detectRecordContext(`/quotes/${ID}`)?.kind).toBe("quote");
  });
  it("listaoldalon nincs rekord-kontextus", () => {
    expect(detectRecordContext("/projects")).toBeNull();
    expect(detectRecordContext("/leads/lost")).toBeNull();
  });
  it("a kontextus tiltja a kitalálást és a jóváhagyás nélküli módosítást", () => {
    const p = contextPrefix({ kind: "project", id: ID, label: "Projekt" }, "Teszt");
    expect(p).toContain(ID);
    expect(p).toContain("ne találd ki");
    expect(p).toContain("jóváhagyás nélkül");
  });
});
