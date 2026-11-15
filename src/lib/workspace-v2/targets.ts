// Havi célok: tulajdonos által megadott érték, NINCS beépített alapérték.
// Ha nincs mentve, a felület „nincs beállítva” állapotot mutat.
import { z } from "zod";
import { budapestDayBounds } from "@/lib/owner-kpis";
import { budapestYmd } from "@/lib/pm/pm-day-flow";

export const TARGET_AREAS = ["sales", "marketing"] as const;
export type TargetArea = (typeof TARGET_AREAS)[number];

export const TARGET_LABEL: Record<TargetArea, { title: string; unit: string }> = {
  sales: { title: "Havi cél – megnyert nettó érték", unit: "Ft" },
  marketing: { title: "Havi cél – Saleshez átadott cég", unit: "db" },
};

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const targetValueSchema = z.object({ revision: z.number().int().min(1), amount: z.number().positive().max(1e12) }).strict();
export type TargetValue = z.infer<typeof targetValueSchema>;

export const saveTargetSchema = z.object({
  area: z.enum(TARGET_AREAS),
  month: monthSchema,
  amount: z.number().positive().max(1e12),
  expectedRevision: z.number().int().min(0),
}).strict();

export function targetKey(area: TargetArea, month: string) {
  return `workspace_target:${area}:${month}`;
}

export function budapestMonth(now = new Date()) {
  return budapestYmd(now).slice(0, 7);
}

/** A budapesti hónap első napjának kezdete (ISO). */
export function budapestMonthStart(now = new Date()) {
  const day = Number(budapestYmd(now).slice(8, 10));
  return budapestDayBounds(now, -(day - 1)).start;
}

export function canReadTargets(role: unknown) {
  return role === "owner" || role === "sales" || role === "marketing";
}
export function canWriteTargets(role: unknown) {
  return role === "owner";
}

/** Előrehaladás csak ha a cél és a tény is ismert; különben null (nem becsült). */
export function targetProgress(actual: number | null | undefined, target: TargetValue | null | undefined): number | null {
  if (!target || actual == null || !Number.isFinite(actual)) return null;
  return Math.round((actual / target.amount) * 100);
}

export function parseTarget(value: unknown): TargetValue | null {
  const r = targetValueSchema.safeParse(value);
  return r.success ? r.data : null;
}
