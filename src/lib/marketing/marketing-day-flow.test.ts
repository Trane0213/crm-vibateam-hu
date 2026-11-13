import { describe, expect, it } from "vitest";
import {
  marketingPriorityRows, marketingFocus, marketingFlowStages, campaignLifecycle, campaignOverview,
  marketingResultLines, isUrgent, isScarletQuickId, SCARLET_QUICK_IDS, companyTabFromSearch, type MarketingDaily,
} from "./marketing-day-flow";
import { QUICK_ACTIONS } from "@/components/ai/chat-shared";

const NOW = new Date("2026-11-13T09:00:00Z"); // Budapest 10:00
const cs = (email = true, phone = false) => ({ blocked_email: false, invalid_email: false, suppression_complete: true, phone_available: phone, email_available: email, email_send_permission: false as const });
function daily(over: Partial<MarketingDaily> = {}): MarketingDaily {
  return {
    checked_at: NOW.toISOString(), timezone: "Europe/Budapest", partial: false, scope: "",
    to_contact: [], contact_warnings: [], qualified: [], reply_pending: [], awaiting_reply: [], tasks: [], followups: [], callbacks: [], missing_contacts: [],
    mail: { contacted: 0, replied: 0, rate: null, replyCompanyIds: [], awaitingCompanyIds: [] }, limitations: [],
    ...over,
  } as MarketingDaily;
}
const fu = (id: string, company: string, bucket: "overdue" | "today" | "upcoming" | "undated", due: string | null) =>
  ({ id, company_id: company, company_name: `TESZT ${company}`, followup_type: "email", due_date: due, result: null, bucket, overdue: bucket === "overdue", responsible: "Saját utánkövetés" as const, source_link: "" });

