// P1 – tervcsomag-szolgáltatás (csak szerver). Minden művelet előtt a hívó saját
// (RLS-es) kliensével ellenőrizzük a szülő ügy láthatóságát és a feltöltési jogot;
// az írás ezután a szerver adminkliensével történik. A böngésző a csomagtáblákat
// csak olvashatja.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canUploadPackage, checkPackageFile, fileFingerprint, fileKindOf, initialProcessingStatus, isMd5, isSha256, isUuid,
  normalizeRelativePath, baseName, packageObjectKey, partRange, planParts, resolveLimits,
  type PackageLimits, type PackageParent, type PackageParentKind, type RegisterResult,
} from "./package-policy";
export type { RegisterResult } from "./package-policy";

export class PackageError extends Error { constructor(message: string, public status = 400, public code = "bad_request") { super(message); this.name = "PackageError"; } }

type Sb = SupabaseClient<any, any, any>;
const admin = async (): Promise<Sb> => (await import("@/integrations/supabase/client.server")).supabaseAdmin as unknown as Sb;
const r2 = () => import("./r2-multipart.server");

/** A csomagtáblák még nincsenek az adatbázisban (jóváhagyásra váró migráció). */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "42P01" || err.code === "PGRST205" || /does not exist|Could not find the table/i.test(err.message ?? "");
}
const NOT_READY = () => new PackageError("A tervcsomag-feltöltés aktiválásra vár (tulajdonosi jóváhagyás).", 503, "not_ready");

export async function callerRole(sb: Sb, userId: string): Promise<{ isOwner: boolean; role: string | null }> {
  const [{ data: isOwner }, { data: role }] = await Promise.all([
    sb.rpc("is_owner_role", { _auth_user: userId }), sb.rpc("crm_role_of", { _auth_user: userId }),
  ]);
  return { isOwner: !!isOwner, role: role ? String(role) : null };
}

export async function assertParentVisible(sb: Sb, parent: PackageParent): Promise<void> {
  if (!isUuid(parent.id) || (parent.kind !== "project" && parent.kind !== "quote")) throw new PackageError("Érvénytelen ügy");
  const table = parent.kind === "project" ? "projects" : "quotes";
  const { data, error } = await sb.from(table).select("id").eq("id", parent.id).maybeSingle();
  if (error || !data) throw new PackageError("Az ügy nem található vagy nem elérhető", 403, "forbidden");
}

export async function assertCanUpload(sb: Sb, userId: string, parent: PackageParent): Promise<void> {
  await assertParentVisible(sb, parent);
  const { isOwner, role } = await callerRole(sb, userId);
  if (!canUploadPackage(parent.kind, role, isOwner)) throw new PackageError("Ehhez az ügyhöz nincs feltöltési jogosultságod", 403, "forbidden");
}

export async function loadLimits(): Promise<PackageLimits> {
  const a = await admin();
  const { data } = await a.from("settings").select("value").eq("key", "document_package_limits").maybeSingle();
  return resolveLimits(data?.value);
}

async function logEvent(a: Sb, packageId: string, fileId: string | null, actor: string, event: string, detail: Record<string, unknown> = {}) {
  await a.from("package_upload_events").insert({ package_id: packageId, file_id: fileId, actor, event, detail });
}

type PkgRow = { id: string; parent_kind: PackageParentKind; project_id: string | null; quote_id: string | null; title: string; created_by: string };
const parentOf = (p: PkgRow): PackageParent => ({ kind: p.parent_kind, id: (p.project_id ?? p.quote_id)! });

/** Csomag betöltése a hívó jogával (RLS) – ha nem látja, nem létezik számára. */
async function visiblePackage(sb: Sb, packageId: string): Promise<PkgRow> {
  if (!isUuid(packageId)) throw new PackageError("Érvénytelen csomag");
  const { data, error } = await sb.from("document_packages").select("id,parent_kind,project_id,quote_id,title,created_by").eq("id", packageId).maybeSingle();
  if (isMissingTable(error)) throw NOT_READY();
  if (error || !data) throw new PackageError("A csomag nem található vagy nem elérhető", 403, "forbidden");
  return data as PkgRow;
}

