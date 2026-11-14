import { describe, expect, it } from "vitest";
import {
  CONTRACT_APPROVAL_AVAILABLE, FINANCE_DATA_CONNECTED, OWNER_KIND_ORDER, contractPrepWarnings, leadLink, ownerFocus,
  ownerItems, ownerLaneFromSearch, ownerStages, parseInternalLink, projectRisks, todayBusiness, truncatedSections,
  type OwnerLead, type OwnerProject, type OwnerQuote, type OwnerTask, type SourceState,
} from "./owner-day-flow";
import type { FactSection } from "@/lib/owner-report/model";
import { HELP_GUIDES } from "@/lib/help-guide";
import { canAccessRoute } from "@/lib/permissions";

const NOW = new Date("2026-11-14T09:00:00Z"); // Budapest 10:00
const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const L1 = "33333333-3333-4333-8333-333333333333";
const L2 = "44444444-4444-4444-8444-444444444444";

const project = (o: Partial<OwnerProject> = {}): OwnerProject => ({ id: P1, title: "Tetőfelújítás", status: "kivitelezes", company_id: null, deadline: null, project_manager_user_id: "pm-1", ...o });
const task = (o: Partial<OwnerTask> = {}): OwnerTask => ({ id: "t1", title: "Állvány", status: "open", due_date: "2026-11-13T10:00:00Z", project_id: P1, assigned_user: "u1", ...o });
const lead = (o: Partial<OwnerLead> = {}): OwnerLead => ({ id: L1, status: "contract", summary: "Ügy", company_id: "c1", contact_id: "k1", assigned_to: "s1", next_step_due_at: null, pipeline_entered_at: "2026-11-01T00:00:00Z", ...o });
const quote = (o: Partial<OwnerQuote> = {}): OwnerQuote => ({ id: "q1", lead_id: L1, title: "Ajánlat", status: "accepted", is_current: true, net: 100000, ...o });
const sec = (key: string, items: FactSection["items"], total = items.length): FactSection => ({ key, title: key, total, items });

describe("tulajdonosi napi lista — sorrend és forrás", () => {
  it("prioritás: értesítés → AI-jóváhagyás → szerződés → elfogadott ajánlat → kritikus projekt → elmaradt → kész ajánlat → dolgozói → AI", () => {
    const items = ownerItems({
      facts: { sections: [
        sec("immediate", [{ id: "n1", type: "notification", label: "Kritikus hiba", link: "/help", extra: { severity: "critical" } }]),
        sec("overdue", [{ id: "f1", type: "followup", label: "Lejárt utánkövetés", extra: { lead_id: L2 } }]),
        sec("open_issues", [{ id: "i1", type: "issue", label: "Hiba · /quotes · Új" }]),
        sec("ai_signals", [{ id: "s1", type: "ai_signal", label: "Lassú válasz · crm" }]),
      ] },
      projects: [project()], tasks: [task()],
      leads: [lead(), lead({ id: L2, status: "quote_sent" })],
      quotes: [quote({ id: "q2", lead_id: L2 }), quote({ id: "q3", lead_id: L2, status: "ready" })],
      approvals: [{ id: "a1", tool_name: "sales_send_email", agent_id: "sales", approval_expires_at: "2026-11-14T10:00:00Z", created_at: null }],
    }, NOW);
    expect(items.map((i) => i.kind)).toEqual(["notification", "ai_approval", "contract", "accepted_quote", "critical_project", "overdue_followup", "ready_quote", "issue", "ai_signal"]);
    expect(OWNER_KIND_ORDER[0]).toBe("notification");
    for (const i of items) expect(i.source.length).toBeGreaterThan(0);
  });

  it("lejárt AI-jóváhagyás nem jelenik meg teendőként", () => {
    const items = ownerItems({ approvals: [{ id: "a1", tool_name: "x", agent_id: "sales", approval_expires_at: "2026-11-14T08:59:00Z", created_at: null }] }, NOW);
    expect(items).toHaveLength(0);
  });

  it("átfedés: kritikus projekt lejárt feladata és Szerződés-ügy lejárt lépése/utánkövetése nem duplikálódik", () => {
    const items = ownerItems({
      facts: { sections: [sec("overdue", [
        { id: "t1", type: "task", label: "Lejárt feladat: Állvány", extra: { project_id: P1 } },
        { id: "t9", type: "task", label: "Lejárt feladat: Egyéb", extra: { project_id: P2 } },
        { id: L1, type: "lead", label: "Lejárt következő lépés (phone)" },
        { id: "f1", type: "followup", label: "Lejárt utánkövetés", extra: { lead_id: L1 } },
      ])] },
      projects: [project()], tasks: [task()], leads: [lead()], quotes: [quote()],
    }, NOW);
    expect(items.filter((i) => i.kind === "overdue_task").map((i) => i.sourceId)).toEqual(["t9"]);
    expect(items.some((i) => i.kind === "overdue_lead" || i.kind === "overdue_followup")).toBe(false);
    expect(items.filter((i) => i.kind === "contract")).toHaveLength(1);
  });

  it("ugyanaz a hibajegy újként és nyitottként is csak egyszer; AI_REVIEW jegy George-sávba kerül", () => {
    const items = ownerItems({ facts: { sections: [
      sec("new_issues", [{ id: "i1", type: "issue", label: "Hiba · /x · Új", extra: { reporter_role: "sales" } }, { id: "i2", type: "issue", label: "AI-felülvizsgálat · /y · Új" }]),
      sec("open_issues", [{ id: "i1", type: "issue", label: "Hiba · /x · Új" }]),
    ] } }, NOW);
    expect(items.map((i) => [i.sourceId, i.lane])).toEqual([["i1", "team"], ["i2", "ai"]]);
    expect(items[0].detail).toContain("Sales");
  });
});

