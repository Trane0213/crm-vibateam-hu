import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  HANDOFF_NOT_IN_CRM, handoffGaps, handoffItems, handoffNext, handoffOrigin, handoffSummary, winHandoffPreview,
  type HandoffInput, type HandoffProject,
} from "./sales-pm-handoff";
import { handoffEditRights, projectBasicsPatch } from "./project-basics";
import { handoffFixTab } from "./handoff-links";
import { buildOrgSignals, isOrgDomain, type OrgInputs } from "@/lib/george/org-signals";
import { pmNextAction, pmProjectSteps, projectDay, PM_ACTION_ORDER, type PmProject } from "@/lib/pm/pm-day-flow";
import { ownerItems } from "@/lib/owner/owner-day-flow";
import { canAccessRoute } from "@/lib/permissions";

const NOW = "2026-11-14T10:00:00.000Z";
const P1 = "aaaaaaaa-0000-4000-8000-000000000001";
const L1 = "bbbbbbbb-0000-4000-8000-000000000001";
const PM = "cccccccc-0000-4000-8000-000000000001";
const SUMMARY = "TESZT: tetőfelújítás, 3 szint, ügyfél kéri a márciusi kezdést";

const proj = (o: Partial<HandoffProject> = {}): HandoffProject => ({
  id: P1, status: "elokeszites", lead_id: L1, address: "TESZT utca 1.", deadline: "2026-12-31", project_manager_user_id: PM,
  handoff_payload: { summary: SUMMARY, notes: "", created_via: "sales_mark_won_with_project", project_manager_user_id: PM },
  handoff_at: "2026-11-09T10:00:00Z", ...o,
});
const full = (o: Partial<HandoffInput> = {}): HandoffInput => ({
  project: proj(), quoteCount: 2, acceptedCount: 1, contactCount: 1, contractDocCount: 1, taskCount: 3, now: NOW, ...o,
});
const state = (inp: HandoffInput, key: string) => handoffItems(inp).find((i) => i.key === key)!.state;

describe("Sales→PM átadási ellenőrzőlista — forrásalapú állapot", () => {
  it("minden forrás megvan → rendben, minden tétel forrásra visszavezethető", () => {
    const s = handoffSummary(full());
    expect(s.phase).toBe("ok");
    expect(s.missing).toBe(0);
    expect(s.items.every((i) => i.state === "ok")).toBe(true);
    expect(s.items.every((i) => i.source.table && i.source.label)).toBe(true);
    expect(s.origin).toBe("sales_rpc");
  });
  it("projektvezető nélkül Tulajdonosi döntésre vár, a felelős a Tulajdonos", () => {
    const s = handoffSummary(full({ project: proj({ project_manager_user_id: null, handoff_payload: { summary: SUMMARY } }) }));
    expect(s.phase).toBe("owner_gap");
    expect(s.items.find((i) => i.key === "pm")).toMatchObject({ state: "missing", role: "owner" });
  });
  it("régi sor: a handoff_payload projektvezetője elfogadott", () => {
    expect(state(full({ project: proj({ project_manager_user_id: null }) }), "pm")).toBe("ok");
  });
  it("Sales-ügy nélküli projekt: NINCS ÖSSZEKÖTVE, nem hiány és nem rendben", () => {
    const inp = full({ project: proj({ lead_id: null, handoff_payload: null }), quoteCount: 0, acceptedCount: 0 });
    expect(state(inp, "lead")).toBe("not_linked");
    expect(state(inp, "summary")).toBe("not_linked");
    expect(state(inp, "quote")).toBe("not_linked");
    expect(state(inp, "accepted")).toBe("not_linked");
    expect(handoffOrigin(inp.project)).toBe("no_lead");
    expect(handoffGaps(inp)).toEqual([]);
  });
  it("be nem töltött forrás = NINCS ADAT: sosem rendben és nem gyárt hiányt", () => {
    const inp = full({ quoteCount: null, acceptedCount: null, contactCount: null, contractDocCount: null, taskCount: null });
    const s = handoffSummary(inp);
    expect(s.unknown).toBe(5);
    expect(s.phase).toBe("unknown");
    expect(handoffGaps(inp)).toEqual([]);
    expect(handoffNext(s, "project_manager").title).toMatch(/nem tölthetők be/);
  });
  it("első feladat: 48 órán belül ellenőrizendő, utána hiány, átadási idő nélkül sosem hiány", () => {
    expect(state(full({ taskCount: 0, project: proj({ handoff_at: "2026-11-13T12:00:00Z" }) }), "tasks")).toBe("pending");
    expect(state(full({ taskCount: 0 }), "tasks")).toBe("missing");
    expect(state(full({ taskCount: 0, project: proj({ handoff_at: null }) }), "tasks")).toBe("pending");
  });
  it("szerződés és elfogadott ajánlat hiánya ellenőrizendő, soha nem jelöl jóváhagyást", () => {
    const s = handoffSummary(full({ contractDocCount: 0, acceptedCount: 0 }));
    expect(state(full({ contractDocCount: 0 }), "contract_doc")).toBe("pending");
    expect(state(full({ acceptedCount: 0 }), "accepted")).toBe("pending");
    expect(s.phase).toBe("check");
    expect(s.items.find((i) => i.key === "contract_doc")!.detail).toMatch(/e-aláírás a CRM-ben nincs/);
    expect(handoffItems(full()).find((i) => i.key === "contract_doc")!.detail).toMatch(/nem igazolja az aláírást/);
    expect(HANDOFF_NOT_IN_CRM.map((n) => n.key)).toEqual(["contract_approval", "tig", "materials"]);
  });
  it("Átadás / előkészítés állapotban átvételre vár (nem „rendben”)", () => {
    expect(handoffSummary(full({ project: proj({ status: "atadas" }) })).phase).toBe("pm_start");
  });
  it("rövid összefoglaló (<20 karakter) Sales-hiány", () => {
    const inp = full({ project: proj({ handoff_payload: { summary: "rövid", notes: "" } }) });
    expect(state(inp, "summary")).toBe("missing");
    expect(handoffSummary(inp).phase).toBe("sales_gap");
  });
});

