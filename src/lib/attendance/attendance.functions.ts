/**
 * Jelenléti rendszer V1 — szerveroldali API.
 *
 * Minden hívás `requireSupabaseAuth`-on megy, így a rögzítő projektvezető
 * `context.userId`-je automatikusan az `attendance_entries.created_by`-ba
 * kerül. Az RLS az `authenticated` role-t engedi olvasni/írni, DELETE
 * csak owner-nek.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

export const listWorkers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("attendance_workers")
      .select("id, full_name, daily_rate, default_transport_fee, is_active, note, created_at")
      .order("is_active", { ascending: false })
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const workerUpsert = z.object({
  id: z.string().uuid().optional(),
  full_name: z.string().trim().min(1).max(200),
  daily_rate: z.number().min(0).default(0),
  default_transport_fee: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const upsertWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => workerUpsert.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      full_name: data.full_name,
      daily_rate: data.daily_rate,
      default_transport_fee: data.default_transport_fee,
      is_active: data.is_active,
      note: data.note ?? null,
    };
    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("attendance_workers")
        .update(payload)
        .eq("id", data.id)
        .select()
        .maybeSingle();
      if (error) throw new Error(error.message);
      return { row };
    }
    const { data: row, error } = await context.supabase
      .from("attendance_workers")
      .insert({ ...payload, created_by: context.userId })
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row };
  });

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const listProjects = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("attendance_projects")
      .select("id, name, is_active, created_at")
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { rows: data ?? [] };
  });

const projectCreate = z.object({
  name: z.string().trim().min(1).max(200),
});

/** Idempotens: ha a normalizált név ütközik a case-insensitive unique indexszel,
 *  visszaadja a meglévő rekordot. A hívó mindig `{ id, name }` párt kap. */
export const createProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => projectCreate.parse(input))
  .handler(async ({ data, context }) => {
    const name = data.name.replace(/\s+/g, " ").trim();
    // Először próbáljuk beszúrni. Ütközés esetén a unique index dob 23505-öt,
    // ilyenkor lekérdezzük a meglévőt.
    const ins = await context.supabase
      .from("attendance_projects")
      .insert({ name, created_by: context.userId })
      .select("id, name, is_active")
      .maybeSingle();
    if (!ins.error && ins.data) return { row: ins.data, created: true };
    if (ins.error && ins.error.code !== "23505") {
      throw new Error(ins.error.message);
    }
    // Duplikátum → keressük vissza case-insensitive.
    const { data: existing, error: exErr } = await context.supabase
      .from("attendance_projects")
      .select("id, name, is_active")
      .ilike("name", name)
      .limit(1)
      .maybeSingle();
    if (exErr) throw new Error(exErr.message);
    if (!existing) throw new Error("Projekt létrehozása sikertelen.");
    return { row: existing, created: false };
  });

// ---------------------------------------------------------------------------
// Entries
// ---------------------------------------------------------------------------

const listEntriesInput = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
  workerId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export const listEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listEntriesInput.parse(input))
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("attendance_entries")
      .select(
        "id, worker_id, project_id, work_date, daily_rate, start_time, end_time, note, created_by, created_at, " +
          "attendance_workers ( id, full_name ), attendance_projects ( id, name )",
      )
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000);
    if (data.from) q = q.gte("work_date", data.from);
    if (data.to) q = q.lte("work_date", data.to);
    if (data.workerId) q = q.eq("worker_id", data.workerId);
    if (data.projectId) q = q.eq("project_id", data.projectId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return { rows: rows ?? [] };
  });

