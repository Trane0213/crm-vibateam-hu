/** P5 — ajánlatcsomag-előnézet (árazott TERVEZET + lehatárolás + kérdések + kísérőlevél-tervezet). Csak olvas; nem ment, nem küld. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import { packageInput } from "./package-schema";

export const prepareQuotePackageFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => packageInput.parse(data))
  .handler(async ({ data, context }) => {
    const { prepareQuotePackage, PackageInputError } = await import("./package.server");
    const { packageDto } = await import("./package-dto");
    const { PricingAccessError } = await import("@/lib/pricing/pricing.server");
    try {
      return { ok: true as const, pkg: packageDto(await prepareQuotePackage(context.supabase as never, context.userId, data)) };
    } catch (e) {
      const known = e instanceof PricingAccessError || e instanceof PackageInputError;
      console.error("[quote-package] failed", e instanceof Error ? e.message : "unknown");
      return { ok: false as const, error: known ? (e as Error).message : "Az ajánlatcsomag most nem állítható össze." };
    }
  });