describe("hivatkozások — valós rekord, csak belső útvonal", () => {
  it("Pipeline-ügy a Pipeline adatlapra, előkészítés a Leadek oldalra", () => {
    expect(leadLink(lead())).toEqual({ to: "/sales/leads", search: { lead: L1 } });
    expect(leadLink(lead({ pipeline_entered_at: null, status: "new" }))).toEqual({ to: "/leads", search: { lead: L1 } });
  });
  it("kritikus projekt a megfelelő fülre: feladat → tasks, átadás → handover", () => {
    const [a] = ownerItems({ projects: [project()], tasks: [task()] }, NOW);
    expect(a.link).toEqual({ to: `/projects/${P1}`, search: { tab: "tasks" } });
    const [b] = ownerItems({ projects: [project({ status: "atadas" })], tasks: [] }, NOW);
    expect(b.link).toEqual({ to: `/projects/${P1}`, search: { tab: "handover" } });
  });
  it("parseInternalLink: külső vagy protokoll-relatív link tiltva, lekérdezés search-be bontva", () => {
    expect(parseInternalLink("https://evil.example")).toBeNull();
    expect(parseInternalLink("//evil.example")).toBeNull();
    expect(parseInternalLink(null)).toBeNull();
    expect(parseInternalLink("/help")).toEqual({ to: "/help" });
    expect(parseInternalLink(`/sales/leads?lead=${L1}`)).toEqual({ to: "/sales/leads", search: { lead: L1 } });
  });
  it("lane mélylink csak ismert értéket fogad el", () => {
    expect(ownerLaneFromSearch("projects")).toBe("projects");
    expect(ownerLaneFromSearch("admin")).toBeUndefined();
    expect(ownerLaneFromSearch(3)).toBeUndefined();
  });
});

describe("kritikus projektek", () => {
  it("okok: lejárt, akadályozott, lejárt határidő (Budapest nap), nincs PM; lezárt projekt kimarad", () => {
    const risks = projectRisks([
      project({ id: P1, deadline: "2026-11-13" }),
      project({ id: P2, status: "lezart", project_manager_user_id: null }),
      project({ id: "p3", title: "Rendben", deadline: "2026-11-14" }),
      project({ id: "p4", title: "Nincs PM", project_manager_user_id: null }),
    ], [task(), task({ id: "t2", status: "blocked", due_date: null })], NOW);
    expect(risks.map((r) => r.project.id)).toEqual([P1, "p4"]);
    expect(risks[0].reasons).toEqual(["1 lejárt feladat", "1 akadályozott feladat", "a projekt határideje lejárt"]);
    expect(risks[1].reasons).toEqual(["nincs kijelölt projektvezető"]);
  });
  it("régi projektnél az átadási adatban lévő PM is kijelöltnek számít", () => {
    expect(projectRisks([project({ project_manager_user_id: null, handoff_payload: { project_manager_user_id: "pm-9" } })], [], NOW)).toHaveLength(0);
  });
});

