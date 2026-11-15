import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import { TARGET_AREAS, canReadTargets, canWriteTargets, monthSchema, parseTarget, saveTargetSchema, targetKey } from "./targets";

/** Havi célok olvasása (Owner/Sales/Marketing). A settings tábla kliensről nem érhető el, ezért szerveroldali olvasás szerepkör-ellenőrzés után. */
export const getMonthlyTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ month: monthSchema }).strict())
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (role.error || !canReadTargets(role.data)) throw new Error("Nincs jogosultságod a havi célokhoz.");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const keys = TARGET_AREAS.map((a) => targetKey(a, data.month));
    const res = await getAdminClient().from("settings").select("key,value").in("key", keys);
    if (res.error) throw new Error("A havi célok nem tölthetők be.");
    const byKey = new Map((res.data ?? []).map((r) => [r.key, r.value]));
    return {
      canEdit: canWriteTargets(role.data),
      sales: parseTarget(byKey.get(targetKey("sales", data.month))),
      marketing: parseTarget(byKey.get(targetKey("marketing", data.month))),
    };
  });

/** Havi cél mentése — kizárólag tulajdonos; atomikus compare-and-set a revision alapján. */
export const saveMonthlyTarget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(saveTargetSchema)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (role.error || !canWriteTargets(role.data)) throw new Error("Havi célt csak tulajdonos állíthat be.");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const admin = getAdminClient();
    const key = targetKey(data.area, data.month);
    const value = { revision: data.expectedRevision + 1, amount: data.amount };
    const result = data.expectedRevision === 0
      ? await admin.from("settings").insert({ key, value }).select("id")
      : await admin.from("settings").update({ value }).eq("key", key).eq("value->>revision", String(data.expectedRevision)).select("id");
    if (result.error || result.data?.length !== 1) throw new Error("A havi cél időközben változott, vagy nem menthető. Töltsd újra.");
    return value;
  });
