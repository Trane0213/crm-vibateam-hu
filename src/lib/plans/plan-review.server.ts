/**
 * P4 — szerveroldali tervellenőrzés egy ajánlathoz. Jogosultság: Tulajdonos/Sales (mint a P3 árazásnál);
 * az ajánlat, a dokumentumok, a csomagfájlok és az e-mailek a hívó saját RLS-ével olvasva. Írás, küldés, tárolás nincs.
 * E-mailes pontosítás csak akkor számít, ha a megadott idézet szó szerint szerepel egy, a hívó jogosult postafiókjához
 * tartozó és ehhez az ügyhöz (lead/cég/projekt) kötött levélben.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPricingRole, budPestDate, fetchR2, PricingAccessError } from "@/lib/pricing/pricing.server";
import { resolveProfile } from "@/lib/pricing/profiles";
import type { PriceSourceItem } from "@/lib/pricing/price-sources";
import { EMPTY_CABINET_RULES, type CabinetRules } from "./cabinet-pricing";
import { loadPlanPages, type Download } from "./plan-source.server";
import type { PlanReviewRequest } from "./plan-review-schema";
import { runPlanReview } from "./plan-review";
import type { Clarification } from "./scope-check";

type Sb = SupabaseClient<any, any, any>;
const squash = (s: string) => s.toLowerCase().normalize("NFC").replace(/\s+/g, " ").trim();

export async function verifyClarifications(sb: Sb, quote: { lead_id: string | null; project_id: string | null }, items: PlanReviewRequest["clarifications"]) {
  const accepted: Clarification[] = [], rejected: { emailId: string; reason: string }[] = [];
  if (!items.length) return { accepted, rejected };
  const mb = await sb.rpc("crm_mailboxes");
  if (mb.error || !Array.isArray(mb.data)) return { accepted, rejected: items.map((i) => ({ emailId: i.emailId, reason: "A postafiók-hozzáférés nem ellenőrizhető." })) };
  const allowed = new Set((mb.data as { userId?: string; user_id?: string }[]).map((m) => m.userId ?? m.user_id).filter(Boolean));
  let companyId: string | null = null;
  if (quote.lead_id) { const l = await sb.from("leads").select("company_id").eq("id", quote.lead_id).maybeSingle(); companyId = (l.data?.company_id as string | null) ?? null; }
  const ids = [...new Set(items.map((i) => i.emailId))];
  const em = await sb.from("emails").select("id,body,snippet,from_email,internal_date,owner_user_id,company_id,lead_id,project_id").in("id", ids);
  const byId = new Map((em.data ?? []).map((e: any) => [e.id as string, e]));
  for (const it of items) {
    const e = byId.get(it.emailId);
    if (!e) { rejected.push({ emailId: it.emailId, reason: "A levél nem látható." }); continue; }
    if (!allowed.has(e.owner_user_id)) { rejected.push({ emailId: it.emailId, reason: "A levél nem jogosult postafiókból származik." }); continue; }
    const inScope = (quote.lead_id && e.lead_id === quote.lead_id) || (quote.project_id && e.project_id === quote.project_id) || (companyId && e.company_id === companyId);
    if (!inScope) { rejected.push({ emailId: it.emailId, reason: "A levél nem ehhez az ügyhöz (lead/cég/projekt) kötött." }); continue; }
    if (!squash(String(e.body ?? e.snippet ?? "")).includes(squash(it.quote))) { rejected.push({ emailId: it.emailId, reason: "Az idézet nem szerepel szó szerint a levélben." }); continue; }
    accepted.push({ ref: `email:${e.id}`, emailId: e.id, date: e.internal_date ?? null, from: e.from_email ?? null, text: it.quote });
  }
  return { accepted, rejected };
}

export function rulesFrom(input: PlanReviewRequest["rules"]): CabinetRules {
  if (!input) return EMPTY_CABINET_RULES;
  const n = (v: number | null | undefined) => (v == null ? null : v);
  const r: CabinetRules = { assemblyHoursPerDevice: { ...(input.assemblyHoursPerDevice ?? {}) }, enclosureAssemblyHours: n(input.enclosureAssemblyHours), testDocHoursPerCabinet: n(input.testDocHoursPerCabinet),
    siteMountHoursPerCabinet: n(input.siteMountHoursPerCabinet), siteFeederHoursPerCabinet: n(input.siteFeederHoursPerCabinet), siteOutgoingHoursPerCircuit: n(input.siteOutgoingHoursPerCircuit), siteMeasurementHoursPerCabinet: n(input.siteMeasurementHoursPerCabinet), approval: "user_assumption" };
  const any = Object.keys(r.assemblyHoursPerDevice).length || [r.enclosureAssemblyHours, r.testDocHoursPerCabinet, r.siteMountHoursPerCabinet, r.siteFeederHoursPerCabinet, r.siteOutgoingHoursPerCircuit, r.siteMeasurementHoursPerCabinet].some((v) => v != null);
  return any ? r : EMPTY_CABINET_RULES;
}

export async function reviewQuotePlans(sb: Sb, userId: string, input: PlanReviewRequest, opts: { role?: string | null; download?: Download; referenceSources?: () => PriceSourceItem[] } = {}) {
  await assertPricingRole(sb, userId, opts.role);
  const q = await sb.from("quotes").select("id,quote_kind,lead_id,project_id").eq("id", input.quoteId).maybeSingle();
  if (q.error || !q.data) throw new PricingAccessError("Az ajánlat nem hozzáférhető.");
  const download = opts.download ?? fetchR2;
  let budget: Parameters<typeof runPlanReview>[0]["budget"] = null; const budgetWarnings: string[] = [];
  if (input.budgetDocumentId) {
    const d = await sb.from("quote_documents").select("id,name,file_url,size_bytes,document_type").eq("id", input.budgetDocumentId).eq("quote_id", input.quoteId).maybeSingle();
    if (d.error || !d.data) throw new PricingAccessError("A költségvetés nem olvasható vagy más ajánlathoz tartozik.");
    if (!["unpriced_budget", "priced_budget"].includes(String(d.data.document_type))) throw new PricingAccessError("Csak árazatlan/árazott költségvetés-típusú dokumentum jelölhető ki.");
    const key = String(d.data.file_url ?? "");
    if (!key || key.length > 1024 || key.includes("..") || key.startsWith("/") || key.includes("://")) throw new PricingAccessError("Érvénytelen tárolási kulcs.");
    const [{ readWorkbook, WORKBOOK_LIMITS }, { WorkbookEvaluator }, { extractBudget }] = await Promise.all([import("@/lib/pricing/workbook"), import("@/lib/pricing/formula"), import("@/lib/pricing/budget-extract")]);
    const bytes = await download(key, WORKBOOK_LIMITS.bytes);
    const wb = readWorkbook(bytes, String(d.data.name));
    budgetWarnings.push(...wb.warnings);
    budget = { extract: extractBudget(wb.model, new WorkbookEvaluator(wb.model)), fileName: String(d.data.name) };
  }
  const { files, pages } = await loadPlanPages(sb, input.quoteId, download);
  const clar = await verifyClarifications(sb, q.data as { lead_id: string | null; project_id: string | null }, input.clarifications);
  const sources: PriceSourceItem[] = [...(opts.referenceSources ?? (await import("@/lib/pricing/reference-kv11026.server")).kv11026ReferenceSources)()];
  let template: { items: number; issues: number } | null = null;
  if (input.template) {
    const raw = Uint8Array.from(atob(input.template.base64), (c) => c.charCodeAt(0));
    if (raw.length > 2 * 1024 * 1024) throw new Error("Az ársablon legfeljebb 2 MB lehet.");
    const { importPriceTemplate } = await import("@/lib/pricing/template-import");
    const imp = importPriceTemplate(raw, input.template.name); sources.push(...imp.items); template = { items: imp.items.length, issues: imp.issues.length };
  }
  const profile = resolveProfile(input.mode, input.overrides);
  const result = runPlanReview({ files, pages, budget, clarifications: clar.accepted, sources, profile, rules: rulesFrom(input.rules), asOf: budPestDate(), adjustments: input.adjustments });
  return { result, files, budgetFile: budget?.fileName ?? null, budgetWarnings, clarifications: clar, template, profile: { id: profile.id, label: profile.label, mode: profile.mode, laborRateHuf: profile.laborRateHuf, contingencyPct: profile.contingencyPct, marginPct: profile.marginPct } };
}
