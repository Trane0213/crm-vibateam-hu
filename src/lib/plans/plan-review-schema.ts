/** P4 — tervellenőrzés bemeneti sémája (böngésző- és szerverbiztos). */
import { z } from "zod";
import { overridesSchema } from "@/lib/pricing/pricing-schema";

const hours = z.number().min(0).max(500).nullable().optional();
export const cabinetRulesSchema = z.object({
  assemblyHoursPerDevice: z.record(z.enum(["enclosure", "main_switch", "mcb", "rcd", "rcbo", "spd", "contactor", "switch", "terminal", "busbar", "fuse", "relay", "meter", "other"]), z.number().min(0).max(500)).default({}),
  enclosureAssemblyHours: hours, testDocHoursPerCabinet: hours, siteMountHoursPerCabinet: hours, siteFeederHoursPerCabinet: hours,
  siteOutgoingHoursPerCircuit: hours, siteMeasurementHoursPerCabinet: hours,
}).strict();
export const cabinetAdjustmentSchema = z.object({
  id: z.string().min(1).max(60), reason: z.string().min(3).max(300), cabinetId: z.string().max(20).optional(), category: z.enum(["material", "assembly", "site"]).optional(),
  lineIds: z.array(z.string().max(120)).max(100).optional(), op: z.enum(["contingency_pct", "add_amount", "remove_line", "set_unit_price"]),
  pct: z.number().optional(), amountHuf: z.number().optional(),
}).strict();
export const clarificationInput = z.object({ emailId: z.string().uuid(), quote: z.string().min(15).max(1200) }).strict();
export const planReviewInput = z.object({
  quoteId: z.string().uuid(),
  budgetDocumentId: z.string().uuid().nullable().optional(),
  mode: z.enum(["subcontractor_labor", "full_construction"]),
  overrides: overridesSchema.default({}),
  rules: cabinetRulesSchema.nullable().optional(),
  adjustments: z.array(cabinetAdjustmentSchema).max(30).default([]),
  clarifications: z.array(clarificationInput).max(20).default([]),
  template: z.object({ name: z.string().max(200), base64: z.string().max(3_000_000) }).nullable().optional(),
}).strict();
export type PlanReviewRequest = z.infer<typeof planReviewInput>;
export const PLAN_LIMITS = { fileBytes: 20 * 1024 * 1024, totalBytes: 80 * 1024 * 1024, files: 40, pagesPerFile: 80, pagesTotal: 400, itemsPerPage: 12000, pdfDeadlineMs: 20000 };
