import { describe, expect, it } from "vitest";
import { buildOrgSignals, normalizePagePath, signalMergeKey, summarizeOrgSignals, type OrgInputs } from "./org-signals";

const NOW = "2026-11-14T10:00:00.000Z";
const P1 = "aaaaaaaa-0000-4000-8000-000000000001";
const P2 = "aaaaaaaa-0000-4000-8000-000000000002";
const L1 = "bbbbbbbb-0000-4000-8000-000000000001";
const L2 = "bbbbbbbb-0000-4000-8000-000000000002";
const L3 = "bbbbbbbb-0000-4000-8000-000000000003";
const PM = "cccccccc-0000-4000-8000-000000000001";
const SALES = "cccccccc-0000-4000-8000-000000000002";

function base(over: Partial<OrgInputs> = {}): OrgInputs {
  return {
    now: NOW, leads: [], projects: [], tasks: [], followups: [], sentQuotes: [], provenQuoteIds: [], projectQuoteIds: [], projectContacts: [],
    issues: [], findings: [], signals: [], notices: [], imports: [], documentErrors: [], documentsNeedReview: 0, people: { [PM]: "TESZT PM", [SALES]: "TESZT Sales" }, companies: { "co-1": "TESZT Kft" }, ...over,
  };
}
const project = (o: Partial<OrgInputs["projects"][number]> = {}): OrgInputs["projects"][number] => ({
  id: P1, title: "TESZT tetőfelújítás", status: "atadas", lead_id: L1, company_id: "co-1", project_manager_user_id: PM,
  handoff_payload: { summary: "Teljes átadási összefoglaló a Sales részéről", notes: "" }, handoff_at: "2026-11-09T10:00:00Z",
  start_date: "2026-11-09", deadline: "2026-12-31", address: "TESZT utca 1.", ...o,
});
const complete = (o: Partial<OrgInputs> = {}) => base({ projects: [project()], tasks: [{ id: "t-1", title: "Felmérés", status: "todo", due_date: "2026-11-20T10:00:00Z", project_id: P1, assigned_user: null }], projectContacts: [{ project_id: P1 }], projectQuoteIds: [{ project_id: P1 }], leads: [{ id: L1, status: "won", assigned_to: SALES, next_step_type: null, next_step_due_at: null, company_id: "co-1", created_at: "2026-10-01T10:00:00Z" }], ...o });

describe("Sales→PM átadás", () => {
  it("teljes átadásnál nincs tétel", () => {
    expect(buildOrgSignals(complete())).toEqual([]);
  });
  it("a valós hiányokat egy projekt-tételben, PM-felelőssel sorolja fel", () => {
    const items = buildOrgSignals(base({ projects: [project({ address: null, deadline: null, handoff_payload: { summary: "ok" } })], leads: [{ id: L1, status: "won", assigned_to: SALES, next_step_type: null, next_step_due_at: null, company_id: "co-1", created_at: null }] }));
    expect(items).toHaveLength(1);
    const it0 = items[0];
    expect(it0.key).toBe(`handoff:${P1}`);
    expect(it0.role).toBe("project_manager");
    expect(it0.responsibleName).toBe("TESZT PM");
    expect(it0.evidence).toBe("fact");
    expect(it0.gaps).toEqual([
      "Az átadás óta (48 óránál régebben) nincs projektfeladat felvéve", "Hiányzik a helyszín címe", "Nincs határidő",
      "Nincs projekt-kapcsolattartó", "Nincs ajánlat a projekthez kötve", "Rövid vagy hiányzó Sales átadási összefoglaló (20 karakternél kevesebb)",
    ]);
    expect(it0.link).toEqual({ to: `/projects/${P1}`, search: { tab: "handover" } });
    expect(it0.sources.map((s) => s.table)).toEqual(["projects", "leads"]);
  });
  it("48 órán belüli átadásnál a feladathiány még nem jelzés", () => {
    const items = buildOrgSignals(complete({ tasks: [], projects: [project({ handoff_at: "2026-11-13T12:00:00Z" })] }));
    expect(items).toEqual([]);
  });
  it("projektvezető nélkül a Tulajdonos a felelős, figyelmeztetés szinten", () => {
    const [it0] = buildOrgSignals(complete({ projects: [project({ project_manager_user_id: null, handoff_payload: { summary: "Teljes átadási összefoglaló a Sales részéről" } })] }));
    expect(it0.role).toBe("owner");
    expect(it0.severity).toBe("warning");
    expect(it0.gaps[0]).toBe("Nincs projektvezető kijelölve");
  });
  it("a handoff_payload projektvezetője is elfogadott", () => {
    expect(buildOrgSignals(complete({ projects: [project({ project_manager_user_id: null, handoff_payload: { summary: "Teljes átadási összefoglaló a Sales részéről", project_manager_user_id: PM } })] }))).toEqual([]);
  });
  it("lezárt / felfüggesztett projekt nem kap átadási jelzést", () => {
    expect(buildOrgSignals(base({ projects: [project({ status: "lezart", address: null })] }))).toEqual([]);
  });
  it("megnyert ügy látható projekt nélkül súlyos adatintegritási tény", () => {
    const items = buildOrgSignals(base({ leads: [{ id: L2, status: "won", assigned_to: SALES, next_step_type: null, next_step_due_at: null, company_id: null, created_at: null }] }));
    expect(items.map((i) => [i.key, i.severity, i.role])).toEqual([[`handoff_missing:${L2}`, "critical", "owner"]]);
  });
});

