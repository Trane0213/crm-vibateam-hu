/**
 * P3 — szerveroldali árazási futás egy ajánlat kapott költségvetésén.
 * Jogosultság: CRM-szerepkör Tulajdonos/Sales; az ajánlat és a dokumentum a hívó saját (RLS) jogán látható;
 * fájl csak ellenőrzött kulccsal, a meglévő R2-aláíróval. Írás, küldés, tárolás nincs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRICING_ROLES, type PriceBudgetInput } from "./pricing-schema";
import { runBudgetPricing } from "./run-budget-pricing";
import { importPriceTemplate } from "./template-import";
import { WORKBOOK_LIMITS } from "./workbook";
import type { PriceSourceItem } from "./price-sources";

export class PricingAccessError extends Error {}

export async function assertPricingRole(sb: SupabaseClient, userId: string, knownRole?: string | null): Promise<string> {
  let role = knownRole ?? null;
  if (!role) { const { data, error } = await sb.rpc("crm_role_of" as never, { _auth_user: userId } as never); if (error) throw new PricingAccessError("A szerepkör nem ellenőrizhető."); role = typeof data === "string" ? data : null; }
  if (!role || !(PRICING_ROLES as readonly string[]).includes(role.toLowerCase())) throw new PricingAccessError("Költségvetés-árazás csak Tulajdonos és Sales szerepkörben érhető el.");
  return role;
}

async function fetchR2(key: string, limit: number): Promise<Uint8Array> {
  const { presignR2Url } = await import("../r2.server");
  const res = await fetch(presignR2Url({ key, method: "GET", expiresIn: 60 }), { redirect: "error", signal: AbortSignal.timeout(20000) });
  if (!res.ok || !res.body) throw new Error("A fájl nem tölthető le a fájltárból.");
  if (Number(res.headers.get("content-length") ?? 0) > limit) { await res.body.cancel(); throw new Error("A munkafüzet túl nagy a számításhoz (20 MB felett)."); }
  const reader = res.body.getReader(), parts: Uint8Array[] = []; let total = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; total += value.length; if (total > limit) { await reader.cancel(); throw new Error("A munkafüzet túl nagy a számításhoz (20 MB felett)."); } parts.push(value); }
  const out = new Uint8Array(total); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const budPestDate = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Budapest", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function priceQuoteBudget(sb: SupabaseClient, userId: string, input: PriceBudgetInput, opts: { role?: string | null; download?: (key: string, limit: number) => Promise<Uint8Array>; referenceSources?: () => PriceSourceItem[] } = {}) {
  await assertPricingRole(sb, userId, opts.role);
  const q = await sb.from("quotes").select("id,quote_kind,locked_at").eq("id", input.quoteId).maybeSingle();
  if (q.error || !q.data) throw new PricingAccessError("Az ajánlat nem hozzáférhető.");
  const d = await sb.from("quote_documents").select("id,quote_id,name,file_url,size_bytes,document_type").eq("id", input.documentId).eq("quote_id", input.quoteId).maybeSingle();
  if (d.error || !d.data) throw new PricingAccessError("A dokumentum nem olvasható vagy más ajánlathoz tartozik.");
  const doc = d.data as { name: string; file_url: string | null; size_bytes: number | null; document_type: string | null };
  if (!["unpriced_budget", "priced_budget"].includes(String(doc.document_type))) throw new PricingAccessError("Csak árazatlan/árazott költségvetés-típusú dokumentum árazható.");
  const key = String(doc.file_url ?? "");
  if (!key || key.length > 1024 || key.includes("..") || key.startsWith("/") || key.includes("://")) throw new PricingAccessError("Érvénytelen tárolási kulcs.");
  if (Number(doc.size_bytes ?? 0) > WORKBOOK_LIMITS.bytes) throw new Error("A munkafüzet túl nagy a számításhoz (20 MB felett).");
  const bytes = await (opts.download ?? fetchR2)(key, WORKBOOK_LIMITS.bytes);
  const sources: PriceSourceItem[] = [];
  if (input.includeReference) sources.push(...(opts.referenceSources ?? (await import("./reference-kv11026.server")).kv11026ReferenceSources)());
  let template: { rowsRead: number; items: number; issues: { row: number; message: string }[]; file: string } | null = null;
  if (input.template) {
    const raw = Uint8Array.from(atob(input.template.base64), (c) => c.charCodeAt(0));
    if (raw.length > 2 * 1024 * 1024) throw new Error("Az ársablon legfeljebb 2 MB lehet.");
    const imp = importPriceTemplate(raw, input.template.name);
    sources.push(...imp.items);
    template = { rowsRead: imp.rowsRead, items: imp.items.length, issues: imp.issues.slice(0, 100), file: imp.fileLabel };
  }
  const output = await runBudgetPricing({ bytes, fileName: doc.name, mode: input.mode, overrides: input.overrides, sources, adjustments: input.adjustments, asOf: budPestDate(), buildWorkbook: input.buildWorkbook });
  return { output, template, quote: { id: input.quoteId, kind: (q.data as { quote_kind: string | null }).quote_kind, locked: !!(q.data as { locked_at: string | null }).locked_at }, sourcesUsed: { reference: input.includeReference, templateItems: template?.items ?? 0, total: sources.length } };
}
