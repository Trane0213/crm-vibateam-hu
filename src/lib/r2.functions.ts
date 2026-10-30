import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// 1/C: minden R2-művelet bejelentkezéshez és dokumentum-szintű jogosultsághoz kötött.
// Tetszőleges kulcsra nem adunk ki aláírt hivatkozást: a kulcsnak egy olyan
// dokumentum- vagy mellékletrekordhoz kell tartoznia, amelyet a hívó a saját
// jogosultságával (RLS) lát.

const DOC_TABLES = ["project_documents", "company_documents"] as const;
type DocTable = (typeof DOC_TABLES)[number];

export const r2PresignDownload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { key: string }) => {
    if (!input || typeof input.key !== "string" || !input.key || input.key.length > 1024 || input.key.includes("..")) {
      throw new Error("Érvénytelen fájlkulcs");
    }
    return { key: input.key };
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const checks = await Promise.all([
      sb.from("project_documents").select("id").eq("file_url", data.key).limit(1),
      sb.from("company_documents").select("id").eq("file_url", data.key).limit(1),
      sb.from("email_attachments").select("id").eq("r2_key", data.key).limit(1),
    ]);
    const visible = checks.some((r: any) => !r.error && (r.data?.length ?? 0) > 0);
    if (!visible) throw new Error("Nincs jogosultságod ehhez a fájlhoz.");
    const { presignR2Url } = await import("./r2.server");
    const url = presignR2Url({ method: "GET", key: data.key, expiresIn: 300 });
    return { url, expiresIn: 300 };
  });

/**
 * Dokumentum törlése: előbb a rekord (a hívó jogosultságával), csak sikeres
 * rekordtörlés után a fizikai fájl — és csak ha más rekord nem hivatkozik rá.
 */
export const r2DeleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { table: DocTable; id: string }) => {
    if (!input || !DOC_TABLES.includes(input.table) || typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) {
      throw new Error("Érvénytelen törlési kérés");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const sb = context.supabase as any;
    const { data: gone, error } = await sb.from(data.table).delete().eq("id", data.id).select("file_url");
    if (error) throw new Error(error.message);
    if (!gone?.length) throw new Error("Nincs jogosultságod ennek a dokumentumnak a törléséhez.");
    const key: string | null = gone[0]?.file_url ?? null;
    if (!key) return { ok: true, fileDeleted: false };
    const { getAdminClient } = await import("./gmail/admin.server");
    const admin = getAdminClient();
    const refs = await Promise.all([
      admin.from("project_documents").select("id", { count: "exact", head: true }).eq("file_url", key),
      admin.from("company_documents").select("id", { count: "exact", head: true }).eq("file_url", key),
      admin.from("email_attachments").select("id", { count: "exact", head: true }).eq("r2_key", key),
    ]);
    if (refs.some((r) => r.error || (r.count ?? 0) > 0)) return { ok: true, fileDeleted: false };
    const { presignR2Url } = await import("./r2.server");
    const res = await fetch(presignR2Url({ method: "DELETE", key, expiresIn: 60 }), { method: "DELETE" });
    return { ok: true, fileDeleted: res.ok || res.status === 204 };
  });

export const r2GetStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { r2Status } = await import("./r2.server");
    return r2Status();
  });
