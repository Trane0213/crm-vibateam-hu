/**
 * Projektvezetői (PM) napi munkafolyamat — kizárólag megjelenítési modell.
 *
 * A meglévő `projects`, `tasks`, `project_documents`, `project_notes` és a
 * külön jelenléti napló (`attendance_*`) mentett soraiból számolja, hol tart
 * egy projekt és mi a következő értelmes teendő. Nem ír adatot, nem vált
 * állapotot, nem bővít jogosultságot. A TIG/teljesítésigazolás, anyagigény és
 * a CRM-projekt ↔ jelenléti projekt mentett kapcsolata NEM létezik: ezeket a
 * modell nem szimulálja, csak a meglévő adatból ellenőrzőlistát ad.
 */
import { ACTIVE_PROJECT_STATUSES, PROJECT_STATUS_LABEL } from "@/lib/viba-constants";

const TZ = "Europe/Budapest";

// ---------------------------------------------------------------------------
// Típusok (a lekérdezett oszlopok szűk részhalmaza)
// ---------------------------------------------------------------------------
export type PmProject = {
  id: string;
  title: string | null;
  status: string | null;
  company_id?: string | null;
  address?: string | null;
  deadline?: string | null;
  start_date?: string | null;
  project_manager_user_id?: string | null;
  handoff_payload?: unknown;
};
export type PmTask = {
  id: string;
  title: string | null;
  status: string | null;
  priority?: string | null;
  due_date: string | null;
  project_id: string | null;
  assigned_user: string | null;
};
export type PmDoc = { id: string; project_id: string | null; document_type: string | null };
export type PmNote = { id: string; project_id: string | null; created_at: string | null };
export type PmAttendanceProject = { id: string; name: string; is_active?: boolean | null };
export type PmAttendanceEntry = { id: string; project_id: string; worker_id: string; work_date: string };

/** Projektadatlap fülei — mélylinkhez (?tab=) és a „következő teendő” gombhoz. */
export const PM_TABS = [
  "overview", "tasks", "docs", "handover", "contacts", "quotes", "followups",
  "emails", "calls", "meetings", "notes", "timeline",
] as const;
export type PmTab = (typeof PM_TABS)[number];
export function pmTabFromSearch(v: unknown): PmTab | undefined {
  return typeof v === "string" && (PM_TABS as readonly string[]).includes(v) ? (v as PmTab) : undefined;
}