describe("Sales-ügyek és projektteendők", () => {
  it("lejárt lépés + lejárt utánkövetés + korábbi automatikus jelzés EGY tétel", () => {
    const items = buildOrgSignals(base({
      leads: [{ id: L1, status: "follow_up", assigned_to: SALES, next_step_type: "phone", next_step_due_at: "2026-11-10T08:00:00Z", company_id: "co-1", created_at: "2026-10-01T00:00:00Z" }],
      followups: [{ id: "f-1", lead_id: L1, project_id: null, due_date: "2026-11-12T08:00:00Z", followup_type: "call", assigned_to: SALES }],
      signals: [{ id: "s-1", signal_key: `sales_overdue:${L1}:2026-11-10`, domain: "sales", agent: "timothy", severity: "warning", title: "Lejárt következő lépés", source_table: "leads", source_id: L1, occurrences: 4, first_seen_at: "2026-11-10T09:07:00Z", last_seen_at: NOW, review_status: "pending", issue_id: null }],
    }));
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe(`lead:${L1}`);
    expect(items[0].sources.map((s) => s.table)).toEqual(["leads", "followups", "ai_review_signals"]);
    expect(items[0].occurrences).toBe(4);
    expect(items[0].role).toBe("sales");
    expect(items[0].responsibleName).toBe("TESZT Sales");
  });
  it("felelős nélküli nyitott ügy a Tulajdonosé (csak ő adhat felelőst)", () => {
    const [it0] = buildOrgSignals(base({ leads: [{ id: L3, status: "new", assigned_to: null, next_step_type: "call", next_step_due_at: "2026-11-20T08:00:00Z", company_id: null, created_at: "2026-11-01T00:00:00Z" }] }));
    expect(it0.role).toBe("owner");
    expect(it0.gaps).toEqual(["Nincs Sales-felelős (csak a Tulajdonos látja az ügyet)"]);
    expect(it0.nextAction).toContain("csak Tulajdonos adhat át felelőst");
  });
  it("24 óránál fiatalabb ügynél a hiányzó következő lépés még nem jelzés", () => {
    expect(buildOrgSignals(base({ leads: [{ id: L3, status: "new", assigned_to: SALES, next_step_type: null, next_step_due_at: null, company_id: null, created_at: "2026-11-14T00:00:00Z" }] }))).toEqual([]);
  });
  it("projekt lejárt feladatai és lejárt határideje egy tételbe kerülnek", () => {
    const items = buildOrgSignals(complete({
      projects: [project({ deadline: "2026-11-01" })],
      tasks: [
        { id: "t-1", title: "A", status: "todo", due_date: "2026-11-11T10:00:00Z", project_id: P1, assigned_user: null },
        { id: "t-2", title: "B", status: "in_progress", due_date: "2026-11-12T10:00:00Z", project_id: P1, assigned_user: null },
        { id: "t-3", title: "Kész", status: "done", due_date: "2026-11-01T10:00:00Z", project_id: P1, assigned_user: null },
      ],
    }));
    expect(items.map((i) => i.key)).toEqual([`project_due:${P1}`]);
    expect(items[0].gaps).toEqual(["A projekt határideje lejárt (2026-11-01)", "2 lejárt, nyitott feladat"]);
    expect(items[0].link).toEqual({ to: `/projects/${P1}`, search: { tab: "tasks" } });
  });
});

