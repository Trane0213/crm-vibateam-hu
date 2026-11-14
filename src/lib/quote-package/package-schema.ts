/** P5 — ajánlatcsomag kérés sémája (böngésző- és szerverbiztos). */
import { z } from "zod";
import { overridesSchema } from "@/lib/pricing/pricing-schema";

export const packageInput = z.object({
  quoteId: z.string().uuid(),
  budgetDocumentId: z.string().uuid().nullable().optional(),
  mode: z.enum(["subcontractor_labor", "full_construction"]).optional(),
  overrides: overridesSchema.default({}),
  template: z.object({ name: z.string().min(1).max(200), base64: z.string().max(3_000_000) }).nullable().default(null),
  includeFiles: z.boolean().default(true),
}).strict();
export type PackageRequest = z.infer<typeof packageInput>;