describe("szerződés-előkészítés és pénzügy — nincs szimuláció", () => {
  it("figyelmeztetések a mentett adatból", () => {
    expect(contractPrepWarnings(lead(), [quote()])).toEqual([]);
    expect(contractPrepWarnings(lead({ company_id: null, contact_id: null, assigned_to: null }), [quote({ net: null })]))
      .toEqual(["Nincs ügyfél megadva — Megnyertük nem lehetséges", "Nincs kapcsolattartó", "Az elfogadott ajánlat nettó összege nincs rögzítve", "Nincs felelős Sales"]);
    expect(contractPrepWarnings(lead(), [quote({ status: "sent" })])).toContain("Nincs elfogadottnak jelölt ajánlat");
  });
  it("pénzügyi és szerződés-jóváhagyási adatkapcsolat nincs bekötve", () => {
    expect(FINANCE_DATA_CONNECTED).toBe(false);
    expect(CONTRACT_APPROVAL_AVAILABLE).toBe(false);
    const contract = ownerItems({ leads: [lead()], quotes: [quote()] }, NOW).find((i) => i.kind === "contract")!;
    expect(contract.detail).toContain("e-aláírás a CRM-ben nincs");
    expect(contract.link).toEqual({ to: "/sales/leads", search: { lead: L1 } });
  });
  it("megnyert vagy elveszett ügy elfogadott ajánlata nem teendő", () => {
    const items = ownerItems({ leads: [lead({ status: "won" })], quotes: [quote()] }, NOW);
    expect(items).toHaveLength(0);
  });
});

describe("fókusz, sávok, részleges adat", () => {
  const ok = (key: string): SourceState => ({ key, label: key, state: "ok" });
  const nc: SourceState = { key: "finance", label: "f", state: "not_connected" };
  it("mind hibás → error; betöltés üres listával → loading; üres → calm; hiba mellett partial", () => {
    expect(ownerFocus([], [{ key: "a", label: "a", state: "error" }, nc]).state).toBe("error");
    expect(ownerFocus([], [{ key: "a", label: "a", state: "loading" }, nc]).state).toBe("loading");
    expect(ownerFocus([], [ok("a"), nc])).toEqual({ state: "calm", partial: false });
    expect(ownerFocus([], [ok("a"), { key: "b", label: "b", state: "error" }, nc])).toEqual({ state: "calm", partial: true });
  });
  it("első tétel a fókusz, a többi száma látszik", () => {
    const items = ownerItems({ projects: [project(), project({ id: P2, title: "B", project_manager_user_id: null })], tasks: [task()] }, NOW);
    const f = ownerFocus(items, [ok("a"), nc]);
    expect(f.state === "item" && f.item.sourceId === P1 && f.more === 1).toBe(true);
  });
  it("hat sáv a /today?lane= szűrőre; betöltés alatt nem mutat 0-t", () => {
    const st = ownerStages([], false);
    expect(st.map((s) => s.key)).toEqual(["decide", "deals", "projects", "overdue", "team", "ai"]);
    expect(st.every((s) => s.count === "…" && s.to === "/today" && s.search.lane === s.key)).toBe(true);
  });
  it("Ma történt és csonkolt szakasz jelzése", () => {
    const facts = { sections: [
      sec("business", [{ id: L1, type: "lead", label: "Megnyert ügy" }, { id: "x", type: "quote_send", label: "Igazoltan kiküldött ajánlat" }], 2),
      sec("overdue", [{ id: "t", type: "task", label: "x" }], 40),
    ] };
    expect(todayBusiness(facts)).toMatchObject({ won: 1, lost: 0, sent: 1, web: 0, total: 2 });
    expect(truncatedSections(facts)).toEqual([{ key: "overdue", title: "overdue", shown: 1, total: 40 }]);
  });
});

describe("tulajdonosi súgó", () => {
  it("minden Owner-súgólépés engedélyezett útvonalra mutat, és leírja a Mai vezetői munkát", () => {
    for (const step of HELP_GUIDES.owner) expect(canAccessRoute("owner", step.path)).toBe(true);
    expect(HELP_GUIDES.owner[0].title).toContain("Mai vezetői munka");
    expect(HELP_GUIDES.owner.some((s) => s.after.includes("Billingo"))).toBe(true);
  });
});

describe("megjelenítési részletek", () => {
  it("projekt határideje dátumként a részletekben, nem óra-perccel", () => {
    const [it0] = ownerItems({ projects: [project({ deadline: "2026-11-10" })], tasks: [] }, NOW);
    expect(it0.at).toBeNull();
    expect(it0.detail).toContain("Határidő: 2026. nov. 10.");
  });
});