describe("Bizonyíték nélküli állapot", () => {
  const q = { id: "q-1", status: "sent", lead_id: L1, project_id: null, title: "TESZT ajánlat" };
  it("küldési napló nélküli „kiküldött” ajánlat súlyos tény, a Sales-felelősnél", () => {
    const items = buildOrgSignals(base({ sentQuotes: [q], leads: [{ id: L1, status: "quote_sent", assigned_to: SALES, next_step_type: "call", next_step_due_at: "2026-11-20T00:00:00Z", company_id: null, created_at: null }] }));
    expect(items[0].key).toBe("quote_unproven:q-1");
    expect(items[0].severity).toBe("critical");
    expect(items[0].role).toBe("sales");
    expect(items[0].detail).toContain("nem bizonyítja, hogy nem ment ki");
  });
  it("igazolt küldésnél nincs jelzés", () => {
    expect(buildOrgSignals(base({ sentQuotes: [q], provenQuoteIds: ["q-1"] }))).toEqual([]);
  });
});

describe("Dolgozói jelzések: panasz ≠ javítandó hiba ≠ AI-feltételezés", () => {
  const issue = (id: string, o: Partial<OrgInputs["issues"][number]> = {}): OrgInputs["issues"][number] => ({
    id, category: "ux", status: "new", page_path: `/quotes/${P1}`, reporter_role: "sales", created_at: `2026-11-1${id.slice(-1)}T10:00:00Z`, updated_at: null, technical_code: null, ai_analyzed_at: null, reporter_verdict: null, ...o,
  });
  it("azonos képernyőre (eltérő rekord-azonosítóval) érkező panaszok egy ismétlődő tételben", () => {
    const items = buildOrgSignals(base({ issues: [issue("i-1"), issue("i-2", { page_path: `/quotes/${P2}?tab=items`, reporter_role: "owner" })] }));
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("complaint:/quotes/:id:ux");
    expect(items[0].title).toBe("Ismétlődő UX-panasz: /quotes/:id");
    expect(items[0].evidence).toBe("complaint");
    expect(items[0].status).toBe("verify");
    expect(items[0].severity).toBe("warning");
    expect(items[0].occurrences).toBe(2);
    expect(items[0].link).toEqual({ to: "/help", search: { issue: "i-2" } });
  });
  it("tulajdonos által javításra váróként jelölt bejelentés = javítandó hiba, nyitott", () => {
    const [it0] = buildOrgSignals(base({ issues: [issue("i-1", { category: "bug", status: "awaiting_fix" })] }));
    expect(it0.evidence).toBe("confirmed_bug");
    expect(it0.status).toBe("open");
  });
  it("AI-vizsgálat forrásszáma megjegyzés, de nem tesz bizonyított hibává", () => {
    const [it0] = buildOrgSignals(base({ issues: [issue("i-1", { ai_analyzed_at: NOW, status: "investigating" })], findings: [{ issue_id: "i-1", verified_source_count: 3, unverified_claim_count: 1 }] }));
    expect(it0.evidence).toBe("complaint");
    expect(it0.notes).toEqual(["George-vizsgálat 3 ellenőrzött forrással — AI-eredmény, önmagában nem bizonyíték.", "1 forrás nélküli AI-állítás (feltételezés)."]);
  });
  it("lezárt bejelentés lezárt állapotú; „nem oldódott meg” visszajelzés figyelmeztetés", () => {
    expect(buildOrgSignals(base({ issues: [issue("i-1", { status: "closed", reporter_verdict: "resolved" })] }))[0].status).toBe("closed");
    const [re] = buildOrgSignals(base({ issues: [issue("i-1", { status: "investigating", reporter_verdict: "not_resolved" })] }));
    expect(re.severity).toBe("warning");
    expect(re.notes).toContain("A bejelentő szerint a javítás nem oldotta meg.");
  });
  it("automatikus AI-hibajegy forrás nélkül AI-feltételezés, külön a dolgozói panaszoktól", () => {
    const items = buildOrgSignals(base({ issues: [issue("i-1"), issue("i-3", { technical_code: "AI_REVIEW", page_path: "/pipeline" })] }));
    expect(items.map((i) => [i.key, i.evidence])).toEqual([["complaint:/quotes/:id:ux", "complaint"], ["ai_issue:i-3", "assumption"]]);
  });
  it("a bejelentéshez tartozó értesítés és automatikus jelzés a panasz-tételbe olvad", () => {
    const items = buildOrgSignals(base({
      issues: [issue("i-1")],
      notices: [{ id: "n-1", title: "Új bejelentés", severity: "warning", requires_decision: true, link_path: "/help", source_table: "issue_reports", source_id: "i-1", last_occurred_at: NOW, occurrences: 1 }],
      signals: [{ id: "s-1", signal_key: "issue_unreviewed:i-1", domain: "feedback", agent: "george", severity: "warning", title: "Bejelentés vizsgálat nélkül", source_table: "issue_reports", source_id: "i-1", occurrences: 2, first_seen_at: NOW, last_seen_at: NOW, review_status: "pending", issue_id: null }],
    }));
    expect(items).toHaveLength(1);
    expect(items[0].sources.map((s) => s.table)).toEqual(["issue_reports", "crm_notifications", "ai_review_signals"]);
  });
});

