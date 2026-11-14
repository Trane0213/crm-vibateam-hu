import { describe, expect, it } from "vitest";
import {
  attendanceProjectFor, attendanceProjectFromSearch, budapestYmd, classifyTask, docSummary, handoverReadiness,
  isBossQuickId, pmDayStages, pmFocus, pmNextAction, pmProjectRows, pmProjectSteps, pmTabFromSearch, projectDay,
  projectManagerOf, taskDefaultsFromUrl, workersOn,
  type PmAttendanceEntry, type PmAttendanceProject, type PmDoc, type PmNote, type PmProject, type PmTask,
} from "./pm-day-flow";
import { attendanceMonthStart, attendanceToday } from "@/lib/attendance/attendance-dates";
import { QUICK_ACTIONS } from "@/components/ai/chat-shared";
import { HELP_GUIDES } from "@/lib/help-guide";
import { canAccessRoute } from "@/lib/permissions";

// 2026-11-14 10:00 Budapest (CET, UTC+1)
const NOW = new Date("2026-11-14T09:00:00Z");
const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const proj = (over: Partial<PmProject> = {}): PmProject => ({ id: P1, title: "TESZT Árnyas utca", status: "kivitelezes", project_manager_user_id: ME, ...over });
const task = (over: Partial<PmTask> = {}): PmTask => ({ id: crypto.randomUUID(), title: "TESZT feladat", status: "open", due_date: null, project_id: P1, assigned_user: "prof-1", ...over });
const empty = { tasks: [] as PmTask[], docs: [] as PmDoc[], notes: [] as PmNote[], attendanceProjects: [] as PmAttendanceProject[], attendanceEntries: [] as PmAttendanceEntry[] };

