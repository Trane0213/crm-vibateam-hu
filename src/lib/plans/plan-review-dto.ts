/** P4 — böngészőnek/AI-nak átadott, korlátozott méretű eredmény (belső kalkuláció; nem kerül ügyfélfájlba). */
import type { reviewQuotePlans } from "./plan-review.server";
type R = Awaited<ReturnType<typeof reviewQuotePlans>>;

export function planReviewDto(r: R) {
  const x = r.result;
  return {
    asOf: x.asOf, profile: r.profile, budgetFile: r.budgetFile, budgetWarnings: r.budgetWarnings, template: r.template,
    clarifications: { accepted: r.clarifications.accepted.map((c) => ({ ref: c.ref, from: c.from, date: c.date, text: c.text.slice(0, 400) })), rejected: r.clarifications.rejected },
    matrix: x.matrix, files: r.files.map((f) => ({ fileId: f.fileId, fileName: f.fileName, origin: f.origin, status: f.status, statusReason: f.statusReason ?? null, pageCount: f.pageCount })),
    drawings: x.drawings.slice(0, 200), unidentifiedPages: x.unidentifiedPages.slice(0, 200),
    pages: x.pageIdentities.slice(0, 400).map((p) => ({ fileId: p.fileId, fileName: p.fileName, page: p.page, readable: p.readable, drawingNo: p.drawingNo, sheetNo: p.sheetNo?.value ?? null, sheetTotal: p.sheetTotal?.value ?? null, revision: p.revision, date: p.date, docType: p.docType.value, discipline: p.discipline.value, title: p.title?.value ?? null, cabinetIds: p.cabinetIds.map((c) => c.id) })),
    cabinets: x.cabinets.map((c) => ({ ...c, lines: c.lines.slice(0, 300) })), estimates: x.pricing.estimates, adjustments: x.pricing.applied, diff: x.pricing.diff, rulesApproval: x.pricing.rulesApproval,
    findings: x.findings.slice(0, 300), findingsTotal: x.findings.length, questions: x.questions.slice(0, 120), completeness: x.completeness, limitations: x.limitations,
  };
}
export type PlanReviewDto = ReturnType<typeof planReviewDto>;
