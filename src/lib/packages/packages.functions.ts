// P1 – tervcsomag szerverfüggvények. Mind bejelentkezéshez kötött; a jogosultságot
// a packages.server.ts ellenőrzi a hívó saját (RLS-es) kliensével.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { PackageParent } from "./package-policy";

const parentIn = (p: any): PackageParent | null => (p && (p.kind === "project" || p.kind === "quote") && typeof p.id === "string" ? { kind: p.kind, id: p.id } : null);
const idIn = (v: any) => { if (typeof v !== "string" || v.length !== 36) throw new Error("Érvénytelen azonosító"); return v; };

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (e: any) {
    // A felhasználó emberi nyelvű üzenetet kap; a technikai részlet a szervernaplóba kerül.
    if (e?.name === "PackageError" || e?.name === "ProcessingError") throw new Error(e.message);
    console.error("[packages]", e?.message ?? e);
    throw new Error("A tárhely átmenetileg nem érhető el. A feltöltés később folytatható.");
  }
}
const svc = () => import("./packages.server");
const proc = () => import("./processing.server");
/** A CRM saját nyilvános címe (a feldolgozó ide küldi az aláírt visszajelzést). */
const originOf = () => { try { return new URL(getRequest().url).origin; } catch { return ""; } };

export const packageLimits = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .handler(async () => run(async () => (await svc()).loadLimits()));

export const listDocumentPackages = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { parent?: PackageParent | null }) => ({ parent: parentIn(i?.parent) }))
  .handler(async ({ data, context }) => run(async () => (await svc()).listPackages(context.supabase as any, context.userId, data.parent)));

export const listPackageFiles = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { packageId: string }) => ({ packageId: idIn(i?.packageId) }))
  .handler(async ({ data, context }) => run(async () => (await svc()).listPackageFiles(context.supabase as any, context.userId, data.packageId)));

export const createDocumentPackage = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { parent: PackageParent; title: string; source: string }) => {
    const parent = parentIn(i?.parent); if (!parent) throw new Error("Érvénytelen ügy");
    return { parent, title: String(i.title ?? ""), source: String(i.source ?? "files") };
  })
  .handler(async ({ data, context }) => run(async () => (await svc()).createPackage(context.supabase as any, context.userId, data)));

export const registerPackageFiles = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { packageId: string; files: { relativePath: string; size: number; lastModified: number; mime: string | null; sha256: string }[] }) => ({
    packageId: idIn(i?.packageId),
    files: (Array.isArray(i?.files) ? i.files : []).slice(0, 200).map((f) => ({
      relativePath: String(f.relativePath ?? ""), size: Number(f.size), lastModified: Number(f.lastModified) || 0,
      mime: f.mime ? String(f.mime) : null, sha256: String(f.sha256 ?? "").toLowerCase(),
    })),
  }))
  .handler(async ({ data, context }) => run(async () => (await svc()).registerFiles(context.supabase as any, context.userId, data.packageId, data.files)));

export const signPackageParts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { fileId: string; parts: number[] }) => ({ fileId: idIn(i?.fileId), parts: (Array.isArray(i?.parts) ? i.parts : []).map(Number) }))
  .handler(async ({ data, context }) => run(async () => (await svc()).signParts(context.supabase as any, context.userId, data.fileId, data.parts)));

export const recordPackageParts = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { fileId: string; parts: { partNumber: number; size: number; md5: string }[] }) => ({
    fileId: idIn(i?.fileId),
    parts: (Array.isArray(i?.parts) ? i.parts : []).map((p) => ({ partNumber: Number(p.partNumber), size: Number(p.size), md5: String(p.md5 ?? "").toLowerCase() })),
  }))
  .handler(async ({ data, context }) => run(async () => (await svc()).recordParts(context.supabase as any, context.userId, data.fileId, data.parts)));

export const completePackageFile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { fileId: string }) => ({ fileId: idIn(i?.fileId) }))
  .handler(async ({ data, context }) => run(async () => (await svc()).completeFile(context.supabase as any, context.userId, data.fileId, originOf())));

export const abortPackageFile = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { fileId: string }) => ({ fileId: idIn(i?.fileId) }))
  .handler(async ({ data, context }) => run(async () => (await svc()).abortFile(context.supabase as any, context.userId, data.fileId)));

// P2 – feldolgozás: jelentés és (újra)indítás. Az indítás a feltöltési joghoz kötött (meglévő szabály).
export const packageProcessingReport = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { packageId: string }) => ({ packageId: idIn(i?.packageId) }))
  .handler(async ({ data, context }) => run(async () => (await proc()).packageReport(context.supabase as any, data.packageId)));

export const startPackageProcessing = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((i: { packageId: string; fileIds?: string[] | null }) => ({
    packageId: idIn(i?.packageId),
    fileIds: Array.isArray(i?.fileIds) ? i.fileIds.slice(0, 200).map(idIn) : null,
  }))
  .handler(async ({ data, context }) => run(async () => (await proc()).retryFiles(context.supabase as any, context.userId, data.packageId, data.fileIds, originOf())));
