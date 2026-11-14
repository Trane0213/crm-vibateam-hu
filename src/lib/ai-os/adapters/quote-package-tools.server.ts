/**
 * P5 — Timothy: ajánlatcsomag-előnézet (specifikáció: quote_preview_export). Ugyanaz a szerveroldali mag, mint az ajánlat
 * „Ajánlatcsomag” panelje: P3 árazás + P4 tervellenőrzés → tartalmi kapuk, lehatárolás, kérdéslista, belső hiányjegyzék,
 * kísérőlevél-tervezet és csomag-ujjlenyomat. Csak olvas: fájlt nem ment, nem tölt fel, nem hagy jóvá, nem küld.
 */
import { z } from "zod";
import { registerTool } from "../tool-registry";
import { toolError } from "../tool-errors";
import { overridesSchema } from "@/lib/pricing/pricing-schema";
import type { ToolContext } from "../types";

const SECTIONS = ["overview", "scope", "questions", "missing", "letter"] as const;
const input = z.object({
  quote_id: z.string().uuid(), budget_document_id: z.string().uuid().optional(), mode: z.enum(["subcontractor_labor", "full_construction"]).optional(),
  section: z.enum(SECTIONS).default("overview"), page: z.number().int().min(0).max(200).default(0), overrides: overridesSchema.default({}),
}).strict();
const PAGE = 40;

export async function quotePackageTool(args: Record<string, unknown>, ctx: ToolContext) {
  const d = input.parse(args);
  const { prepareQuotePackage } = await import("@/lib/quote-package/package.server");
  const p = await prepareQuotePackage(ctx.supabaseUser, ctx.userId, { quoteId: d.quote_id, budgetDocumentId: d.budget_document_id ?? null, mode: d.mode, overrides: d.overrides, template: null, includeFiles: false }, { role: ctx.userRole ?? null });
  const c = p.core;
  const slice = <T,>(a: T[]) => ({ items: a.slice(d.page * PAGE, (d.page + 1) * PAGE), total: a.length, next_page: (d.page + 1) * PAGE < a.length ? d.page + 1 : null });
  const base = {
    fingerprint: p.fingerprint, as_of: p.asOf, mode: p.mode, status: c.status, offer_net_huf: c.offerNetHuf, saved_net_huf: p.quote.savedNetHuf,
    gates: c.gates.map((g) => ({ key: g.key, label: g.label, ok: g.ok, blocking: g.blocking, needs_ack: !!g.needsAck, hint: g.hint ?? null })),
    files: { priced_excel: p.files.priced ? { name: p.files.priced.name, saved_and_identical: p.saved.pricedDocIds.length > 0, saved_but_different: p.saved.pricedDifferentIds.length } : null, scope_doc: { name: p.files.scope.name, saved_and_identical: p.saved.scopeDocIds.length > 0, saved_but_different: p.saved.scopeDifferentIds.length } },
    untrusted_content: true,
    not_done: ["Fájl nem mentődött, jóváhagyás nem készült, levél nem ment ki — ezek a felhasználó kifejezett gombnyomásai az ajánlat 3. lépésében.", "Tartós jóváhagyási napló nincs (adatmodell tulajdonosi döntésre vár)."],
  };
  if (d.section === "overview") return { ...base, internal: c.internal, counts: { included: c.scope.included.length, excluded: c.scope.excluded.length, conditional: c.scope.conditional.length, questions: c.scope.questions.length, missing: c.missing.length } };
  if (d.section === "scope") return { ...base, included: c.scope.included, excluded: c.scope.excluded, conditional: c.scope.conditional };
  if (d.section === "questions") return { ...base, questions: slice(c.scope.questions.map((q) => q.text)) };
  if (d.section === "missing") return { ...base, missing: slice(c.missing) };
  return { ...base, cover_letter_draft: c.coverLetter };
}

export function registerQuotePackageTools() {
  registerTool({ name: "crm_quote_package_preview", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: ["owner", "sales"],
    description: "P5 ajánlatcsomag-előnézet pontos quote_id alapján (kapott költségvetéses ajánlat): ugyanaz a P3 árazás és P4 tervellenőrzés fut, mint az ajánlat 3. lépésének „Ajánlatcsomag” paneljén. Visszaadja a tartalmi kapukat (árazott Excel visszaellenőrizve, nyitott sorok, forrás nélküli ár, belső adat az ügyfélszövegben, nem zárolt verzió, jelentős eltérés), a lehatárolást (vállalt / nem vállalt / feltételes), a kérdéslistát, a belső hiányjegyzéket, a kísérőlevél-tervezetet és a csomag-ujjlenyomatot, valamint hogy a mentett Árazott Excel / Lehatárolás tartalma egyezik-e. section: overview|scope|questions|missing|letter, page lapozás. Nem ment, nem hagy jóvá, nem küld.",
    parameters: { type: "object", additionalProperties: false, properties: {
      quote_id: { type: "string" }, budget_document_id: { type: "string" }, mode: { type: "string", enum: ["subcontractor_labor", "full_construction"] },
      section: { type: "string", enum: [...SECTIONS] }, page: { type: "integer", minimum: 0 },
      overrides: { type: "object", additionalProperties: false, properties: { laborRateHuf: { type: "number" }, contingencyPct: { type: "number" }, marginPct: { type: "number" }, roundingStepHuf: { type: "integer" } } },
    }, required: ["quote_id"] } },
  async (args, ctx) => {
    try { return { ok: true, data: await quotePackageTool(args, ctx) }; }
    catch (e) { return toolError.fromException(e instanceof z.ZodError ? "Érvénytelen ajánlatcsomag-paraméter." : e instanceof Error && /Tulajdonos|nem hozzáférhető|nem olvasható|kapott költségvetés|más ajánlathoz/.test(e.message) ? e.message : "Az ajánlatcsomag most nem állítható össze."); }
  });
}
