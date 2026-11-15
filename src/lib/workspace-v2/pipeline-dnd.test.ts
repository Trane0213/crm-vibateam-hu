import { describe, it, expect } from "vitest";
import { pipelineDrop, columnSummary } from "./pipeline-dnd";

describe("Pipeline-húzás szabályai", () => {
  it("engedélyezett lépés: Ajánlat kiadva → Utánkövetés", () => {
    expect(pipelineDrop("quote_sent", "follow_up")).toEqual({ kind: "status", to: "follow_up" });
  });
  it("tiltott visszalépés: Szerződés → Ajánlat előkészítés", () => {
    const d = pipelineDrop("contract", "quote_prep");
    expect(d.kind).toBe("blocked");
  });
  it("Ajánlat előkészítésből nem lehet közvetlenül Szerződésbe ugrani", () => {
    expect(pipelineDrop("quote_prep", "contract").kind).toBe("blocked");
  });
  it("Megnyert csak Szerződésből, és akkor is a projektlétrehozó ablak nyílik", () => {
    expect(pipelineDrop("contract", "won")).toEqual({ kind: "won-dialog" });
    expect(pipelineDrop("follow_up", "won").kind).toBe("blocked");
  });
  it("Elveszett mindig az okválasztót nyitja", () => {
    expect(pipelineDrop("quote_sent", "lost")).toEqual({ kind: "lost-dialog" });
  });
  it("lezárt ügy nem mozdítható", () => {
    expect(pipelineDrop("won", "contract").kind).toBe("blocked");
  });
  it("ugyanabba az oszlopba ejtés nem csinál semmit", () => {
    expect(pipelineDrop("follow_up", "follow_up")).toEqual({ kind: "noop" });
  });
  it("oszlopösszeg csak ismert értékekből, az ismeretlent külön számolja", () => {
    expect(columnSummary([{ quote_total: 1000 }, { quote_total: null }, { quote_total: 500 }])).toEqual({ count: 3, sum: 1500, unknown: 1 });
  });
});
