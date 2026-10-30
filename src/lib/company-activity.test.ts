import { describe, expect, it, vi } from "vitest";
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { companyCounters, emailVisibilityHint, groupEmailThreads, mergeById } from "./company-activity";

describe("company-activity", () => {
  it("lead-hez kötött, projekt nélküli ajánlat is beszámít a nyitott ajánlatokba", () => {
    const projectQuotes = [{ id: "q1", status: "sent" }];
    const leadQuotes = [{ id: "q1", status: "sent" }, { id: "q2", status: "draft" }];
    expect(companyCounters(mergeById(projectQuotes, leadQuotes), []).openQuotes).toBe(2);
  });
  it("utánkövetés egyszer számít, lejárt külön", () => {
    const now = new Date("2026-10-30T12:00:00Z");
    const f = mergeById(
      [{ id: "f1", completed: false, due_date: "2026-10-01" }],
      [{ id: "f1", completed: false, due_date: "2026-10-01" }, { id: "f2", completed: false, due_date: "2026-11-30" }, { id: "f3", completed: true, due_date: "2026-01-01" }],
    );
    expect(companyCounters([], f, now)).toEqual({ openQuotes: 0, openFollowups: 2, overdueFollowups: 1 });
  });
  it("12 Raszter mintája: 6 levél 2 szálba csoportosul", () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({ id: `a${i}`, thread_id: "A", internal_date: `2026-01-0${i}` }))
      .concat([{ id: "b1", thread_id: "B", internal_date: "2026-02-01" }]);
    const t = groupEmailThreads(rows);
    expect(t.length).toBe(2);
    expect(t.reduce((s, x) => s + x.count, 0)).toBe(6);
  });
  it("korlátozott hozzáférésnél 0 levél nem azt jelenti, hogy nincs levél", () => {
    expect(emailVisibilityHint(false, 0)).toMatch(/nincs olvasási jogod/);
    expect(emailVisibilityHint(true, 0)).toBeNull();
  });
});

import { companyThreadOrFilter } from "./company-activity";
describe("céges szál-szűrő", () => {
  it("céghez kötött vagy kapcsolattartó résztvevős szál; veszélyes karakteres cím kimarad", () => {
    expect(companyThreadOrFilter("c1", ["a@x.hu", "b@y.hu", 'rossz",cím'])).toBe('company_id.eq.c1,participants.ov.{"a@x.hu","b@y.hu"}');
    expect(companyThreadOrFilter("c1", [])).toBe("company_id.eq.c1");
  });
});