describe("Automatikus jelzések, értesítések, import", () => {
  const sig = (o: Partial<OrgInputs["signals"][number]>): OrgInputs["signals"][number] => ({ id: "s-9", signal_key: "gmail_sync_errors:2026-11-14", domain: "system", agent: "george", severity: "warning", title: "Gmail-szinkron hibák", source_table: null, source_id: null, occurrences: 1, first_seen_at: NOW, last_seen_at: NOW, review_status: "pending", issue_id: null, ...o });
  it("nem leképezhető jelzés önálló, ellenőrizendő gyanú", () => {
    const [it0] = buildOrgSignals(base({ signals: [sig({})] }));
    expect([it0.key, it0.evidence, it0.status]).toEqual(["signal:gmail_sync_errors:2026-11-14", "signal", "verify"]);
  });
  it("leképezhető, de élőben már nem fennálló jelzés: megszűnt, ellenőrizendő", () => {
    const [it0] = buildOrgSignals(base({ signals: [sig({ signal_key: `project_no_pm:${P1}`, source_id: P1, domain: "projects" })] }));
    expect(it0.status).toBe("verify");
    expect(it0.severity).toBe("info");
    expect(it0.detail).toContain("már nem áll fenn");
  });
  it("megszűnt jelzés lezárt", () => {
    expect(buildOrgSignals(base({ signals: [sig({ review_status: "resolved" })] }))[0].status).toBe("closed");
  });
  it("forrás nélküli döntési értesítés önálló Tulajdonos-tétel", () => {
    const [it0] = buildOrgSignals(base({ notices: [{ id: "n-2", title: "Döntés kell", severity: "critical", requires_decision: true, link_path: "/notifications", source_table: null, source_id: null, last_occurred_at: NOW, occurrences: 1 }] }));
    expect([it0.domain, it0.severity, it0.role]).toEqual(["decision", "critical", "owner"]);
  });
  it("import-ellenőrzési tételek típusonként összesítve, kézi döntésre", () => {
    const items = buildOrgSignals(base({ imports: [{ kind: "invalid_email", count: 21 }, { kind: "company", count: 14 }, { kind: "project_candidate", count: 11 }] }));
    expect(items.map((i) => i.title)).toEqual(["14 bizonytalan cégegyezés vár kézi döntésre", "21 hibás e-mail-cím vár kézi döntésre", "11 importált projektjelölt vár kézi döntésre"]);
    expect(items.every((i) => i.nextAction.includes("automatikusan ne vonj össze"))).toBe(true);
  });
});