type FileRow = {
  id: string; package_id: string; relative_path: string; name: string; size_bytes: number; sha256: string; r2_key: string | null;
  upload_id: string | null; part_size: number | null; part_count: number | null; status: string; uploaded_by: string;
};
/** Saját, folyamatban lévő feltöltés (csak a feltöltő folytathatja / szakíthatja meg; tulajdonos megszakíthatja). */
async function ownOpenFile(sb: Sb, userId: string, fileId: string, allowOwner = false): Promise<FileRow> {
  if (!isUuid(fileId)) throw new PackageError("Érvénytelen fájl");
  const { data, error } = await sb.from("package_files")
    .select("id,package_id,relative_path,name,size_bytes,sha256,r2_key,upload_id,part_size,part_count,status,uploaded_by").eq("id", fileId).maybeSingle();
  if (isMissingTable(error)) throw NOT_READY();
  if (error || !data) throw new PackageError("A fájl nem található vagy nem elérhető", 403, "forbidden");
  const f = data as FileRow;
  if (f.uploaded_by !== userId) {
    if (!allowOwner || !(await callerRole(sb, userId)).isOwner) throw new PackageError("Ezt a feltöltést más indította", 403, "forbidden");
  }
  if (f.status !== "uploading" || !f.upload_id || !f.r2_key || !f.part_size || !f.part_count) throw new PackageError("A fájl feltöltése nem folytatható", 409, "not_open");
  return f;
}

export async function createPackage(sb: Sb, userId: string, input: { parent: PackageParent; title: string; source: string }) {
  await assertCanUpload(sb, userId, input.parent);
  const title = String(input.title ?? "").trim().slice(0, 200) || "Dokumentáció";
  const source = ["files", "folder", "zip", "mixed"].includes(input.source) ? input.source : "files";
  const a = await admin();
  const row = { parent_kind: input.parent.kind, project_id: input.parent.kind === "project" ? input.parent.id : null,
    quote_id: input.parent.kind === "quote" ? input.parent.id : null, title, source, created_by: userId };
  const { data, error } = await a.from("document_packages").insert(row).select("id").single();
  if (isMissingTable(error)) throw NOT_READY();
  if (error || !data) throw new PackageError("A csomag nem hozható létre", 500, "storage");
  await logEvent(a, data.id, null, userId, "package_created", { source, title });
  return { packageId: data.id as string };
}

export type RegisterInput = { relativePath: string; size: number; lastModified: number; mime: string | null; sha256: string };

/** Fájlok regisztrálása: kvóta, duplikáció, verzió (zárolt SQL-függvény), majd R2 többrészes munkamenet. */
export async function registerFiles(sb: Sb, userId: string, packageId: string, files: RegisterInput[]): Promise<RegisterResult[]> {
  if (!Array.isArray(files) || files.length === 0 || files.length > 200) throw new PackageError("Egyszerre 1–200 fájl regisztrálható");
  const pkg = await visiblePackage(sb, packageId);
  await assertCanUpload(sb, userId, parentOf(pkg));
  const limits = await loadLimits();
  const a = await admin();
  const out: RegisterResult[] = [];
  for (const f of files) {
    let path: string;
    try { path = normalizeRelativePath(f.relativePath); } catch { out.push({ relativePath: String(f.relativePath), action: "reject", reason: "bad_path" }); continue; }
    const problem = checkPackageFile({ relativePath: path, size: f.size }, limits);
    if (problem || !isSha256(f.sha256)) {
      out.push({ relativePath: path, action: "reject", reason: !isSha256(f.sha256) ? "integrity" : f.size > limits.maxFileBytes ? "file_too_large" : "not_allowed_type" });
      continue;
    }
    const { partSize, partCount } = planParts(f.size);
    const { data: dec, error } = await a.rpc("document_package_register_file", {
      p_package: packageId, p_user: userId, p_relative_path: path, p_name: baseName(path), p_size: f.size,
      p_mime: f.mime ? String(f.mime).slice(0, 200) : null, p_kind: fileKindOf(path), p_sha256: f.sha256,
      p_fingerprint: fileFingerprint({ relativePath: path, size: f.size, lastModified: f.lastModified }),
      p_part_size: partSize, p_part_count: partCount, p_processing: initialProcessingStatus(path),
      p_max_file: limits.maxFileBytes, p_max_parent: limits.maxParentBytes, p_max_files: limits.maxFilesPerPackage,
    });
    if (isMissingTable(error) || error?.code === "PGRST202") throw NOT_READY();
    if (error || !dec) throw new PackageError("A fájl nem regisztrálható", 500, "storage");
    const d = dec as { action: string; file_id?: string; of_path?: string; reason?: string; status?: string; revision_no?: number };
    if (d.action === "reject") { out.push({ relativePath: path, action: "reject", reason: d.reason ?? "rejected" }); continue; }
    if (d.action === "duplicate") { out.push({ relativePath: path, action: "duplicate", fileId: d.file_id!, ofPath: d.of_path ?? null }); await logEvent(a, packageId, d.file_id!, userId, "duplicate", { path }); continue; }
    if (d.action === "resume") {
      if (d.status === "verified") { out.push({ relativePath: path, action: "verified", fileId: d.file_id! }); continue; }
      out.push({ relativePath: path, ...(await resumeState(sb, a, userId, d.file_id!)) });
      continue;
    }
    // Új feltöltés: kulcs a szerveren, többrészes munkamenet az R2-ben.
    const fileId = d.file_id!;
    const key = packageObjectKey({ parent: parentOf(pkg), packageId, fileId, name: path });
    try {
      const uploadId = await (await r2()).createMultipart(key, f.mime || "application/octet-stream");
      const { error: upErr } = await a.from("package_files").update({ r2_key: key, upload_id: uploadId, status: "uploading" }).eq("id", fileId).eq("status", "pending");
      if (upErr) throw upErr;
    } catch {
      await a.from("package_files").update({ status: "failed", error_code: "storage" }).eq("id", fileId);
      out.push({ relativePath: path, action: "reject", reason: "storage" });
      continue;
    }
    await logEvent(a, packageId, fileId, userId, "upload_started", { path, size: f.size, partCount, revision: d.revision_no ?? 1 });
    out.push({ relativePath: path, action: "upload", fileId, partSize, partCount, doneParts: [], revisionNo: d.revision_no });
  }
  return out;
}

