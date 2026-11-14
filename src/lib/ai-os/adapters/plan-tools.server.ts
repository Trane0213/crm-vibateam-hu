/**
 * P4 — Timothy: tervellenőrzés (tervjel/lap/revízió, feldolgozottság), elosztó-BOM és szekrénykalkuláció külön
 * költségnemekkel, költségvetés–terv–e-mail eltéréslista és kérdéslista. Ugyanaz a szerveroldali mag, mint az
 * ajánlat „Tervellenőrzés” panelje. Csak olvas és számol: nem ment, nem küld, nem indít fizetős feldolgozást.
 */
import { z } from "zod";
import { registerTool } from "../tool-registry";
import { toolError } from "../tool-errors";
import { cabinetAdjustmentSchema, cabinetRulesSchema, clarificationInput } from "@/lib/plans/plan-review-schema";
import { overridesSchema } from "@/lib/pricing/pricing-schema";
import type { ToolContext } from "../types";

const SECTIONS = ["overview", "drawings", "cabinets", "findings", "questions"] as const;
const input = z.object({
  quote_id: z.string().uuid(), budget_document_id: z.string().uuid().optional(), mode: z.enum(["subcontractor_labor", "full_construction"]),
  section: z.enum(SECTIONS).default("overview"), cabinet_id: z.string().max(20).optional(), page: z.number().int().min(0).max(200).default(0),
  overrides: overridesSchema.default({}), rules: cabinetRulesSchema.optional(), adjustments: z.array(cabinetAdjustmentSchema).max(30).default([]),
  clarifications: z.array(clarificationInput).max(20).default([]),
}).strict();
const PAGE = 30;

export async function planReviewTool(args: Record<string, unknown>, ctx: ToolContext) {
  const d = input.parse(args);
  const { reviewQuotePlans } = await import("@/lib/plans/plan-review.server");
  const r = await reviewQuotePlans(ctx.supabaseUser, ctx.userId, { quoteId: d.quote_id, budgetDocumentId: d.budget_document_id ?? null, mode: d.mode, overrides: d.overrides, rules: d.rules ?? null, adjustments: d.adjustments, clarifications: d.clarifications, template: null }, { role: ctx.userRole ?? null });
  const x = r.result;
  const slice = <T,>(a: T[]) => ({ items: a.slice(d.page * PAGE, (d.page + 1) * PAGE), total: a.length, next_page: (d.page + 1) * PAGE < a.length ? d.page + 1 : null });
  const est = x.pricing.estimates.map((e) => ({ cabinet: e.cabinetId, status: e.status, totals: e.totals }));
  const base = {
    as_of: x.asOf, profile: r.profile, budget_file: r.budgetFile, completeness: x.completeness, matrix: x.matrix.map((m) => ({ file: m.fileName, status: m.label, pages: m.pages, readable: m.readablePages, reasons: m.reasons.slice(0, 3) })),
    files_not_read: r.files.filter((f) => f.status !== "read").map((f) => ({ file: f.fileName, status: f.status, reason: f.statusReason ?? null })),
    clarifications: { accepted: r.clarifications.accepted.map((c) => c.ref), rejected: r.clarifications.rejected }, rules_approval: x.pricing.rulesApproval,
    untrusted_content: true, limitations: [...x.limitations, "Nem mentett: tartós tervellenőrzési/kalkulációs verzió még nincs (adatmodell tulajdonosi döntésre vár)."],
  };
  if (d.section === "overview") return { ...base, drawings_total: x.drawings.length, cabinets: x.cabinets.map((c) => ({ id: c.id, title: c.title, status: c.status, drawing_nos: c.drawingNos, bom_lines: c.lines.length, gaps: c.gaps })), estimates: est,
    findings_by_category: x.findings.reduce<Record<string, number>>((a, f) => ((a[f.category] = (a[f.category] ?? 0) + 1), a), {}), top_findings: x.findings.slice(0, 10).map((f) => ({ id: f.id, category: f.category, severity: f.severity, title: f.title })), questions_total: x.questions.length };
  if (d.section === "drawings") return { ...base, drawings: slice(x.drawings.map((g) => ({ drawing_no: g.drawingNo, title: g.title, files: g.files.map((f) => f.fileName), sheets: g.sheetNos, sheet_total: g.sheetTotal, revisions: g.revisions, dates: g.dates, disciplines: g.disciplines, cabinets: g.cabinetIds, issues: g.issues.map((i) => i.message) }))), unidentified_pages: x.unidentifiedPages.slice(0, 40) };
  if (d.section === "cabinets") {
    const cabs = x.cabinets.filter((c) => !d.cabinet_id || c.id === d.cabinet_id);
    return { ...base, cabinets: cabs.map((c) => ({ id: c.id, title: c.title, status: c.status, drawing_nos: c.drawingNos, rated_data: c.ratedData.map((x2) => `${x2.label}: ${x2.value}`), enclosure: c.enclosure?.description ?? null,
      bom: c.lines.slice(0, 80).map((l) => ({ id: l.id, cls: l.cls, description: l.description, qty: l.qty, rating: l.rating, poles: l.poles, basis: l.basis, uncertain: l.uncertain, evidence: l.evidence.slice(0, 1) })),
      reconciliation: c.reconciliation, gaps: c.gaps, questions: c.questions,
      estimate: (() => { const e = x.pricing.estimates.find((q) => q.cabinetId === c.id)!; return { totals: e.totals, lines: e.lines.slice(0, 80).map((l) => ({ id: l.id, category: l.category, description: l.description, qty: l.qty, unit: l.unit, status: l.status, unit_huf: l.unitHuf, total_huf: l.totalHuf, reasons: l.reasons.slice(0, 3), source: l.source ? { label: l.source.label, name: l.source.name, date: l.source.priceDate } : null, confidence: l.confidence })) }; })() })),
      adjustments: x.pricing.applied, diff: x.pricing.diff?.slice(0, 60) ?? null };
  }
  if (d.section === "findings") return { ...base, findings: slice(x.findings.map((f) => ({ id: f.id, category: f.category, severity: f.severity, title: f.title, rows: f.rows, evidence: f.evidence.slice(0, 3), question: f.question, impact: f.impact, status: f.status }))) };
  return { ...base, questions: slice(x.questions) };
}