describe("szerepkörös következő lépés", () => {
  const gaps = handoffSummary(full({ project: proj({ address: null }), contactCount: 0 }));
  it("Sales a saját hiányát kapja (kapcsolattartó), PM a sajátját (cím)", () => {
    expect(handoffNext(gaps, "sales")).toMatchObject({ mine: true, item: { key: "contact" } });
    expect(handoffNext(gaps, "project_manager")).toMatchObject({ mine: true, item: { key: "address" } });
  });
  it("saját hiány nélkül megmondja, kire vár — nem a néző feladata", () => {
    const onlyPm = handoffSummary(full({ project: proj({ address: null }) }));
    const n = handoffNext(onlyPm, "sales");
    expect(n).toMatchObject({ mine: false, waitingFor: "project_manager" });
    expect(n.detail).toMatch(/nem a te szerepköröd/);
  });
  it("Marketing / szerepkör nélkül nincs „saját” lépés", () => {
    expect(handoffNext(gaps, "marketing").mine).toBe(false);
    expect(handoffNext(gaps, null).mine).toBe(false);
  });
  it("rendben állapot nem állít ügyfél-elfogadást", () => {
    expect(handoffNext(handoffSummary(full()), "owner").detail).toMatch(/nem jelent ügyfél-elfogadást/);
  });
});

describe("egy szabályforrás: George jelzés = Átadás fül hiánylistája (deduplikáció)", () => {
  const base = (over: Partial<OrgInputs> = {}): OrgInputs => ({
    now: NOW, leads: [{ id: L1, status: "won", assigned_to: null, next_step_type: null, next_step_due_at: null, company_id: null, created_at: null }],
    projects: [], tasks: [], followups: [], sentQuotes: [], provenQuoteIds: [], projectQuoteIds: [], projectContacts: [],
    issues: [], findings: [], signals: [], notices: [], imports: [], documentErrors: [], documentsNeedReview: 0, people: {}, companies: {}, ...over,
  });
  it("azonos hiánylista, egy projekt = egy tétel, link az Átadás fülre", () => {
    const p = { ...proj({ address: null, deadline: null }), title: "TESZT", company_id: null, start_date: null, handoff_payload: { summary: "x" }, handoff_at: "2026-11-09T10:00:00Z" } as OrgInputs["projects"][number];
    const items = buildOrgSignals(base({ projects: [p] })).filter((i) => i.domain === "handoff");
    expect(items).toHaveLength(1);
    expect(items[0].gaps).toEqual(handoffGaps({ project: p, quoteCount: 0, acceptedCount: null, contactCount: 0, contractDocCount: null, taskCount: 0, now: NOW }));
    expect(items[0].link).toEqual({ to: `/projects/${P1}`, search: { tab: "handover" } });
    expect(items[0].nextAction).toMatch(/Átadás fülén/);
  });
  it("determinisztikus: ugyanarra a bemenetre ugyanaz a kimenet", () => {
    expect(handoffSummary(full({ contactCount: 0 }))).toEqual(handoffSummary(full({ contactCount: 0 })));
  });
  it("isOrgDomain csak ismert területet fogad (owner mélylink)", () => {
    expect(isOrgDomain("handoff")).toBe(true);
    expect(isOrgDomain("<script>")).toBe(false);
  });
});

