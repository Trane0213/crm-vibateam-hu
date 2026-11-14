/** P3 — Kapott költségvetés árazása (számítás + TERVEZET XLSX letöltés). Csak olvas; nem ment, nem küld. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import { priceBudgetInput } from "./pricing-schema";
import { lineDto, summaryDto } from "./pricing-dto";

export const priceReceivedBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => priceBudgetInput.parse(data))
  .handler(async ({ data, context }) => {
    const { priceQuoteBudget, PricingAccessError } = await import("./pricing.server");
    try {
      const r = await priceQuoteBudget(context.supabase as never, context.userId, data);
      const ex = r.output.exportResult;
      let workbookBase64: string | null = null;
      if (ex.status === "verified") { let s = ""; const b = ex.bytes; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); workbookBase64 = btoa(s); }
      return { ok: true as const, summary: summaryDto(r.output), lines: r.output.run.result.lines.slice(0, 3000).map(lineDto), linesTruncated: r.output.run.result.lines.length > 3000,
        template: r.template, sourcesUsed: r.sourcesUsed, quote: r.quote, workbookBase64 };
    } catch (e) {
      const known = e instanceof PricingAccessError || (e instanceof Error && /korlát|túl nagy|nem Excel|munkafüzet|ársablon|Érvénytelen|szükséges/.test(e.message));
      console.error("priceReceivedBudget failed", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: known ? (e as Error).message : "A költségvetés nem dolgozható fel (sérült, titkosított vagy nem támogatott fájl)." };
    }
  });