// ---------------------------------------------------------------------------
// Alapfüggvények
// ---------------------------------------------------------------------------
/** Budapesti naptári nap YYYY-MM-DD formában (nem a böngésző/UTC napja). */
export function budapestYmd(at: Date | string = new Date()): string {
  const d = typeof at === "string" ? new Date(at) : at;
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Kijelölt projektvezető: a projekt oszlopa, régi soroknál az átadási adat. */
export function projectManagerOf(p: PmProject): string | null {
  if (p.project_manager_user_id) return p.project_manager_user_id;
  const payload = (p.handoff_payload ?? null) as Record<string, unknown> | null;
  const v = payload && typeof payload === "object" ? payload.project_manager_user_id : null;
  return typeof v === "string" && v ? v : null;
}

export function isActiveProject(p: PmProject): boolean {
  return (ACTIVE_PROJECT_STATUSES as string[]).includes(p.status ?? "");
}

const CLOSED_TASK = new Set(["done", "completed", "cancelled"]);
export function isOpenTask(t: Pick<PmTask, "status">): boolean {
  return !CLOSED_TASK.has(t.status ?? "");
}

export type TaskFlags = { overdue: boolean; today: boolean; blocked: boolean; upcoming7: boolean; noDue: boolean; noOwner: boolean };
/** Nyitott feladat besorolása. Lejárt = határidő már elmúlt; mai = ma, még előtte. */
export function classifyTask(t: PmTask, now: Date = new Date()): TaskFlags {
  const open = isOpenTask(t);
  const due = t.due_date ? new Date(t.due_date) : null;
  const valid = !!due && !Number.isNaN(due.getTime());
  const overdue = open && valid && due!.getTime() < now.getTime();
  const today = open && valid && !overdue && budapestYmd(due!) === budapestYmd(now);
  const upcoming7 = open && valid && !overdue && !today && due!.getTime() - now.getTime() <= 7 * 86_400_000;
  return {
    overdue, today, upcoming7,
    blocked: open && t.status === "blocked",
    noDue: open && !valid,
    noOwner: open && !t.assigned_user,
  };
}

const byDue = (a: PmTask, b: PmTask) =>
  (a.due_date ? new Date(a.due_date).getTime() : Infinity) - (b.due_date ? new Date(b.due_date).getTime() : Infinity);

export type DocSummary = { total: number; photo: number; plan: number; technical: number; contract: number; quote: number; other: number };
export function docSummary(docs: PmDoc[]): DocSummary {
  const s: DocSummary = { total: 0, photo: 0, plan: 0, technical: 0, contract: 0, quote: 0, other: 0 };
  for (const d of docs) {
    s.total++;
    const c = String(d.document_type ?? "other").toLowerCase();
    if (c === "photo" || c === "plan" || c === "technical" || c === "contract" || c === "quote") s[c]++;
    else s.other++;
  }
  return s;
}

/** Név normalizálás a jelenléti projekt egyezéshez (azonos a jelenléti egyediségi szabállyal: kisbetű, szóköz). */
export const normalizeProjectName = (s: string | null | undefined) =>
  String(s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A CRM-projekt és a jelenléti napló projektje között NINCS mentett kapcsolat.
 * Csak pontos (kis/nagybetű- és szóközfüggetlen) névegyezést mutatunk, jelölve,
 * hogy név alapján. Több egyezés vagy üres név → nincs egyezés (nem találgatunk).
 */
export function attendanceProjectFor(p: Pick<PmProject, "title">, list: PmAttendanceProject[]): PmAttendanceProject | null {
  const key = normalizeProjectName(p.title);
  if (!key) return null;
  const hits = list.filter((a) => normalizeProjectName(a.name) === key);
  return hits.length === 1 ? hits[0] : null;
}

/** Egy jelenléti projekt mai rögzített dolgozói (egyedi dolgozó szerint). */
export function workersOn(entries: PmAttendanceEntry[], attendanceProjectId: string | null, ymd: string): number {
  if (!attendanceProjectId) return 0;
  return new Set(entries.filter((e) => e.project_id === attendanceProjectId && e.work_date === ymd).map((e) => e.worker_id)).size;
}

// ---------------------------------------------------------------------------
// Projekt napi állapota és következő teendő
// ---------------------------------------------------------------------------
export type PmProjectDay = {
  project: PmProject;
  openTasks: PmTask[];
  overdue: PmTask[];
  today: PmTask[];
  blocked: PmTask[];
  upcoming: PmTask[];
  unassigned: number;
  docs: DocSummary;
  notesTotal: number;
  noteToday: boolean;
  attendance: { matched: PmAttendanceProject | null; workersToday: number };
  deadline: { date: string | null; daysLeft: number | null; passed: boolean };
};

export function projectDay(
  project: PmProject,
  ctx: { tasks: PmTask[]; docs: PmDoc[]; notes: PmNote[]; attendanceProjects: PmAttendanceProject[]; attendanceEntries: PmAttendanceEntry[] },
  now: Date = new Date(),
): PmProjectDay {
  const ymd = budapestYmd(now);
  const tasks = ctx.tasks.filter((t) => t.project_id === project.id && isOpenTask(t)).sort(byDue);
  const flags = tasks.map((t) => [t, classifyTask(t, now)] as const);
  const notes = ctx.notes.filter((n) => n.project_id === project.id);
  const matched = attendanceProjectFor(project, ctx.attendanceProjects);
  let daysLeft: number | null = null;
  if (project.deadline) {
    const [y, m, d] = project.deadline.slice(0, 10).split("-").map(Number);
    const [ty, tm, td] = ymd.split("-").map(Number);
    if (y && m && d) daysLeft = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
  }
  return {
    project,
    openTasks: tasks,
    overdue: flags.filter(([, f]) => f.overdue).map(([t]) => t),
    today: flags.filter(([, f]) => f.today).map(([t]) => t),
    blocked: flags.filter(([, f]) => f.blocked).map(([t]) => t),
    upcoming: flags.filter(([, f]) => f.upcoming7).map(([t]) => t),
    unassigned: flags.filter(([, f]) => f.noOwner).length,
    docs: docSummary(ctx.docs.filter((d) => d.project_id === project.id)),
    notesTotal: notes.length,
    noteToday: notes.some((n) => !!n.created_at && budapestYmd(n.created_at) === ymd),
    attendance: { matched, workersToday: workersOn(ctx.attendanceEntries, matched?.id ?? null, ymd) },
    deadline: { date: project.deadline ?? null, daysLeft, passed: daysLeft != null && daysLeft < 0 && project.status !== "lezart" },
  };
}

export type PmActionKind =
  | "overdue_tasks" | "blocked_tasks" | "today_tasks" | "deadline_passed"
  | "handover_check" | "daily_note" | "no_docs" | "none";
export const PM_ACTION_ORDER: PmActionKind[] = [
  "overdue_tasks", "blocked_tasks", "today_tasks", "deadline_passed", "handover_check", "daily_note", "no_docs", "none",
];
export type PmNextAction = { kind: PmActionKind; title: string; detail: string; tab: PmTab; button: string; warnings: string[] };

/** Egy projekt elsődleges következő teendője — rögzített, magyarázható sorrendben. */
export function pmNextAction(day: PmProjectDay): PmNextAction {
  const warnings: string[] = [];
  if (day.unassigned > 0) warnings.push(`${day.unassigned} nyitott feladatnak nincs felelőse.`);
  if (day.deadline.daysLeft != null && day.deadline.daysLeft >= 0 && day.deadline.daysLeft <= 7)
    warnings.push(day.deadline.daysLeft === 0 ? "A projekt határideje ma van." : `A projekt határideje ${day.deadline.daysLeft} nap múlva.`);
  if (day.project.status === "kivitelezes" && !day.attendance.matched)
    warnings.push("A jelenléti naplóban nincs azonos nevű projekt — a létszám itt nem látszik.");

  const status = day.project.status ?? "";
  if (day.overdue.length)
    return { kind: "overdue_tasks", title: `${day.overdue.length} lejárt feladat rendezése`, detail: `Legrégebbi: ${day.overdue[0].title ?? "névtelen feladat"}. Zárd le, vagy a Feladatok oldalon adj új határidőt.`, tab: "tasks", button: "Feladatok megnyitása", warnings };
  if (day.blocked.length)
    return { kind: "blocked_tasks", title: `Akadály feloldása: ${day.blocked[0].title ?? "feladat"}`, detail: `${day.blocked.length} feladat „Akadályozott” állapotú. Egyeztesd a felelőssel, mi kell a folytatáshoz.`, tab: "tasks", button: "Akadályok megnyitása", warnings };
  if (day.today.length)
    return { kind: "today_tasks", title: `Mai feladat: ${day.today[0].title ?? "feladat"}`, detail: `${day.today.length} feladat esedékes ma.`, tab: "tasks", button: "Mai feladatok", warnings };
  if (day.deadline.passed)
    return { kind: "deadline_passed", title: "A projekt határideje lejárt", detail: "Ellenőrizd az állapotot; ha a munka folytatódik, egyeztesd az új határidőt.", tab: "overview", button: "Projekt áttekintése", warnings };
  if (status === "muszaki_atadas")
    return { kind: "handover_check", title: "Átadás-előkészítés ellenőrzése", detail: "Nézd át a nyitott feladatokat, fotókat és dokumentumokat az átadás előtt.", tab: "handover", button: "Átadás-ellenőrzés", warnings };
  if (status === "kivitelezes" && !day.noteToday)
    return { kind: "daily_note", title: "Mai napi jegyzet rögzítése", detail: "Ma még nincs napi jegyzet ehhez a kivitelezéshez: mi készült el, mi akadályoz.", tab: "overview", button: "Napi lap megnyitása", warnings };
  if (day.docs.total === 0)
    return { kind: "no_docs", title: "Első dokumentum feltöltése", detail: "Nincs még fájl a projekthez (terv, fotó, műszaki leírás).", tab: "docs", button: "Dokumentumok", warnings };
  return { kind: "none", title: "Nincs sürgős teendő", detail: `Állapot: ${PROJECT_STATUS_LABEL[status] ?? (status || "nincs megadva")}. Nézd át a következő határidőket.`, tab: "overview", button: "Projekt megnyitása", warnings };
}

// ---------------------------------------------------------------------------
// PM Ma: projektválasztó sorai, fókusz és munkafolyamat-sáv
// ---------------------------------------------------------------------------
export type PmRow = PmProjectDay & { next: PmNextAction; mine: boolean };

/** Aktív projektek napi sorai sürgősség szerint; `onlyMine` a kijelölt projektvezetőre szűr. */
export function pmProjectRows(
  projects: PmProject[],
  ctx: Parameters<typeof projectDay>[1],
  opts: { uid: string | null; onlyMine: boolean; now?: Date },
): PmRow[] {
  const now = opts.now ?? new Date();
  return projects
    .filter(isActiveProject)
    .map((p) => ({ p, mine: !!opts.uid && projectManagerOf(p) === opts.uid }))
    .filter(({ mine }) => !opts.onlyMine || mine)
    .map(({ p, mine }) => {
      const day = projectDay(p, ctx, now);
      return { ...day, next: pmNextAction(day), mine };
    })
    .sort((a, b) =>
      PM_ACTION_ORDER.indexOf(a.next.kind) - PM_ACTION_ORDER.indexOf(b.next.kind)
      || (a.deadline.daysLeft ?? 9999) - (b.deadline.daysLeft ?? 9999)
      || String(a.project.title ?? "").localeCompare(String(b.project.title ?? ""), "hu"));
}

export type PmFocus =
  | { state: "loading" }
  | { state: "error" }
  | { state: "empty" }
  | { state: "calm"; row: PmRow }
  | { state: "action"; row: PmRow };
export function pmFocus(rows: PmRow[], status: { ready: boolean; error: boolean }): PmFocus {
  if (status.error) return { state: "error" };
  if (!status.ready) return { state: "loading" };
  if (!rows.length) return { state: "empty" };
  return rows[0].next.kind === "none" ? { state: "calm", row: rows[0] } : { state: "action", row: rows[0] };
}

export type PmStage = { key: string; label: string; count: number | string; to: string; hint: string };
/** Napi munkafolyamat: projekt → feladat → akadály → jelenlét → napi jegyzet → átadás. */
export function pmDayStages(rows: PmRow[], attendanceWorkersToday: number | null, ready: boolean): PmStage[] {
  const n = (v: number) => (ready ? v : "—");
  const sum = (f: (r: PmRow) => number) => rows.reduce((a, r) => a + f(r), 0);
  return [
    { key: "projects", label: "Projekt", count: n(rows.length), to: "/projects", hint: "Aktív projektjeid" },
    { key: "tasks", label: "Mai feladat", count: n(sum((r) => r.today.length + r.overdue.length)), to: "/tasks", hint: "Mai és lejárt, felelőssel" },
    { key: "blocked", label: "Akadály", count: n(sum((r) => r.blocked.length)), to: "/tasks", hint: "„Akadályozott” feladatok" },
    { key: "attendance", label: "Jelenlét ma", count: attendanceWorkersToday == null ? "—" : attendanceWorkersToday, to: "/attendance", hint: "Rögzített dolgozó ma" },
    { key: "note", label: "Napi jegyzet", count: n(rows.filter((r) => r.project.status === "kivitelezes" && !r.noteToday).length), to: "/projects", hint: "Kivitelezés, ma még nincs" },
    { key: "handover", label: "Átadás előtt", count: n(rows.filter((r) => r.project.status === "muszaki_atadas").length), to: "/projects", hint: "Műszaki átadás állapotban" },
  ];
}

// ---------------------------------------------------------------------------
// Projektadatlap: lépéssáv és átadás-előkészítés (TIG NEM készül a CRM-ben)
// ---------------------------------------------------------------------------
export type StepState = "ok" | "warn" | "missing";
export type PmProjectStep = { key: string; label: string; tab: PmTab; state: StepState; summary: string };
export function pmProjectSteps(day: PmProjectDay): PmProjectStep[] {
  const open = day.openTasks.length;
  return [
    {
      key: "tasks", label: "Feladatok és felelősök", tab: "tasks",
      state: day.overdue.length || day.blocked.length ? "missing" : day.unassigned || day.today.length ? "warn" : "ok",
      summary: open ? `${open} nyitott · ${day.overdue.length} lejárt · ${day.blocked.length} akadály` : "Nincs nyitott feladat",
    },
    {
      key: "site", label: "Helyszín és napi lap", tab: "overview",
      state: day.noteToday ? "ok" : day.project.status === "kivitelezes" ? "missing" : "warn",
      summary: `${day.noteToday ? "Ma van napi jegyzet" : "Ma nincs napi jegyzet"} · ${day.attendance.matched ? `${day.attendance.workersToday} fő rögzítve ma` : "jelenlét nincs összekötve"}`,
    },
    {
      key: "docs", label: "Dokumentumok és fotók", tab: "docs",
      state: day.docs.total === 0 ? "missing" : day.docs.photo === 0 ? "warn" : "ok",
      summary: `${day.docs.total} fájl · ${day.docs.photo} fotó`,
    },
    {
      key: "handover", label: "Átadás-előkészítés", tab: "handover",
      state: day.project.status === "muszaki_atadas" ? (open ? "missing" : "warn") : open ? "warn" : "ok",
      summary: day.project.status === "muszaki_atadas" ? "Műszaki átadás alatt" : "Tájékoztató ellenőrzőlista",
    },
  ];
}

export type HandoverCheck = { key: string; label: string; ok: boolean; blocking: boolean; hint?: string };
export type HandoverReadiness = { checks: HandoverCheck[]; ready: boolean; missingBlocking: number; done: number };
/**
 * Átadás / teljesítésigazolás (TIG) ELŐKÉSZÍTÉS — csak a meglévő adatok
 * ellenőrzése. A CRM nem állít ki és nem írat alá TIG-et, nem jelöl elfogadást.
 */
export function handoverReadiness(day: PmProjectDay, extra: { hasContact: boolean }): HandoverReadiness {
  const open = day.openTasks.length;
  const checks: HandoverCheck[] = [
    { key: "tasks", label: "Minden feladat lezárva", ok: open === 0, blocking: true, hint: open ? `${open} nyitott feladat` : undefined },
    { key: "blocked", label: "Nincs akadályozott feladat", ok: day.blocked.length === 0, blocking: true, hint: day.blocked.length ? `${day.blocked.length} akadályozott` : undefined },
    { key: "photo", label: "Fotódokumentáció feltöltve", ok: day.docs.photo > 0, blocking: false, hint: "Dokumentumok → Fénykép kategória" },
    { key: "technical", label: "Műszaki dokumentáció vagy tervrajz", ok: day.docs.technical + day.docs.plan > 0, blocking: false, hint: "Dokumentumok → Műszaki dokumentáció / Tervrajz" },
    { key: "contract", label: "Szerződés a projektnél", ok: day.docs.contract > 0, blocking: false, hint: "Dokumentumok → Szerződés kategória" },
    { key: "contact", label: "Ügyfél-kapcsolattartó megadva", ok: extra.hasContact, blocking: false, hint: "Kapcsolatok fül" },
    { key: "notes", label: "Van rögzített napi jegyzet", ok: day.notesTotal > 0, blocking: false, hint: "Áttekintés → Napi lap" },
    { key: "status", label: "Projektállapot: Műszaki átadás", ok: day.project.status === "muszaki_atadas" || day.project.status === "lezart", blocking: false, hint: "A fejléc állapotválasztójában állítható" },
  ];
  return {
    checks,
    ready: checks.every((c) => c.ok || !c.blocking),
    missingBlocking: checks.filter((c) => !c.ok && c.blocking).length,
    done: checks.filter((c) => c.ok).length,
  };
}

// ---------------------------------------------------------------------------
// Boss gyorskérdések — csak a valós, Boss számára regisztrált eszközökre
// (crm.projects / crm.tasks / crm.followups / crm.meetings). Dokumentumot és
// jelenlétet Boss nem olvas.
// ---------------------------------------------------------------------------
export const BOSS_QUICK_IDS = ["daily-pm", "today-tasks", "blocked", "deadlines", "risks"] as const;
export type BossQuickId = (typeof BOSS_QUICK_IDS)[number];
export const isBossQuickId = (v: unknown): v is BossQuickId =>
  typeof v === "string" && (BOSS_QUICK_IDS as readonly string[]).includes(v);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Projektadatlapról: `/tasks?new=1&project_id=<uuid>` — a projekt előre kitöltve,
 * minden más a megszokott Feladat űrlap és mentési út. Hibás azonosító → nincs előtöltés.
 */
export function taskDefaultsFromUrl(params: URLSearchParams): Record<string, string> | null {
  const id = params.get("project_id");
  params.delete("project_id");
  return id && UUID_RE.test(id) ? { project_id: id, status: "open", priority: "normal" } : null;
}

/** `/attendance/quick?project=<uuid>` — csak a jelenléti projekt előválasztása. */
export function attendanceProjectFromSearch(v: unknown): string | undefined {
  return typeof v === "string" && UUID_RE.test(v) ? v : undefined;
}