/**
 * Folytatási állapot: csak az a darab számít késznek, amelyik az R2-ben megvan ÉS
 * a rögzített kliens-MD5 egyezik az R2 ETag-jével és a várt mérettel.
 */
async function resumeState(sb: Sb, a: Sb, userId: string, fileId: string) {
  const f = await ownOpenFile(sb, userId, fileId);
  const [r2Parts, { data: rec }] = await Promise.all([
    (await r2()).listParts(f.r2_key!, f.upload_id!),
    a.from("package_file_parts").select("part_number,size_bytes,md5").eq("file_id", fileId),
  ]);
  const recorded = new Map((rec ?? []).map((p: any) => [p.part_number as number, p]));
  const done = r2Parts.filter((p) => {
    const r = recorded.get(p.partNumber);
    if (!r) return false;
    const { start, end } = partRange(f.size_bytes, f.part_size!, p.partNumber);
    return r.md5 === p.etag && Number(r.size_bytes) === end - start && p.size === end - start;
  }).map((p) => p.partNumber);
  await logEvent(a, f.package_id, fileId, userId, "upload_resumed", { done: done.length, of: f.part_count });
  return { action: "resume" as const, fileId, partSize: f.part_size!, partCount: f.part_count!, doneParts: done };
}

export async function signParts(sb: Sb, userId: string, fileId: string, parts: number[]) {
  const f = await ownOpenFile(sb, userId, fileId);
  if (!Array.isArray(parts) || !parts.length || parts.length > 100) throw new PackageError("Egyszerre 1–100 darab írható alá");
  const m = await r2();
  return parts.map((n) => {
    if (!Number.isInteger(n) || n < 1 || n > f.part_count!) throw new PackageError("Érvénytelen darabszám");
    return { partNumber: n, url: m.presignPart(f.r2_key!, f.upload_id!, n, 3600) };
  });
}

export async function recordParts(sb: Sb, userId: string, fileId: string, parts: { partNumber: number; size: number; md5: string; etag?: string | null }[]) {
  const f = await ownOpenFile(sb, userId, fileId);
  if (!Array.isArray(parts) || !parts.length || parts.length > 100) throw new PackageError("Egyszerre 1–100 darab rögzíthető");
  const rows = parts.map((p) => {
    if (!Number.isInteger(p.partNumber) || p.partNumber < 1 || p.partNumber > f.part_count!) throw new PackageError("Érvénytelen darabszám");
    const { start, end } = partRange(f.size_bytes, f.part_size!, p.partNumber);
    if (p.size !== end - start || !isMd5(p.md5)) throw new PackageError("A darab adatai nem egyeznek", 422, "integrity");
    return { file_id: fileId, part_number: p.partNumber, size_bytes: p.size, md5: p.md5, etag: p.etag ?? null, recorded_at: new Date().toISOString() };
  });
  const a = await admin();
  const { error } = await a.from("package_file_parts").upsert(rows, { onConflict: "file_id,part_number" });
  if (error) throw new PackageError("A darab nem rögzíthető", 500, "storage");
  return { ok: true, recorded: rows.length };
}