const batchInput = z.object({
  workDate: z.string().date(),
  projectId: z.string().uuid(),
  overwriteExisting: z.boolean().default(false),
  entries: z
    .array(
      z.object({
        workerId: z.string().uuid(),
        dailyRate: z.number().min(0),
        startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
        note: z.string().trim().max(2000).optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
});

export const createEntriesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => batchInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const workerIds = data.entries.map((e) => e.workerId);

    // Ütközés-ellenőrzés: melyik worker-nek van már erre a napra rekordja?
    const { data: existing, error: exErr } = await supabase
      .from("attendance_entries")
      .select("id, worker_id")
      .eq("work_date", data.workDate)
      .in("worker_id", workerIds);
    if (exErr) throw new Error(exErr.message);

    const existingByWorker = new Map<string, string>();
    for (const r of existing ?? []) existingByWorker.set(r.worker_id as string, r.id as string);

    const conflicts: string[] = [];
    const toInsert: any[] = [];
    const toUpdate: { id: string; payload: any }[] = [];

    for (const e of data.entries) {
      const base = {
        worker_id: e.workerId,
        project_id: data.projectId,
        work_date: data.workDate,
        daily_rate: e.dailyRate,
        start_time: e.startTime || null,
        end_time: e.endTime || null,
        note: e.note ?? null,
      };
      const existingId = existingByWorker.get(e.workerId);
      if (existingId) {
        if (data.overwriteExisting) toUpdate.push({ id: existingId, payload: base });
        else conflicts.push(e.workerId);
      } else {
        toInsert.push({ ...base, created_by: userId });
      }
    }

    let inserted = 0;
    let updated = 0;
    if (toInsert.length) {
      const { error, count } = await supabase
        .from("attendance_entries")
        .insert(toInsert, { count: "exact" });
      if (error) throw new Error(error.message);
      inserted = count ?? toInsert.length;
    }
    for (const u of toUpdate) {
      const { error } = await supabase
        .from("attendance_entries")
        .update(u.payload)
        .eq("id", u.id);
      if (error) throw new Error(error.message);
      updated += 1;
    }
    return { inserted, updated, skipped: conflicts };
  });

const updateEntryInput = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().optional(),
  workDate: z.string().date().optional(),
  dailyRate: z.number().min(0).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  note: z.string().trim().max(2000).nullable().optional(),
});

export const updateEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => updateEntryInput.parse(input))
  .handler(async ({ data, context }) => {
    const payload: Record<string, any> = {};
    if (data.projectId) payload.project_id = data.projectId;
    if (data.workDate) payload.work_date = data.workDate;
    if (data.dailyRate !== undefined) payload.daily_rate = data.dailyRate;
    if (data.startTime !== undefined) payload.start_time = data.startTime || null;
    if (data.endTime !== undefined) payload.end_time = data.endTime || null;
    if (data.note !== undefined) payload.note = data.note ?? null;
    const { error } = await context.supabase
      .from("attendance_entries")
      .update(payload)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const deleteEntryInput = z.object({ id: z.string().uuid() });

export const deleteEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => deleteEntryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("attendance_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------------------------------------------------------------------------
// Period adjustments
// ---------------------------------------------------------------------------

const adjustmentUpsert = z.object({
  id: z.string().uuid().optional(),
  worker_id: z.string().uuid(),
  period_from: z.string().date(),
  period_to: z.string().date(),
  advance: z.number().min(0).default(0),
  transport_fee: z.number().min(0).default(0),
  note: z.string().trim().max(2000).optional().nullable(),
});

export const upsertPeriodAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adjustmentUpsert.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      worker_id: data.worker_id,
      period_from: data.period_from,
      period_to: data.period_to,
      advance: data.advance,
      transport_fee: data.transport_fee,
      note: data.note ?? null,
    };
    // Az UNIQUE (worker_id, period_from, period_to) miatt megpróbáljuk
    // felülírni a meglévő sort, ha van. Egyszerű upsert onConflict-tal.
    const { data: row, error } = await context.supabase
      .from("attendance_period_adjustments")
      .upsert(
        data.id ? { id: data.id, ...payload, created_by: context.userId } : { ...payload, created_by: context.userId },
        { onConflict: "worker_id,period_from,period_to" },
      )
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { row };
  });

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

const summaryInput = z.object({
  from: z.string().date(),
  to: z.string().date(),
});

export type SummaryWorkerRow = {
  worker_id: string;
  worker_name: string;
  days: number;
  daily_rate: number;
  base_pay: number;
  transport_fee: number;
  advance: number;
  total: number;
  by_project: { project_id: string; project_name: string; days: number }[];
  note: string | null;
};

export type SummaryProjectRow = {
  project_id: string;
  project_name: string;
  days: number;
  amount: number;
};