export function registerPlanTools() {
  registerTool({ name: "crm_quote_plan_review", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: ["owner", "sales"],
    description: "P4 tervellenőrzés pontos quote_id alapján: tervjel/lap/revízió/szakág felismerés oldalszintű bizonyítékkal, feldolgozottsági mátrix, elosztó-BOM (nézeti rajz darabszám + kapcsolási rajz összevetés), szekrénykalkuláció külön anyag / összeszerelés-gyártás / helyszíni bekötés költségnemben (P3 motor), költségvetés–terv–leírás–e-mail eltéréslista és kérdéslista. budget_document_id: árazatlan költségvetés (quote_documents). section: overview|drawings|cabinets|findings|questions, page lapozás. rules: felhasználó által megadott normaórák (feltételezés). clarifications: email_id + szó szerinti idézet (a szerver ellenőrzi). Nem ment, nem küld.",
    parameters: { type: "object", additionalProperties: false, properties: {
      quote_id: { type: "string" }, budget_document_id: { type: "string" }, mode: { type: "string", enum: ["subcontractor_labor", "full_construction"] },
      section: { type: "string", enum: [...SECTIONS] }, cabinet_id: { type: "string" }, page: { type: "integer", minimum: 0 },
      overrides: { type: "object", additionalProperties: false, properties: { laborRateHuf: { type: "number" }, contingencyPct: { type: "number" }, marginPct: { type: "number" }, materialSurchargePct: { type: "number" }, laborSurchargePct: { type: "number" }, roundingStepHuf: { type: "integer" } } },
      rules: { type: "object", additionalProperties: false, properties: { assemblyHoursPerDevice: { type: "object" }, enclosureAssemblyHours: { type: "number" }, testDocHoursPerCabinet: { type: "number" }, siteMountHoursPerCabinet: { type: "number" }, siteFeederHoursPerCabinet: { type: "number" }, siteOutgoingHoursPerCircuit: { type: "number" }, siteMeasurementHoursPerCabinet: { type: "number" } } },
      adjustments: { type: "array", maxItems: 30, items: { type: "object", additionalProperties: false, required: ["id", "reason", "op"], properties: { id: { type: "string" }, reason: { type: "string" }, cabinetId: { type: "string" }, category: { type: "string", enum: ["material", "assembly", "site"] }, lineIds: { type: "array", items: { type: "string" } }, op: { type: "string", enum: ["contingency_pct", "add_amount", "remove_line", "set_unit_price"] }, pct: { type: "number" }, amountHuf: { type: "number" } } } },
      clarifications: { type: "array", maxItems: 20, items: { type: "object", additionalProperties: false, required: ["emailId", "quote"], properties: { emailId: { type: "string" }, quote: { type: "string" } } } },
    }, required: ["quote_id", "mode"] } },
  async (args, ctx) => {
    try { return { ok: true, data: await planReviewTool(args, ctx) }; }
    catch (e) { return toolError.fromException(e instanceof z.ZodError ? "Érvénytelen tervellenőrzési paraméter." : e instanceof Error && /Tulajdonos|nem hozzáférhető|nem olvasható|típusú|túl nagy|kulcs|normaóra/.test(e.message) ? e.message : "A tervellenőrzés most nem futtatható."); }
  });
}
