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
      const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
      if (ex.status === "verified") workbookBase64 = b64(ex.bytes);
      // Kitöltendő ártábla az ár nélküli / ellenőrizendő tételekből (teljes megnevezéssel, hogy a visszatöltés pontosan egyezzen).
      const { buildFillTemplateWorkbook } = await import("./template-import");
      const fill = buildFillTemplateWorkbook(r.output.run.result.lines, { asOf: r.output.run.result.asOf, mode: data.mode, budgetFileName: r.output.file.name });
      const fillTemplate = fill.rows ? { fileName: `${r.output.file.name.replace(/\.[^.]+$/, "")}_VIBA_kitoltendo_artabla.xlsx`, rows: fill.rows, base64: b64(fill.bytes) } : null;
      return { ok: true as const, summary: summaryDto(r.output), lines: r.output.run.result.lines.slice(0, 3000).map(lineDto), linesTruncated: r.output.run.result.lines.length > 3000,
        template: r.template, sourcesUsed: r.sourcesUsed, quote: r.quote, workbookBase64, fillTemplate };
    } catch (e) {
      const known = e instanceof PricingAccessError || (e instanceof Error && /korlát|túl nagy|nem Excel|munkafüzet|ársablon|Érvénytelen|szükséges|nem tölthető le/.test(e.message));
      console.error("priceReceivedBudget failed", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: known ? (e as Error).message : "A költségvetés feldolgozása nem sikerült. Ha a hiba ismétlődik, ellenőrizd, hogy a fájl megnyitható, nem jelszavas .xlsx-e." };
    }
  });
