/**
 * P3 — Timothy: kapott költségvetés determinisztikus árazása (csak számítás, nem ment, nem küld, nem exportál).
 * Ugyanazt a szerveroldali motort használja, mint az ajánlat „Költségvetés árazása” panelje; a módosításokat
 * (tartalék, egységár, kivétel) tételesen, eredeti → új értékkel és érintett sorokkal adja vissza.
 */
import { z } from "zod";
import { registerTool } from "../tool-registry";
import { toolError } from "../tool-errors";
import { adjustmentSchema, overridesSchema } from "@/lib/pricing/pricing-schema";
import { lineDto, summaryDto } from "@/lib/pricing/pricing-dto";
import type { ToolContext } from "../types";

const input = z.object({
  quote_id: z.string().uuid(), document_id: z.string().uuid(), mode: z.enum(["subcontractor_labor", "full_construction"]),
  overrides: overridesSchema.default({}), adjustments: z.array(adjustmentSchema).max(30).default([]),
  status_filter: z.array(z.enum(["priced", "review", "missing", "blocked", "zero_qty", "excluded", "excluded_review", "existing_price"])).max(8).optional(),
  page: z.number().int().min(0).max(500).default(0),
}).strict();
const PAGE = 40;

export async function priceBudgetTool(args: Record<string, unknown>, ctx: ToolContext) {
  const data = input.parse(args);
  const { priceQuoteBudget } = await import("@/lib/pricing/pricing.server");
  const r = await priceQuoteBudget(ctx.supabaseUser, ctx.userId, { quoteId: data.quote_id, documentId: data.document_id, mode: data.mode, overrides: data.overrides, includeReference: true, template: null, adjustments: data.adjustments, buildWorkbook: false }, { role: ctx.userRole ?? null });
  const all = r.output.run.result.lines.filter((l) => !data.status_filter || data.status_filter.includes(l.status));
  const s = summaryDto(r.output);
  return {
    file: s.file, profile: s.profile, as_of: s.asOf, currency: "HUF", vat: "nettó", totals: s.totals, blockers: s.blockers, warnings: s.warnings,
    reconciliation: { ok: s.reconciliation.ok, problems: s.reconciliation.problems, sheets: s.reconciliation.sheets }, structure: s.structure,
    adjustments: s.adjustments, diff: s.diff && { ...s.diff, changed: s.diff.changed.slice(0, 60) },
    lines: all.slice(data.page * PAGE, (data.page + 1) * PAGE).map(lineDto), lines_total: all.length, page: data.page, next_page: (data.page + 1) * PAGE < all.length ? data.page + 1 : null,
    limitations: [
      "Determinisztikus számítás, nem mentett: módosítás csak ebben a válaszban érvényes; tartós árazási verzió és jóváhagyás még nincs (P5).",
      "Árazott Excel letöltése az ajánlat „Összeg és megjegyzések” lépésében, a panelen; kiküldés kizárólag a meglévő ellenőrzött Gmail-útvonalon.",
      "Árforrás: a beépített korábbi VIBA-ajánlati munkadíj-referencia (kiküldött, elfogadás nem igazolt). Anyagár-törzs még nincs; teljes kivitelezésnél anyag csak feltöltött ársablonból árazható (panelen).",
      "review/missing/excluded_review sor nem kap automatikus árat; korábbi ár nem önköltség/fedezet.",
    ],
  };
}

export function registerPricingTools() {
  registerTool({ name: "crm_price_received_budget", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: ["owner", "sales"],
    description: "Kapott (megrendelői) költségvetés determinisztikus árazása pontos quote_id + document_id (quote_documents, árazatlan/árazott költségvetés) alapján. mode: subcontractor_labor (csak munkadíj) vagy full_construction. Opcionális overrides (óradíj, tartalék %, célfedezet %, kerekítés) és adjustments (tételes módosítás indoklással: contingency_pct, add_unit_amount, set_unit_price, remove_component, exclude, include; target rows/section/name/status). Nem ment, nem küld; eredeti → új érték diffet ad.",
    parameters: { type: "object", additionalProperties: false, properties: {
      quote_id: { type: "string" }, document_id: { type: "string" }, mode: { type: "string", enum: ["subcontractor_labor", "full_construction"] },
      overrides: { type: "object", additionalProperties: false, properties: { laborRateHuf: { type: "number" }, historicalLaborPolicy: { type: "string", enum: ["as_quoted", "rate_scaled"] }, contingencyPct: { type: "number" }, marginPct: { type: "number" }, materialSurchargePct: { type: "number" }, laborSurchargePct: { type: "number" }, roundingStepHuf: { type: "integer" }, priceZeroQty: { type: "boolean" } } },
      adjustments: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["id", "reason", "op", "target"], properties: {
        id: { type: "string" }, reason: { type: "string" }, op: { type: "string", enum: ["contingency_pct", "add_unit_amount", "add_line_amount", "set_unit_price", "remove_component", "exclude", "include"] },
        target: { type: "object", additionalProperties: false, properties: { rows: { type: "array", items: { type: "string" } }, sheet: { type: "string" }, section: { type: "string" }, name: { type: "string" }, status: { type: "array", items: { type: "string" } } } },
        component: { type: "string", enum: ["material", "labor", "both"] }, pct: { type: "number" }, amountHuf: { type: "number" } } } },
      status_filter: { type: "array", items: { type: "string", enum: ["priced", "review", "missing", "blocked", "zero_qty", "excluded", "excluded_review", "existing_price"] } },
      page: { type: "integer", minimum: 0 },
    }, required: ["quote_id", "document_id", "mode"] } },
  async (args, ctx) => {
    try { return { ok: true, data: await priceBudgetTool(args, ctx) }; }
    catch (e) { return toolError.fromException(e instanceof z.ZodError ? "Érvénytelen árazási paraméter." : e instanceof Error && /Tulajdonos|nem hozzáférhető|nem olvasható|típusú|túl nagy|kulcs/.test(e.message) ? e.message : "A költségvetés nem dolgozható fel."); }
  });
}
