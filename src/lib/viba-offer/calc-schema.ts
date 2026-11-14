/** P6 — a kalkulációs bemenet szigorú sémája (Timothy-eszköz és a panel „javaslat betöltése” közös ellenőrzése). */
import { z } from "zod";
import type { CalcInput } from "./calc-model";

const text = (max: number) => z.string().max(max);
const id = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);
const qty = z.number().min(0).max(1_000_000).nullable();
const qtyStatus = z.enum(["measured", "estimated", "unknown"]);
export const rateSchema = z.object({ huf: z.number().positive().max(100_000_000), basis: z.enum(["sell", "cost"]), source: z.enum(["manual", "historical_quote", "reference"]), note: text(300) }).strict();
const rate = rateSchema.nullable();
export const lineSchema = z.object({ id, group: text(80).optional(), name: text(200), unit: text(20), qty, qtyStatus, material: rate.optional(), labor: rate.optional(), ref: text(40).optional() }).strict();
const decision = z.enum(["included", "excluded", "unknown"]);

const house = z.object({
  profile: z.literal("house_sqm"), areaM2: qty, areaStatus: qtyStatus, packageLabel: text(80), packageVersion: text(40),
  content: z.object({ outlets: decision, distribution: decision, cabling: decision, devices: decision, low_voltage: decision, metering: decision }).partial().strict(),
  exclusionsNote: text(1000), materialPerM2: rate, laborPerM2: rate, conditionsNote: text(1000), detailedPlan: z.boolean(), extras: z.array(lineSchema).max(100),
}).strict();
const hourly = z.object({
  profile: z.literal("hourly"), period: text(120),
  roles: z.array(z.object({ id, label: text(80), headcount: z.number().int().min(1).max(100), rate }).strict()).max(10),
  bands: z.array(z.object({ band: z.enum(["workday", "night", "weekend"]), hours: qty, qtyStatus, surchargePct: z.number().min(0).max(500).nullable() }).strict()).max(3),
  visits: z.number().int().min(1).max(1000), minHoursPerVisit: z.number().min(0).max(24).nullable(),
  travel: z.object({ include: z.boolean(), unit: z.enum(["alkalom", "km"]), qty, rate }).strict(),
  urgency: z.object({ include: z.boolean(), pct: z.number().min(0).max(500).nullable() }).strict(),
  materialsAllowed: z.boolean(), extras: z.array(lineSchema).max(100),
}).strict();
const custom = z.object({
  profile: z.literal("custom"), scenario: z.enum(["preliminary", "post_survey", "itemized"]), surveyDone: z.boolean(), surveyNote: text(500),
  defects: z.array(z.object({ id, ref: text(20), text: text(400), priority: z.enum(["urgent", "scheduled", "unknown"]), evidence: text(80).optional() }).strict()).max(200),
  tasks: z.array(lineSchema.extend({ defectId: id.nullable() }).strict()).max(300),
  surveyFee: z.object({ include: z.boolean(), qty, rate }).strict(),
  measurement: z.object({ include: z.boolean(), qty, rate, note: text(500) }).strict(),
  expertRequired: z.boolean(), outageNote: text(300),
}).strict();

export const calcInputSchema = z.object({
  mode: z.enum(["material_labor", "labor_only"]),
  commercial: z.object({
    contingencyPct: z.number().min(0).max(100),
    uplift: z.discriminatedUnion("kind", [z.object({ kind: z.literal("none") }).strict(), z.object({ kind: z.literal("markup"), pct: z.number().min(0).max(499) }).strict(), z.object({ kind: z.literal("margin"), pct: z.number().min(0).max(94.99) }).strict()]),
    roundingStepHuf: z.number().int().min(1).max(100_000), roundingMode: z.enum(["half_up", "up", "down"]),
  }).strict(),
  profile: z.discriminatedUnion("profile", [house, hourly, custom]),
}).strict();

export function parseCalcInput(v: unknown): CalcInput { return calcInputSchema.parse(v) as CalcInput; }

/** A panel „Timothy-javaslat betöltése” mezője: `VIBA-KALK-1:` + JSON. Csak séma szerint érvényes bemenet tölthető be. */
export const IMPORT_PREFIX = "VIBA-KALK-1:";
export function encodeImport(i: CalcInput): string { return IMPORT_PREFIX + JSON.stringify(i); }
export function decodeImport(s: string): CalcInput {
  const t = s.trim();
  if (!t.startsWith(IMPORT_PREFIX)) throw new Error("Nem VIBA-kalkulációs javaslat (VIBA-KALK-1: előtag hiányzik).");
  let raw: unknown;
  try { raw = JSON.parse(t.slice(IMPORT_PREFIX.length)); } catch { throw new Error("A javaslat nem olvasható (hibás JSON)."); }
  return parseCalcInput(raw);
}
