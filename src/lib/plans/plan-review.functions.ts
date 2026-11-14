/** P4 — Tervellenőrzés és szekrénykalkuláció egy ajánlathoz. Csak olvas és számol; nem ment, nem küld. */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import { planReviewInput } from "./plan-review-schema";
import { planReviewDto } from "./plan-review-dto";

export const reviewPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => planReviewInput.parse(data))
  .handler(async ({ data, context }) => {
    const { reviewQuotePlans } = await import("./plan-review.server");
    const { PricingAccessError } = await import("@/lib/pricing/pricing.server");
    try {
      const r = await reviewQuotePlans(context.supabase as never, context.userId, data);
      return { ok: true as const, review: planReviewDto(r) };
    } catch (e) {
      const known = e instanceof PricingAccessError || (e instanceof Error && /korlát|túl nagy|nem Excel|munkafüzet|ársablon|Érvénytelen|szükséges|normaóra/.test(e.message));
      console.error("[plan-review] failed", e instanceof Error ? e.message : e);
      return { ok: false as const, error: known && e instanceof Error ? e.message : "A tervellenőrzés most nem futtatható." };
    }
  });
