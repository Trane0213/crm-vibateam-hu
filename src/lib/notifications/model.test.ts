import { describe, expect, it } from "vitest";
import { badgeCount, isImmediate, safeLink, type NotificationRow } from "./model";

const base: NotificationRow = { id: "1", category: "business", severity: "info", requires_decision: false, title: "t", body: "", link_path: "/leads", occurrences: 1, created_at: "", last_occurred_at: "", resolved_at: null, audience_user: null };

describe("értesítés kézbesítési szabály", () => {
  it("tulajdonosnak a kritikus azonnali", () => expect(isImmediate({ ...base, severity: "critical" }, true)).toBe(true));
  it("tulajdonosnak a döntést igénylő azonnali", () => expect(isImmediate({ ...base, requires_decision: true }, true)).toBe(true));
  it("tulajdonosnak a szerepkörös figyelmeztetés napi összesítőbe megy", () => expect(isImmediate({ ...base, severity: "warning" }, true)).toBe(false));
  it("tulajdonosnak a tájékoztatás napi összesítőbe megy", () => expect(isImmediate(base, true)).toBe(false));
  it("Salesnek a figyelmeztetés (pl. hozzárendelt ügy) azonnali", () => expect(isImmediate({ ...base, severity: "warning" }, false)).toBe(true));
  it("tájékoztatás senkinek nem azonnali", () => expect(isImmediate(base, false)).toBe(false));
  it("tulajdonosnak személyesen címzett figyelmeztetés azonnali", () => expect(isImmediate({ ...base, severity: "warning", audience_user: "me" }, true, "me")).toBe(true));
});

describe("csengő számláló", () => {
  const rows: NotificationRow[] = [
    { ...base, id: "a", severity: "critical" },
    { ...base, id: "b", severity: "critical", resolved_at: "2026-11-13" },
    { ...base, id: "c", requires_decision: true },
    { ...base, id: "d", severity: "warning" },
  ];
  it("lezárt és olvasott nem számít", () => expect(badgeCount(rows, new Set(["c"]), true)).toBe(1));
  it("nem tulajdonosnál a figyelmeztetés is számít", () => expect(badgeCount(rows, new Set(), false)).toBe(3));
});

describe("hivatkozás", () => {
  it("belső útvonal engedett", () => expect(safeLink("/leads/abc")).toBe("/leads/abc"));
  it("külső vagy protokoll-relatív tiltott", () => { expect(safeLink("https://x.hu")).toBeNull(); expect(safeLink("//x.hu")).toBeNull(); });
});

describe("értesítések csoportosítása", () => {
  const mk = (id: string, title: string, severity = "info", extra: Partial<NotificationRow> = {}): NotificationRow => ({
    id, category: "document", severity, requires_decision: false, title, body: "", link_path: "/settings/knowledge-graph",
    occurrences: 1, created_at: "2026-11-13T10:00:00Z", last_occurred_at: "2026-11-13T10:00:00Z", resolved_at: null, audience_user: null, ...extra,
  });
  it("legalább 3 azonos jelzést egy csoportba von, a kevesebbet külön hagyja", async () => {
    const { groupNotifications } = await import("./model");
    const rows = [mk("a", "Dokumentum ellenőrzést igényel"), mk("x", "Más"), mk("b", "Dokumentum ellenőrzést igényel", "warning"), mk("c", "Dokumentum ellenőrzést igényel"), mk("y", "Más")];
    const g = groupNotifications(rows);
    expect(g.map((x) => x.rows.length)).toEqual([3, 1, 1]);
    expect(g[0].lead.id).toBe("b");
  });
  it("döntést igénylő jelzés a csoportban is látható marad", async () => {
    const { groupNotifications } = await import("./model");
    const g = groupNotifications([mk("a", "T"), mk("b", "T", "info", { requires_decision: true }), mk("c", "T")]);
    expect(g).toHaveLength(1); expect(g[0].requiresDecision).toBe(true);
  });
});