describe("Megnyertük előnézet — a meglévő RPC/trigger viselkedése", () => {
  it("összefoglaló, forrás, ajánlat, kapcsolattartó automatikusan; PM-mezők később", () => {
    const rows = winHandoffPreview({ summary: SUMMARY, source: "web", contact_id: "x" }, 2);
    expect(Object.fromEntries(rows.map((r) => [r.key, r.state]))).toEqual({ summary: "auto", source: "auto", quotes: "auto", contact: "auto", followups: "auto", pm_fields: "later" });
  });
  it("hiányzó kapcsolattartó, ajánlat és rövid összefoglaló jelölve, nem ismert ajánlat ≠ van", () => {
    const rows = winHandoffPreview({ summary: "rövid", source: null, contact_id: null }, null);
    const st = Object.fromEntries(rows.map((r) => [r.key, r.state]));
    expect(st).toMatchObject({ summary: "missing", source: "missing", quotes: "missing", contact: "missing" });
    expect(rows.find((r) => r.key === "summary")!.detail).toMatch(/Rövid \(5 karakter\)/);
  });
});

describe("alapadat-pótlás és jogosultság", () => {
  const saved = { address: "TESZT utca 1.", deadline: "2026-12-31", project_manager_user_id: PM };
  it("csak a megváltozott mezők, sosem lead_id vagy státusz", () => {
    expect(projectBasicsPatch(saved, { address: "TESZT utca 1.", deadline: "2026-12-31" })).toEqual({});
    expect(projectBasicsPatch(saved, { address: "  TESZT   utca 2. ", deadline: "2026-12-31" })).toEqual({ address: "TESZT utca 2." });
    expect(projectBasicsPatch({ address: null, deadline: null }, { address: "", deadline: "2027-01-15" })).toEqual({ deadline: "2027-01-15" });
    const keys = Object.keys(projectBasicsPatch({}, { address: "a", deadline: "2027-01-01", pm: PM }));
    expect(keys.sort()).toEqual(["address", "deadline", "project_manager_user_id"]);
    expect(keys).not.toContain("lead_id");
    expect(keys).not.toContain("status");
  });
  it("hibás dátum nem kerül mentésbe; üres projektvezető nem töröl", () => {
    expect(projectBasicsPatch(saved, { address: "TESZT utca 1.", deadline: "31/12/2026" })).toEqual({});
    expect(projectBasicsPatch(saved, { address: "TESZT utca 1.", deadline: "2026-12-31", pm: "" })).toEqual({});
  });
  it("alapadat: Tulajdonos/PM; projektvezető-csere csak Tulajdonos; Sales és Marketing nem", () => {
    expect(handoffEditRights("owner")).toEqual({ basics: true, assignPm: true });
    expect(handoffEditRights("project_manager")).toEqual({ basics: true, assignPm: false });
    expect(handoffEditRights("sales")).toEqual({ basics: false, assignPm: false });
    expect(handoffEditRights("marketing")).toEqual({ basics: false, assignPm: false });
    expect(handoffEditRights(null)).toEqual({ basics: false, assignPm: false });
  });
  it("projekt adatlap: Marketing nem nyithatja meg, Sales/PM/Owner igen", () => {
    expect(canAccessRoute("marketing", "/projects")).toBe(false);
    for (const r of ["owner", "project_manager", "sales"] as const) expect(canAccessRoute(r, "/projects")).toBe(true);
  });
  it("pótlás helye: fülre vezet; alapadat és állapot az Átadás fülön", () => {
    const by = Object.fromEntries(handoffItems(full()).map((i) => [i.key, handoffFixTab(i)]));
    expect(by).toMatchObject({ pm: "handover", address: "handover", deadline: "handover", start: "handover", quote: "quotes", contact: "contacts", contract_doc: "docs", tasks: "tasks", summary: "notes", lead: null });
  });
});