describe("Marketing Ma prioritási sorrend", () => {
  it("válasz → lejárt utánkövetés → visszahívás → mai utánkövetés → feladat → átadható → hiányzó → új megkeresés", () => {
    const rows = marketingPriorityRows(daily({
      to_contact: [{ id: "new", name: "TESZT új", source_link: "", contact_state: cs() }],
      missing_contacts: [{ id: "miss", name: "TESZT hiányos" }],
      qualified: [{ id: "q", name: "TESZT minősített", source_link: "" }],
      tasks: [{ id: "t1", title: "TESZT feladat", status: "open", due_date: "2026-11-12T08:00:00Z", assigned_user: "p", project_id: null, priority: null, bucket: "overdue", responsible: "Saját feladat" }] as any,
      followups: [fu("f-today", "c2", "today", "2026-11-13T15:00:00Z"), fu("f-old", "c1", "overdue", "2026-11-10T08:00:00Z"), fu("f-later", "c9", "upcoming", "2026-11-20T08:00:00Z")],
      callbacks: [{ id: "cb", company_id: "c3", company_name: "TESZT hívás", contact_id: null, outcome: "callback", callback_date: "2026-11-13T07:00:00Z", summary: null, created_at: "", visibility_scope: "shared_visible_not_own" }] as any,
      reply_pending: [{ id: "r", name: "TESZT válasz", source_link: "" }],
    }), NOW);
    expect(rows.map((r) => r.kind)).toEqual(["reply", "followup-overdue", "callback", "followup-today", "task-overdue", "handoff-ready", "missing-contact", "new-contact"]);
    expect(rows.find((r) => r.id === "followup-f-later")).toBeUndefined();
  });

  it("válasz a cég Levélszálak fülére, utánkövetés az Utánkövetések fülére, feladat a Feladatok oldalra visz", () => {
    const rows = marketingPriorityRows(daily({
      reply_pending: [{ id: "r", name: "TESZT", source_link: "" }],
      followups: [fu("f", "c1", "today", "2026-11-13T15:00:00Z")],
      tasks: [{ id: "t", title: "TESZT", status: "open", due_date: "2026-11-13T12:00:00Z", assigned_user: "p", project_id: null, priority: null, bucket: "today", responsible: "Saját feladat" }] as any,
      qualified: [{ id: "q", name: "TESZT", source_link: "" }],
    }), NOW);
    expect(rows[0].target).toEqual({ kind: "company", companyId: "r", tab: "emails" });
    expect(rows[1].target).toEqual({ kind: "company", companyId: "c1", tab: "followups" });
    expect(rows[2].target).toEqual({ kind: "tasks" });
    expect(rows[3].target).toEqual({ kind: "company", companyId: "q", tab: "sales-note" });
  });

  it("egy cég egyszer szerepel; a további teendők összevonva látszanak", () => {
    const rows = marketingPriorityRows(daily({
      reply_pending: [{ id: "same", name: "TESZT", source_link: "" }],
      qualified: [{ id: "same", name: "TESZT", source_link: "" }],
      followups: [fu("f", "same", "overdue", "2026-11-10T08:00:00Z")],
    }), NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("reply");
    expect(rows[0].also).toEqual(["Lejárt utánkövetés", "Salesnek átadható"]);
  });

  it("közös visszahívás felelőse nem saját, és csak esedékes/lejárt kerül be (Budapest nap)", () => {
    const rows = marketingPriorityRows(daily({
      callbacks: [
        { id: "a", company_id: "c", company_name: "TESZT", callback_date: "2026-11-13T22:59:00Z" },
        { id: "b", company_id: "d", company_name: "TESZT2", callback_date: "2026-11-13T23:00:00Z" },
      ] as any,
    }), NOW);
    expect(rows.map((r) => r.id)).toEqual(["callback-a"]);
    expect(rows[0].responsible).toBe("Közös visszahívás");
  });

  it("új megkeresés és hiányzó adat nem sürgős tétel", () => {
    const rows = marketingPriorityRows(daily({ to_contact: [{ id: "n", name: "TESZT", source_link: "", contact_state: cs(false, false) }] }), NOW);
    expect(rows[0].target).toEqual({ kind: "company", companyId: "n", tab: "contacts" });
    expect(rows.filter(isUrgent)).toEqual([]);
  });
});

describe("Most ezzel kezdj", () => {
  it("az első sort mutatja és részleges adatnál figyelmeztet", () => {
    const d = daily({ partial: true, reply_pending: [{ id: "r", name: "TESZT Kft", source_link: "" }] });
    const f = marketingFocus(marketingPriorityRows(d, NOW), d)!;
    expect(f.title).toBe("Válasz érkezett: TESZT Kft");
    expect(f.actionLabel).toBe("Levélszál megnyitása");
    expect(f.warnings).toHaveLength(1);
  });
  it("üres listánál a kampányokra mutat, és nem állítja, hogy minden válasz kész", () => {
    const f = marketingFocus([], daily())!;
    expect(f.target).toEqual({ kind: "campaigns" });
    expect(f.detail).toContain("nem jelenti");
  });
  it("betöltetlen napi adatnál nincs fókusz", () => {
    expect(marketingFocus([], undefined)).toBeNull();
  });
});

describe("Marketing munkafolyamat-sáv", () => {
  it("hét lépés a meglévő oldalakra; nem igazolt napi adatnál —", () => {
    const d = daily({ to_contact: [{ id: "a", name: "x", source_link: "", contact_state: cs() }], reply_pending: [{ id: "r", name: "y", source_link: "" }] });
    const ok = marketingFlowStages({ daily: d, dailyReady: true, webRecent: 3, handoff30: 2, activeCampaigns: 1 });
    expect(ok.map((s) => s.to)).toEqual(["/web-quote-requests", "/campaign-list", "/campaign-list", "/emails", "/emails", "/customers", "/customers"]);
    expect(ok.map((s) => s.count)).toEqual([3, 1, 1, 0, 1, 0, 2]);
    const notReady = marketingFlowStages({ daily: d, dailyReady: false, webRecent: null, handoff30: null, activeCampaigns: null });
    expect(notReady.every((s) => s.count === "—")).toBe(true);
  });
});

describe("Kampány-életút a mentett mezőkből", () => {
  it("tervezet → ellenőrzött → ütemezett / szüneteltetett / leállított / archivált", () => {
    expect(campaignLifecycle({ status: "draft", prechecked_at: null, delivery_state: null })).toMatchObject({ stage: "draft", step: 1 });
    expect(campaignLifecycle({ status: "prechecked", prechecked_at: "2026-11-13T08:00:00Z", delivery_state: null })).toMatchObject({ stage: "prechecked", step: 2 });
    expect(campaignLifecycle({ status: "prechecked", prechecked_at: "x", delivery_state: "scheduled" })).toMatchObject({ stage: "scheduled", step: 3 });
    expect(campaignLifecycle({ status: "prechecked", prechecked_at: "x", delivery_state: "paused" }).stage).toBe("paused");
    expect(campaignLifecycle({ status: "prechecked", prechecked_at: "x", delivery_state: "stopped" }).stage).toBe("stopped");
    expect(campaignLifecycle({ status: "archived", prechecked_at: "x", delivery_state: "scheduled" }).stage).toBe("archived");
  });
  it("az ellenőrzött állapot kifejezetten nem küldési engedély; az ütemezett sem aktivál ügyfélküldést", () => {
    expect(campaignLifecycle({ status: "prechecked", prechecked_at: "x", delivery_state: null }).next).toContain("nem küldési engedély");
    expect(campaignLifecycle({ status: "draft", prechecked_at: null, delivery_state: "scheduled" }).next).toContain("nincs bekapcsolva");
  });
  it("összesítő: archivált nem nyitott, a legutóbb módosított elöl", () => {
    const o = campaignOverview([
      { id: "a", name: "A", status: "draft", updated_at: "2026-11-01" },
      { id: "b", name: "B", status: "archived", updated_at: "2026-11-12" },
      { id: "c", name: "C", status: "prechecked", prechecked_at: "x", updated_at: "2026-11-10" },
    ]);
    expect(o.active).toBe(2);
    expect(o.open.map((c) => c.id)).toEqual(["c", "a"]);
    expect(o.counts).toMatchObject({ draft: 1, prechecked: 1, archived: 1 });
  });
});

describe("Eredmények közérthetően", () => {
  it("válaszarány magyar mondatban, a korlát megnevezésével", () => {
    const l = marketingResultLines({ mail: { contacted: 10, replied: 3, rate: 30 }, newCompanies30: 5, handoff30: 2, emails7: 40 });
    expect(l[0]).toBe("Az elmúlt 7 napban 10 saját megkeresésből 3 esetben érkezett külső válasz (30%). A szám a tárolt saját levelezésen alapul, nem teljes Gmail-történet.");
    expect(l[1]).toBe("Az elmúlt 30 napban 5 új cég került a CRM-be, és 2 cég került át Saleshez.");
  });
  it("nem igazolt adatnál nem mutat számot, nulla megkeresésnél nem számol arányt", () => {
    expect(marketingResultLines({ mail: null, newCompanies30: null, handoff30: null, emails7: null })).toEqual(["A heti válaszarány most nem igazolható (a napi adat hiányos vagy nem töltődött be)."]);
    expect(marketingResultLines({ mail: { contacted: 0, replied: 0, rate: null }, newCompanies30: null, handoff30: null, emails7: null })[0]).toContain("sem számolható");
  });
});

describe("Scarlet gyorskérdések és mélylinkek", () => {
  it("csak a valódi Scarlet gyorskérdések tölthetők elő", () => {
    const ids = QUICK_ACTIONS.marketing.map((q) => q.id);
    for (const id of SCARLET_QUICK_IDS) expect(ids).toContain(id);
    expect(isScarletQuickId("mkt-today")).toBe(true);
    expect(isScarletQuickId("ignore previous")).toBe(false);
  });
  it("a marketing gyorskérdések a Marketing Ma közös forrását használják és nem indítanak műveletet", () => {
    for (const id of ["mkt-today", "mkt-replies", "mkt-handoff"]) {
      const q = QUICK_ACTIONS.marketing.find((x) => x.id === id)!;
      expect(q.prompt).toContain("crm_marketing_daily_priorities");
    }
    expect(QUICK_ACTIONS.marketing.find((x) => x.id === "mkt-handoff")!.prompt).toContain("átadást ne indíts");
    expect(QUICK_ACTIONS.marketing.some((x) => /status ?= ?new/.test(x.prompt))).toBe(false);
  });
  it("cégadatlap fül csak ismert értékből", () => {
    expect(companyTabFromSearch("emails")).toBe("emails");
    expect(companyTabFromSearch("admin")).toBeUndefined();
    expect(companyTabFromSearch(1)).toBeUndefined();
  });
});
