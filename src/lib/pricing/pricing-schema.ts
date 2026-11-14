/** P3 — közös, böngészőbiztos bemeneti séma (szerverfüggvény és Timothy-eszköz). */
import { z } from "zod";

export const PRICING_ROLES = ["owner", "tulajdonos", "admin", "superadmin", "sales"] as const;

const selector = z.object({
  rows: z.array(z.string().min(1).max(200)).max(500).optional(), sheet: z.string().max(200).optional(),
  section: z.string().max(200).optional(), name: z.string().max(200).optional(),
  status: z.array(z.enum(["priced", "review", "missing", "blocked", "zero_qty", "excluded", "excluded_review", "existing_price"])).max(8).optional(),
}).strict();

export const adjustmentSchema = z.object({
  id: z.string().min(1).max(64), reason: z.string().min(1).max(300), requestedBy: z.string().max(120).nullable().optional(),
  op: z.enum(["contingency_pct", "add_unit_amount", "add_line_amount", "set_unit_price", "remove_component", "exclude", "include"]),
  target: selector, component: z.enum(["material", "labor", "both"]).optional(),
  pct: z.number().finite().optional(), amountHuf: z.number().finite().optional(),
}).strict();

export const overridesSchema = z.object({
  laborRateHuf: z.number().positive().max(200_000).nullable().optional(), laborRateBasis: z.enum(["sell", "cost"]).optional(),
  historicalLaborPolicy: z.enum(["as_quoted", "rate_scaled"]).optional(), historicalBaseRateHuf: z.number().positive().max(200_000).nullable().optional(),
  materialSurchargePct: z.number().min(0).max(500).optional(), laborSurchargePct: z.number().min(0).max(500).optional(),
  contingencyPct: z.number().min(0).max(500).optional(), marginPct: z.number().min(0).max(95).nullable().optional(),
  roundingStepHuf: z.number().int().min(1).max(100_000).optional(), roundingMode: z.enum(["half_up", "up", "down"]).optional(),
  maxPriceAgeDays: z.number().int().min(1).max(3650).optional(), allowHistoricalAuto: z.boolean().optional(), priceZeroQty: z.boolean().optional(),
}).strict();

export const priceBudgetInput = z.object({
  quoteId: z.string().uuid(), documentId: z.string().uuid(),
  mode: z.enum(["subcontractor_labor", "full_construction"]),
  overrides: overridesSchema.default({}),
  includeReference: z.boolean().default(true),
  template: z.object({ name: z.string().min(1).max(200), base64: z.string().max(3_000_000) }).nullable().default(null),
  adjustments: z.array(adjustmentSchema).max(30).default([]),
  buildWorkbook: z.boolean().default(false),
}).strict();
export type PriceBudgetInput = z.infer<typeof priceBudgetInput>;