export const getPeriodSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => summaryInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const [entriesRes, adjustRes, workersRes] = await Promise.all([
      supabase
        .from("attendance_entries")
        .select(
          "id, worker_id, project_id, work_date, daily_rate, " +
            "attendance_workers ( id, full_name, daily_rate ), " +
            "attendance_projects ( id, name )",
        )
        .gte("work_date", data.from)
        .lte("work_date", data.to),
      supabase
        .from("attendance_period_adjustments")
        .select("id, worker_id, advance, transport_fee, note")
        .eq("period_from", data.from)
        .eq("period_to", data.to),
      supabase
        .from("attendance_workers")
        .select("id, full_name, daily_rate, default_transport_fee, is_active")
        .eq("is_active", true),
    ]);
    if (entriesRes.error) throw new Error(entriesRes.error.message);
    if (adjustRes.error) throw new Error(adjustRes.error.message);
    if (workersRes.error) throw new Error(workersRes.error.message);

    const entries = entriesRes.data ?? [];
    const adjustments = adjustRes.data ?? [];
    const workers = workersRes.data ?? [];

    const workerMap = new Map<string, any>();
    for (const w of workers) workerMap.set(w.id as string, w);

    const byWorker = new Map<
      string,
      { name: string; days: number; rateSum: number; byProject: Map<string, { name: string; days: number }> }
    >();
    const byProject = new Map<string, { name: string; days: number; amount: number }>();

    for (const e of entries as any[]) {
      const wid = e.worker_id as string;
      const pid = e.project_id as string;
      const wname = e.attendance_workers?.full_name ?? workerMap.get(wid)?.full_name ?? "—";
      const pname = e.attendance_projects?.name ?? "—";
      const rate = Number(e.daily_rate ?? 0);

      let wagg = byWorker.get(wid);
      if (!wagg) {
        wagg = { name: wname, days: 0, rateSum: 0, byProject: new Map() };
        byWorker.set(wid, wagg);
      }
      wagg.days += 1;
      wagg.rateSum += rate;
      const wp = wagg.byProject.get(pid);
      if (wp) wp.days += 1;
      else wagg.byProject.set(pid, { name: pname, days: 1 });

      const pagg = byProject.get(pid);
      if (pagg) {
        pagg.days += 1;
        pagg.amount += rate;
      } else {
        byProject.set(pid, { name: pname, days: 1, amount: rate });
      }
    }

    const adjByWorker = new Map<string, { advance: number; transport_fee: number; note: string | null }>();
    for (const a of adjustments as any[]) {
      adjByWorker.set(a.worker_id as string, {
        advance: Number(a.advance ?? 0),
        transport_fee: Number(a.transport_fee ?? 0),
        note: (a.note as string | null) ?? null,
      });
    }

    // Minden aktív dolgozó szerepeljen, akinek van napja VAGY adjustment-je.
    const workerIds = new Set<string>([...byWorker.keys(), ...adjByWorker.keys()]);

    const rows: SummaryWorkerRow[] = [];
    for (const wid of workerIds) {
      const w = workerMap.get(wid);
      const agg = byWorker.get(wid);
      const adj = adjByWorker.get(wid);
      const days = agg?.days ?? 0;
      const avgRate = days > 0 ? (agg!.rateSum / days) : Number(w?.daily_rate ?? 0);
      const base_pay = agg?.rateSum ?? 0;
      const transport_fee = adj?.transport_fee ?? Number(w?.default_transport_fee ?? 0);
      const advance = adj?.advance ?? 0;
      rows.push({
        worker_id: wid,
        worker_name: agg?.name ?? w?.full_name ?? "—",
        days,
        daily_rate: avgRate,
        base_pay,
        transport_fee,
        advance,
        total: base_pay + transport_fee - advance,
        by_project: agg
          ? Array.from(agg.byProject.entries())
              .map(([project_id, v]) => ({ project_id, project_name: v.name, days: v.days }))
              .sort((a, b) => b.days - a.days)
          : [],
        note: adj?.note ?? null,
      });
    }
    rows.sort((a, b) => a.worker_name.localeCompare(b.worker_name, "hu"));

    const projectRows: SummaryProjectRow[] = Array.from(byProject.entries())
      .map(([project_id, v]) => ({
        project_id,
        project_name: v.name,
        days: v.days,
        amount: v.amount,
      }))
      .sort((a, b) => b.amount - a.amount);

    const totals = {
      days: rows.reduce((s, r) => s + r.days, 0),
      base_pay: rows.reduce((s, r) => s + r.base_pay, 0),
      transport_fee: rows.reduce((s, r) => s + r.transport_fee, 0),
      advance: rows.reduce((s, r) => s + r.advance, 0),
      total: rows.reduce((s, r) => s + r.total, 0),
    };

    return { from: data.from, to: data.to, rows, byProject: projectRows, totals };
  });