/** Lezárás: minden darab megvan, MD5 = ETag, méretek stimmelnek → R2 összefűzés → méretellenőrzés → ellenőrzött. */
export async function completeFile(sb: Sb, userId: string, fileId: string) {
  const f = await ownOpenFile(sb, userId, fileId);
  const a = await admin();
  const m = await r2();
  const [r2Parts, { data: rec }] = await Promise.all([
    m.listParts(f.r2_key!, f.upload_id!),
    a.from("package_file_parts").select("part_number,size_bytes,md5").eq("file_id", fileId),
  ]);
  const recorded = new Map((rec ?? []).map((p: any) => [p.part_number as number, p]));
  const byNo = new Map(r2Parts.map((p) => [p.partNumber, p]));
  const bad: number[] = [];
  for (let n = 1; n <= f.part_count!; n++) {
    const { start, end } = partRange(f.size_bytes, f.part_size!, n);
    const p = byNo.get(n), r = recorded.get(n);
    if (!p || !r || p.etag !== r.md5 || p.size !== end - start || Number(r.size_bytes) !== end - start) bad.push(n);
  }
  if (bad.length) {
    await a.from("package_file_parts").delete().eq("file_id", fileId).in("part_number", bad);
    await logEvent(a, f.package_id, fileId, userId, "integrity_retry", { parts: bad.slice(0, 50), count: bad.length });
    return { ok: false as const, badParts: bad };
  }
  await m.completeMultipart(f.r2_key!, f.upload_id!, r2Parts.filter((p) => p.partNumber <= f.part_count!).map((p) => ({ partNumber: p.partNumber, etag: p.etag })));
  const head = await m.headObject(f.r2_key!);
  if (!head || head.size !== f.size_bytes) {
    await a.from("package_files").update({ status: "failed", error_code: "integrity", upload_id: null }).eq("id", fileId);
    await logEvent(a, f.package_id, fileId, userId, "integrity_failed", { expected: f.size_bytes, got: head?.size ?? null });
    return { ok: false as const, badParts: [], failed: true };
  }
  const { error } = await a.from("package_files").update({ status: "verified", upload_id: null, verified_at: new Date().toISOString(), error_code: null }).eq("id", fileId).eq("status", "uploading");
  if (error) throw new PackageError("A fájl állapota nem menthető", 500, "storage");
  await logEvent(a, f.package_id, fileId, userId, "upload_verified", { size: f.size_bytes, sha256: f.sha256, parts: f.part_count });
  return { ok: true as const };
}

export async function abortFile(sb: Sb, userId: string, fileId: string) {
  const f = await ownOpenFile(sb, userId, fileId, true);
  try { await (await r2()).abortMultipart(f.r2_key!, f.upload_id!); } catch { /* a tárhely 7 nap után magától is törli */ }
  const a = await admin();
  await a.from("package_files").update({ status: "aborted", upload_id: null }).eq("id", fileId).eq("status", "uploading");
  await logEvent(a, f.package_id, fileId, userId, "upload_aborted", {});
  return { ok: true };
}

/** Tartalék út (szerveres továbbítás) egy darabra – csak saját, nyitott feltöltésre, pontos mérettel és MD5-tel. */
export async function relayPart(sb: Sb, userId: string, fileId: string, partNumber: number, md5: string, body: ArrayBuffer) {
  const f = await ownOpenFile(sb, userId, fileId);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > f.part_count!) throw new PackageError("Érvénytelen darabszám");
  const { start, end } = partRange(f.size_bytes, f.part_size!, partNumber);
  if (body.byteLength !== end - start) throw new PackageError("A darab mérete nem egyezik", 422, "integrity");
  const { createHash } = await import("crypto");
  const got = createHash("md5").update(new Uint8Array(body)).digest("hex");
  if (!isMd5(md5) || got !== md5) throw new PackageError("A darab sérült az átvitel közben", 422, "integrity");
  const etag = await (await r2()).putPartRelay(f.r2_key!, f.upload_id!, partNumber, body);
  if (etag !== got) throw new PackageError("A tárhely eltérő adatot rögzített", 502, "integrity");
  const a = await admin();
  await a.from("package_file_parts").upsert({ file_id: fileId, part_number: partNumber, size_bytes: body.byteLength, md5: got, etag, recorded_at: new Date().toISOString() }, { onConflict: "file_id,part_number" });
  return { ok: true, etag };
}

