import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/middleware";
import { builtInDefaults, defaultsValueSchema, saveDefaultsSchema, templateKeySchema } from "./template-defaults-schema";
import { canReadTemplateDefaults, canWriteTemplateDefaults } from "./templates";

export const getQuoteTemplateDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ key: templateKeySchema }).strict())
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (role.error || !canReadTemplateDefaults(role.data)) throw new Error("Nincs jogosultságod a sablonalapokhoz.");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const result = await getAdminClient().from("settings").select("value").eq("key", `quote_template:${data.key}`).maybeSingle();
    if (result.error) throw new Error("A sablonalap nem tölthető be.");
    return result.data ? defaultsValueSchema.parse(result.data.value) : builtInDefaults(data.key);
  });

export const saveQuoteTemplateDefaults = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(saveDefaultsSchema)
  .handler(async ({ context, data }) => {
    const role = await context.supabase.rpc("crm_role_of", { _auth_user: context.userId });
    if (role.error || !canWriteTemplateDefaults(role.data)) throw new Error("Sablonalapot csak tulajdonos menthet.");
    const { getAdminClient } = await import("@/integrations/supabase/server");
    const admin = getAdminClient();
    const key = `quote_template:${data.key}`;
    const value = { revision: data.expectedRevision + 1, terms: data.terms };
    // Atomic compare-and-set; unique key rejects competing first inserts.
    const result = data.expectedRevision === 0
      ? await admin.from("settings").insert({ key, value }).select("id")
      : await admin.from("settings").update({ value }).eq("key", key).eq("value->>revision", String(data.expectedRevision)).select("id");
    if (result.error || result.data?.length !== 1) throw new Error("A sablonalap időközben változott, vagy nem menthető. Töltsd újra.");
    return value;
  });