describe("PM napi teendő és Owner jelzés az átadáshoz", () => {
  const empty = { tasks: [], docs: [], notes: [], attendanceProjects: [], attendanceEntries: [] };
  const pmProj = (o: Partial<PmProject> = {}): PmProject => ({ id: P1, title: "TESZT", status: "atadas", project_manager_user_id: PM, address: null, deadline: null, ...o });
  it("Átadás / előkészítés + hiányzó alapadat → „Sales-átadás átvétele” az Átadás fülre", () => {
    const n = pmNextAction(projectDay(pmProj(), empty, new Date(NOW)));
    expect(n).toMatchObject({ kind: "handoff_intake", tab: "handover" });
    expect(n.detail).toMatch(/helyszín címe, határidő, első feladat/);
    expect(PM_ACTION_ORDER.indexOf("handoff_intake")).toBeLessThan(PM_ACTION_ORDER.indexOf("handover_check"));
    expect(pmProjectSteps(projectDay(pmProj(), empty, new Date(NOW)))[3]).toMatchObject({ label: "Sales-átadás átvétele", state: "missing" });
  });
  it("kivitelezésben nincs átvételi teendő", () => {
    expect(pmNextAction(projectDay(pmProj({ status: "kivitelezes" }), empty, new Date(NOW))).kind).not.toBe("handoff_intake");
  });
  it("Owner: „atadas” állapot nem „Műszaki átadás”; projektvezető nélkül az Átadás fülre visz", () => {
    const [a] = ownerItems({ projects: [pmProj({ address: "x", deadline: "2027-01-01" })], tasks: [] }, new Date(NOW));
    expect(a.title).toMatch(/Sales-átadás átvétele/);
    expect(a.title).not.toMatch(/Műszaki átadás/);
    const [b] = ownerItems({ projects: [pmProj({ status: "kivitelezes", project_manager_user_id: null })], tasks: [] }, new Date(NOW));
    expect(b.link).toEqual({ to: `/projects/${P1}`, search: { tab: "handover" } });
  });
});

describe("biztonsági határ — csak olvasás, nincs párhuzamos írási út", () => {
  const src = (p: string) => readFileSync(p, "utf8");
  it("a szabálymodul nem importál adatklienst és nem ír", () => {
    const s = src("src/lib/handoff/sales-pm-handoff.ts");
    expect(s).not.toMatch(/supabase|fetch\(|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  });
  it("az átadási forrásolvasó csak SELECT, admin kliens és AI nélkül", () => {
    const s = src("src/hooks/use-project-handoff.ts");
    expect(s).toMatch(/\.select\(/);
    expect(s).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|client\.server|supabaseAdmin|ai-gateway|openai/i);
  });
  it("az alapadat-űrlap csak a meglévő projekt-mentési utat használja", () => {
    const s = src("src/components/handoff/project-basics-form.tsx");
    expect(s).toMatch(/useUpsert\("projects"\)/);
    expect(s).not.toMatch(/supabase\.|\.rpc\(|\.insert\(|\.delete\(/);
  });
  it("a Megnyertük ablak továbbra is kizárólag a sales_mark_won_with_project RPC-t hívja, és az Átadás fülre navigál", () => {
    const s = src("src/components/pipeline/create-project-dialog.tsx");
    expect(s.match(/\.rpc\(/g)).toHaveLength(1);
    expect(s).toMatch(/rpc\("sales_mark_won_with_project"/);
    expect(s).not.toMatch(/from\("projects"\)|from\("leads"\)/);
    expect(s).toMatch(/search: \{ tab: "handover" \}/);
    expect(s).toMatch(/setNotes\(""\)/);
  });
});
