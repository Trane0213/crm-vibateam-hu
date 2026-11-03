import { z } from "zod";
import { QUOTE_TEMPLATES, type TemplateKey } from "./templates";

export const templateKeySchema = z.enum(["private", "b2b"]);
export const defaultsValueSchema = z.object({
  revision: z.number().int().min(1),
  terms: z.record(z.string().max(4000)),
}).strict();
export const saveDefaultsSchema = z.object({
  key: templateKeySchema,
  expectedRevision: z.number().int().min(0),
  terms: z.record(z.string().max(4000)),
}).strict().superRefine((data, ctx) => {
  const allowed = new Set(QUOTE_TEMPLATES[data.key].sections.map((s) => s.key));
  if (Object.keys(data.terms).some((k) => !allowed.has(k))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Ismeretlen feltételmező." });
  }
});

export function builtInDefaults(key: TemplateKey) {
  return { revision: 0, terms: Object.fromEntries(QUOTE_TEMPLATES[key].sections.map((s) => [s.key, s.default])) };
}