describe("Dokumentumfeldolgozás", () => {
  it("feldolgozási hiba tény-tétel, a hozzá tartozó automatikus jelzés beleolvad; ellenőrzendők összesítve", () => {
    const items = buildOrgSignals(base({
      documentErrors: [{ id: "d-1", title: "TESZT.pdf", processing_status: "error", error_code: "parse_failed", source_table: "project_documents" }],
      documentsNeedReview: 28,
      signals: [
        { id: "s-d", signal_key: "document_error:d-1", domain: "documents", agent: "george", severity: "warning", title: "Dokumentumfeldolgozási hiba", source_table: "knowledge_documents", source_id: "d-1", occurrences: 2, first_seen_at: NOW, last_seen_at: NOW, review_status: "pending", issue_id: null },
        { id: "s-r", signal_key: "document_needs_review:d-9", domain: "documents", agent: "george", severity: "info", title: "Ellenőrzést igényel", source_table: "knowledge_documents", source_id: "d-9", occurrences: 1, first_seen_at: NOW, last_seen_at: NOW, review_status: "not_needed", issue_id: null },
      ],
    }));
    expect(items.map((i) => [i.key, i.status, i.sources.length])).toEqual([["document:d-1", "open", 2], ["documents:needs_review", "verify", 2]]);
    expect(items[1].title).toBe("28 dokumentum ellenőrzést igényel");
  });
});

describe("Idempotencia, sorrend, összesítés", () => {
  const rich = () => base({
    projects: [project({ address: null }), project({ id: P2, lead_id: null, project_manager_user_id: null, title: "B" })],
    leads: [
      { id: L2, status: "new", assigned_to: null, next_step_type: "call", next_step_due_at: "2026-11-01T00:00:00Z", company_id: null, created_at: "2026-10-01T00:00:00Z" },
      { id: L1, status: "won", assigned_to: SALES, next_step_type: null, next_step_due_at: null, company_id: "co-1", created_at: null },
    ],
    sentQuotes: [{ id: "q-1", status: "sent", lead_id: null, project_id: null, title: null }],
    issues: [{ id: "i-1", category: "bug", status: "closed", page_path: "/x", reporter_role: "pm", created_at: "2026-11-01T00:00:00Z", updated_at: null, technical_code: null, ai_analyzed_at: null, reporter_verdict: null }],
  });
  it("azonos bemenet → azonos kimenet; a bemeneti sorrend nem számít", () => {
    const a = buildOrgSignals(rich());
    const b = buildOrgSignals(rich());
    expect(b).toEqual(a);
    const shuffled = rich();
    shuffled.projects.reverse(); shuffled.leads.reverse();
    expect(buildOrgSignals(shuffled)).toEqual(a);
    expect(new Set(a.map((i) => i.key)).size).toBe(a.length);
  });
  it("nyitott → ellenőrizendő → lezárt; azon belül súlyos elöl", () => {
    const items = buildOrgSignals(rich());
    expect(items[0].key).toBe("quote_unproven:q-1");
    expect(items.at(-1)!.status).toBe("closed");
    const ranks = items.map((i) => ({ open: 0, verify: 1, closed: 2 })[i.status]);
    expect([...ranks].sort((x, y) => x - y)).toEqual(ranks);
  });
  it("összesítés", () => {
    const s = summarizeOrgSignals(buildOrgSignals(rich()));
    expect(s.byStatus).toEqual({ open: 4, verify: 0, closed: 1 });
    expect(s.critical).toBe(1);
    expect(s.byDomain.handoff).toBe(2);
  });
});

describe("segédfüggvények", () => {
  it("normalizePagePath", () => {
    expect(normalizePagePath(`/projects/${P1}?tab=tasks`)).toBe("/projects/:id");
    expect(normalizePagePath("/help/")).toBe("/help");
    expect(normalizePagePath("")).toBe("/");
  });
  it("signalMergeKey", () => {
    const g = new Map([["i-1", "complaint:/x:bug"]]);
    expect(signalMergeKey({ signal_key: `task_overdue:t:2026`, source_id: P1, issue_id: null }, g)).toBe(`project_due:${P1}`);
    expect(signalMergeKey({ signal_key: "issue_reopened:i-1:2026", source_id: "i-1", issue_id: null }, g)).toBe("complaint:/x:bug");
    expect(signalMergeKey({ signal_key: "ai_credit:2026-11-14", source_id: null, issue_id: null }, g)).toBeNull();
  });
});