export type { PackageSummary, PackageFileView } from "./package-policy";
import type { PackageSummary, PackageFileView } from "./package-policy";

async function pagedFiles(sb: Sb, cols: string, filter: (q: any) => any, cap = 20_000): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await filter(sb.from("package_files").select(cols)).order("created_at").order("id").range(from, from + 999);
    if (isMissingTable(error)) throw NOT_READY();
    if (error) throw new PackageError("A fájllista nem olvasható", 500, "storage");
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Csomaglista a hívó jogával; parent nélkül minden látható csomag (dokumentumtár). */
export async function listPackages(sb: Sb, userId: string, parent: PackageParent | null) {
  let q = sb.from("document_packages").select("id,parent_kind,project_id,quote_id,title,source,created_at,created_by,projects(title),quotes(title)").order("created_at", { ascending: false }).limit(200);
  if (parent) {
    await assertParentVisible(sb, parent);
    q = parent.kind === "project" ? q.eq("project_id", parent.id) : q.eq("quote_id", parent.id);
  }
  const { data, error } = await q;
  if (isMissingTable(error)) return { available: false as const, packages: [] as PackageSummary[] };
  if (error) throw new PackageError("A csomaglista nem olvasható", 500, "storage");
  const pkgs = (data ?? []) as any[];
  const files = pkgs.length ? await pagedFiles(sb, "package_id,status,size_bytes", (x) => x.in("package_id", pkgs.map((p) => p.id))) : [];
  const agg = new Map<string, PackageSummary>();
  for (const p of pkgs) agg.set(p.id, {
    id: p.id, parentKind: p.parent_kind, parentId: p.project_id ?? p.quote_id, parentTitle: (p.projects?.title ?? p.quotes?.title) ?? null,
    title: p.title, source: p.source, createdAt: p.created_at, createdBy: p.created_by, mine: p.created_by === userId,
    fileCount: 0, verified: 0, open: 0, failed: 0, duplicates: 0, bytes: 0,
  });
  for (const f of files) {
    const s = agg.get(f.package_id); if (!s) continue;
    if (f.status === "aborted") continue;
    s.fileCount++;
    if (f.status === "verified") { s.verified++; s.bytes += Number(f.size_bytes); }
    else if (f.status === "pending" || f.status === "uploading") s.open++;
    else if (f.status === "failed") s.failed++;
    else if (f.status === "duplicate") s.duplicates++;
  }
  return { available: true as const, packages: [...agg.values()] };
}

export async function listPackageFiles(sb: Sb, userId: string, packageId: string) {
  await visiblePackage(sb, packageId);
  const rows = await pagedFiles(sb, "id,relative_path,name,size_bytes,file_kind,status,processing_status,error_code,revision_no,revision_of,duplicate_of,r2_key,uploaded_by,created_at,part_count", (x) => x.eq("package_id", packageId));
  const dupIds = [...new Set(rows.filter((r) => r.duplicate_of).map((r) => r.duplicate_of as string))];
  const origin = new Map<string, string | null>();
  if (dupIds.length) {
    const { data } = await sb.from("package_files").select("id,r2_key,status").in("id", dupIds.slice(0, 1000));
    for (const d of data ?? []) origin.set(d.id, d.status === "verified" ? d.r2_key : null);
  }
  const files: PackageFileView[] = rows.map((r) => ({
    id: r.id, relativePath: r.relative_path, name: r.name, size: Number(r.size_bytes), kind: r.file_kind, status: r.status,
    processingStatus: r.processing_status, errorCode: r.error_code, revisionNo: r.revision_no, revisionOf: r.revision_of, duplicateOf: r.duplicate_of,
    openKey: r.status === "verified" ? r.r2_key : r.duplicate_of ? origin.get(r.duplicate_of) ?? null : null,
    mine: r.uploaded_by === userId, createdAt: r.created_at, partCount: r.part_count,
  }));
  return { files };
}