describe("Budapest nap", () => {
  it("éjfél után a budapesti napot adja, nem az UTC-t", () => {
    // 2026-11-13 23:30 UTC = 2026-11-14 00:30 Budapest
    expect(budapestYmd(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-14");
    expect(attendanceToday(new Date("2026-11-13T23:30:00Z"))).toBe("2026-11-14");
  });
  it("hónap eleje a budapesti hónap 1. napja", () => {
    expect(attendanceMonthStart(new Date("2026-11-30T23:30:00Z"))).toBe("2026-12-01");
  });
});

describe("projektvezető és feladat-besorolás", () => {
  it("projektvezető az oszlopból, régi sornál az átadási adatból", () => {
    expect(projectManagerOf(proj())).toBe(ME);
    expect(projectManagerOf(proj({ project_manager_user_id: null, handoff_payload: { project_manager_user_id: OTHER } }))).toBe(OTHER);
    expect(projectManagerOf(proj({ project_manager_user_id: null, handoff_payload: null }))).toBeNull();
  });
  it("lejárt / mai / akadályozott / 7 napon belüli / felelős nélküli", () => {
    expect(classifyTask(task({ due_date: "2026-11-14T08:00:00Z" }), NOW).overdue).toBe(true);
    const later = classifyTask(task({ due_date: "2026-11-14T16:00:00Z" }), NOW);
    expect(later.today).toBe(true);
    expect(later.overdue).toBe(false);
    expect(classifyTask(task({ due_date: "2026-11-18T08:00:00Z" }), NOW).upcoming7).toBe(true);
    expect(classifyTask(task({ status: "blocked" }), NOW).blocked).toBe(true);
    expect(classifyTask(task({ assigned_user: null }), NOW).noOwner).toBe(true);
  });
  it("kész feladat soha nem lejárt", () => {
    const f = classifyTask(task({ status: "done", due_date: "2026-11-01T08:00:00Z" }), NOW);
    expect(f.overdue || f.today || f.blocked).toBe(false);
  });
});

describe("dokumentumok és jelenlét", () => {
  it("kategóriánként számol, ismeretlen kategória = egyéb", () => {
    const s = docSummary([
      { id: "1", project_id: P1, document_type: "photo" },
      { id: "2", project_id: P1, document_type: "photo" },
      { id: "3", project_id: P1, document_type: "technical" },
      { id: "4", project_id: P1, document_type: "valami" },
    ]);
    expect(s).toMatchObject({ total: 4, photo: 2, technical: 1, other: 1 });
  });
  it("jelenléti projekt csak pontos névegyezéssel, több egyezésnél nincs", () => {
    const list = [{ id: "a1", name: "TESZT  árnyas utca" }, { id: "a2", name: "Másik" }];
    expect(attendanceProjectFor({ title: "TESZT Árnyas utca" }, list)?.id).toBe("a1");
    expect(attendanceProjectFor({ title: "TESZT Árnyas" }, list)).toBeNull();
    expect(attendanceProjectFor({ title: "Másik" }, [...list, { id: "a3", name: "másik" }])).toBeNull();
    expect(attendanceProjectFor({ title: "" }, list)).toBeNull();
  });
  it("mai létszám egyedi dolgozó szerint, más nap nem számít", () => {
    const e = [
      { id: "1", project_id: "a1", worker_id: "w1", work_date: "2026-11-14" },
      { id: "2", project_id: "a1", worker_id: "w1", work_date: "2026-11-14" },
      { id: "3", project_id: "a1", worker_id: "w2", work_date: "2026-11-14" },
      { id: "4", project_id: "a1", worker_id: "w3", work_date: "2026-11-13" },
    ];
    expect(workersOn(e, "a1", "2026-11-14")).toBe(2);
    expect(workersOn(e, null, "2026-11-14")).toBe(0);
  });
});

describe("következő teendő sorrendje", () => {
  const next = (p: PmProject, ctx: Partial<typeof empty> = {}) => pmNextAction(projectDay(p, { ...empty, ...ctx }, NOW));
  it("lejárt feladat előzi az akadályt és a mai feladatot", () => {
    const n = next(proj(), { tasks: [task({ status: "blocked" }), task({ due_date: "2026-11-14T16:00:00Z" }), task({ title: "Régi", due_date: "2026-11-10T08:00:00Z" })] });
    expect(n.kind).toBe("overdue_tasks");
    expect(n.tab).toBe("tasks");
    expect(n.detail).toContain("Régi");
  });
  it("akadály → mai feladat → lejárt határidő → átadás → napi jegyzet → dokumentum", () => {
    expect(next(proj(), { tasks: [task({ status: "blocked" })] }).kind).toBe("blocked_tasks");
    expect(next(proj(), { tasks: [task({ due_date: "2026-11-14T16:00:00Z" })] }).kind).toBe("today_tasks");
    expect(next(proj({ deadline: "2026-11-10" })).kind).toBe("deadline_passed");
    expect(next(proj({ status: "muszaki_atadas" })).tab).toBe("handover");
    expect(next(proj()).kind).toBe("daily_note");
    const noted = { notes: [{ id: "n", project_id: P1, created_at: "2026-11-14T07:00:00Z" }] };
    expect(next(proj(), noted).kind).toBe("no_docs");
    expect(next(proj(), { ...noted, docs: [{ id: "d", project_id: P1, document_type: "photo" }] }).kind).toBe("none");
  });
  it("tegnapi jegyzet nem mai napi jegyzet", () => {
    const d = projectDay(proj(), { ...empty, notes: [{ id: "n", project_id: P1, created_at: "2026-11-13T22:30:00Z" }] }, NOW);
    // 22:30 UTC = 23:30 Budapest, 11-13 → nem mai
    expect(d.noteToday).toBe(false);
  });
  it("figyelmeztet: felelős nélküli feladat, közeli határidő, nincs összekötött jelenlét", () => {
    const n = next(proj({ deadline: "2026-11-17" }), { tasks: [task({ assigned_user: null, due_date: "2026-11-20T08:00:00Z" })] });
    expect(n.warnings.join(" ")).toContain("nincs felelőse");
    expect(n.warnings.join(" ")).toContain("3 nap múlva");
    expect(n.warnings.join(" ")).toContain("jelenléti naplóban nincs");
  });
});

describe("PM Ma projektlista", () => {
  const projects = [
    proj({ id: P1, title: "TESZT A", status: "kivitelezes" }),
    proj({ id: P2, title: "TESZT B", status: "elokeszites", project_manager_user_id: OTHER }),
    proj({ id: crypto.randomUUID(), title: "TESZT lezárt", status: "lezart" }),
  ];
  const ctx = { ...empty, tasks: [task({ project_id: P2, due_date: "2026-11-01T08:00:00Z" })] };
  it("lezárt projekt nem jelenik meg; saját szűrés a projektvezetőre", () => {
    expect(pmProjectRows(projects, ctx, { uid: ME, onlyMine: false, now: NOW }).map((r) => r.project.title)).toEqual(["TESZT B", "TESZT A"]);
    expect(pmProjectRows(projects, ctx, { uid: ME, onlyMine: true, now: NOW }).map((r) => r.project.title)).toEqual(["TESZT A"]);
  });
  it("fókusz: betöltés, hiba, üres, nyugodt", () => {
    expect(pmFocus([], { ready: false, error: false }).state).toBe("loading");
    expect(pmFocus([], { ready: true, error: true }).state).toBe("error");
    expect(pmFocus([], { ready: true, error: false }).state).toBe("empty");
    const calm = pmProjectRows([proj({ status: "elokeszites" })], { ...empty, docs: [{ id: "d", project_id: P1, document_type: "plan" }] }, { uid: ME, onlyMine: true, now: NOW });
    expect(pmFocus(calm, { ready: true, error: false }).state).toBe("calm");
  });
  it("munkafolyamat-sáv: hat lépés, betöltés előtt „—”", () => {
    const rows = pmProjectRows(projects, ctx, { uid: ME, onlyMine: false, now: NOW });
    const st = pmDayStages(rows, 4, true);
    expect(st.map((s) => s.key)).toEqual(["projects", "tasks", "blocked", "attendance", "note", "handover"]);
    expect(st.find((s) => s.key === "tasks")!.count).toBe(1);
    expect(st.find((s) => s.key === "attendance")!.count).toBe(4);
    expect(st.find((s) => s.key === "note")!.count).toBe(1);
    expect(pmDayStages(rows, null, false).every((s) => s.count === "—")).toBe(true);
  });
});

describe("projektadatlap lépéssáv és átadás", () => {
  it("lépéssáv négy lépés, lejárt feladatnál a Feladatok hiányzik", () => {
    const d = projectDay(proj(), { ...empty, tasks: [task({ due_date: "2026-11-01T08:00:00Z" })] }, NOW);
    const s = pmProjectSteps(d);
    expect(s.map((x) => x.tab)).toEqual(["tasks", "overview", "docs", "handover"]);
    expect(s[0].state).toBe("missing");
    expect(s[2].state).toBe("missing");
  });
  it("átadás: nyitott/akadályozott feladat kötelező hiány, fotó csak ajánlott", () => {
    const open = handoverReadiness(projectDay(proj(), { ...empty, tasks: [task({ status: "blocked" })] }, NOW), { hasContact: false });
    expect(open.ready).toBe(false);
    expect(open.missingBlocking).toBe(2);
    const clean = handoverReadiness(projectDay(proj({ status: "muszaki_atadas" }), empty, NOW), { hasContact: true });
    expect(clean.ready).toBe(true);
    expect(clean.checks.find((c) => c.key === "photo")!.ok).toBe(false);
    expect(clean.checks.find((c) => c.key === "photo")!.blocking).toBe(false);
  });
});

describe("mélylinkek és előtöltés", () => {
  it("csak ismert fül választható", () => {
    expect(pmTabFromSearch("handover")).toBe("handover");
    expect(pmTabFromSearch("admin")).toBeUndefined();
  });
  it("új feladat: csak érvényes projektazonosító töltődik elő", () => {
    expect(taskDefaultsFromUrl(new URLSearchParams(`project_id=${P1}`))).toEqual({ project_id: P1, status: "open", priority: "normal" });
    expect(taskDefaultsFromUrl(new URLSearchParams("project_id=1;drop"))).toBeNull();
    expect(taskDefaultsFromUrl(new URLSearchParams(""))).toBeNull();
  });
  it("jelenlét előválasztás csak UUID", () => {
    expect(attendanceProjectFromSearch(P1)).toBe(P1);
    expect(attendanceProjectFromSearch("x")).toBeUndefined();
  });
});

describe("Boss gyorskérdések a valós eszközökre", () => {
  it("minden gyorsgomb létező kérdés, és nem kér dokumentum-/jelenlét-eszközt", () => {
    const ids = QUICK_ACTIONS.pm.map((q) => q.id);
    for (const id of ["daily-pm", "today-tasks", "blocked", "deadlines", "risks"]) {
      expect(ids).toContain(id);
      expect(isBossQuickId(id)).toBe(true);
    }
    expect(ids).not.toContain("missing-docs");
    for (const q of QUICK_ACTIONS.pm) {
      expect(q.prompt).not.toMatch(/crm_list_documents|crm_read_document|attendance/);
      expect(q.prompt).toMatch(/crm_list_(projects|tasks)/);
    }
    expect(QUICK_ACTIONS.pm.find((q) => q.id === "daily-pm")!.prompt).toContain("nem látsz");
  });
});

describe("PM súgó", () => {
  it("minden PM súgólépés engedélyezett oldalra visz, és említi a TIG hiányát", () => {
    for (const step of HELP_GUIDES.project_manager) expect(canAccessRoute("project_manager", step.path)).toBe(true);
    expect(HELP_GUIDES.project_manager.some((s) => /TIG/.test(s.title) && /nem készül/.test(s.effect))).toBe(true);
  });
});
