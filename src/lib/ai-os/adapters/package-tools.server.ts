/**
 * P2 – Tervcsomagok olvasása AI-asszisztenseknek (csak olvasás, a felhasználó saját RLS-ével).
 * A feldolgozó által mentett oldal/munkalap-szövegeket és a csomagjelentést adja vissza, forrással
 * (fájl, útvonal, oldal, SHA-256). Nem indít feldolgozást, nem fizetős, nem ír semmit.
 * Későbbi árazási (P3) és rajzértelmezési (P4) eszközök erre épülnek.
 */
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerTool } from "../tool-registry";
import { toolError } from "../tool-errors";
import { DOCUMENT_AGENTS, DOCUMENT_ROLES } from "./document-tools.server";
import { safeMailText } from "./gmail-context";

type Sb = SupabaseClient<any, any, any>;
const uuid = z.string().uuid();
const UNIT_CHARS = 6000;
const PROVENANCE_NOTE = "Tervcsomag-feldolgozás mentett eredménye. text_layer/sheet/text = a fájlból gépileg kiolvasott szöveg; ocr = AI-képfelismerés, nem ellenőrzött forrás.";

export async function packageOverview(sb: Sb, args: { project_id?: string; quote_id?: string }) {
  const parent = args.project_id ? { col: "project_id", id: uuid.parse(args.project_id) } : args.quote_id ? { col: "quote_id", id: uuid.parse(args.quote_id) } : null;
  if (!parent) throw new Error("project_id vagy quote_id szükséges");
  const { data: pkgs, error } = await sb.from("document_packages").select("id,title,created_at").eq(parent.col, parent.id).order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  const { packageReport } = await import("@/lib/packages/processing.server");
  const out = [];
  for (const p of pkgs ?? []) {
    const r = await packageReport(sb, p.id as string);
    const problems = r.rows.filter((x) => ["failed", "unreadable", "partial", "upload_open"].includes(x.state));
    out.push({
      package_id: p.id, title: safeMailText(String(p.title ?? "")).text, created_at: p.created_at, totals: r.totals, processor_configured: r.configured,
      problem_files: problems.slice(0, 60).map((x) => ({ file_id: x.fileId, path: x.path, state: x.label, reasons: x.reasons, from_zip: x.fromArchive })),
      problem_files_total: problems.length,
      readable_files: r.rows.filter((x) => x.state === "processed" || x.state === "partial").slice(0, 80).map((x) => ({ file_id: x.fileId, path: x.path, state: x.label, details: x.details })),
      not_supported_total: r.totals.notSupported,
    });
  }
  return {
    packages: out, packages_listed: out.length, more_packages_possible: (pkgs ?? []).length === 5,
    limitations: ["Csak a felhasználó számára látható csomagok. A felsorolt fájllisták rövidítettek lehetnek (lásd *_total)."],
  };
}

export async function readPackageFile(sb: Sb, args: { file_id: string; unit_from?: number; max_units?: number }) {
  const fileId = uuid.parse(args.file_id);
  const from = Math.max(1, Math.floor(Number(args.unit_from ?? 1)) || 1);
  const max = Math.min(10, Math.max(1, Math.floor(Number(args.max_units ?? 5)) || 5));
  const { data: f } = await sb.from("package_files").select("id,package_id,relative_path,name,sha256,size_bytes,status,processing_status,extracted_from").eq("id", fileId).maybeSingle();
  if (!f) throw new Error("not_visible");
  const [{ data: ex }, { data: units, count }] = await Promise.all([
    sb.from("package_file_extracts").select("status,parser,page_count,text_pages,ocr_pages,unreadable_pages,sheet_count,formula_count,entry_count,extracted_count,has_macros,encrypted,summary,problems,processed_at").eq("file_id", fileId).maybeSingle(),
    sb.from("package_file_units").select("unit_kind,unit_no,label,source,text,chars,ai_extracted,uncertain", { count: "exact" }).eq("file_id", fileId).gte("unit_no", from).order("unit_no").order("unit_kind").limit(max),
  ]);
  const { problemText } = await import("@/lib/packages/processing-policy");
  const rows = (units ?? []).map((u: any) => ({
    unit: `${u.unit_kind}:${u.unit_no}`, label: u.label, source: u.source, ai_extracted: !!u.ai_extracted, uncertain: u.uncertain ?? [],
    text: String(u.text ?? "").slice(0, UNIT_CHARS), text_truncated: Number(u.chars ?? 0) > UNIT_CHARS,
  }));
  const last = (units ?? []).at(-1) as any;
  return {
    source: { table: "package_files", id: f.id, package_id: f.package_id, path: safeMailText(String(f.relative_path)).text, sha256: f.sha256, from_zip: !!f.extracted_from },
    processing: ex ? {
      status: ex.status, parser: ex.parser, processed_at: ex.processed_at, pages: ex.page_count, text_pages: ex.text_pages, ocr_pages: ex.ocr_pages, unreadable_pages: ex.unreadable_pages,
      sheets: ex.sheet_count, formulas: ex.formula_count, has_macros: ex.has_macros, encrypted: ex.encrypted,
      problems: ((ex.problems as any[]) ?? []).slice(0, 40).map((p) => ({ ...p, text: problemText(p.code) })),
      structure: ex.summary,
    } : { status: f.status === "verified" ? "not_processed_yet" : f.status, processing_status: f.processing_status },
    units: rows, units_remaining_from_here: count ?? rows.length, next_unit_from: (count ?? 0) > rows.length && last ? last.unit_no + 1 : null,
    untrusted_content: true, note: PROVENANCE_NOTE,
    completeness: { full_document: ex?.status === "done" && (count ?? 0) <= rows.length && from === 1, full_technical_audit: false },
  };
}

const esc = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
export async function searchPackage(sb: Sb, args: { package_id: string; query: string; limit?: number }) {
  const packageId = uuid.parse(args.package_id);
  const q = String(args.query ?? "").trim();
  if (q.length < 2 || q.length > 100) throw new Error("A keresőszó 2–100 karakter.");
  const limit = Math.min(30, Math.max(1, Number(args.limit ?? 15) || 15));
  const { data, error } = await sb.from("package_file_units").select("file_id,unit_kind,unit_no,label,source,ai_extracted,text,package_files!inner(package_id,relative_path)")
    .eq("package_files.package_id", packageId).ilike("text", `%${esc(q)}%`).limit(limit);
  if (error) throw error;
  const lower = q.toLowerCase();
  return {
    query: q,
    hits: (data ?? []).map((u: any) => {
      const t = String(u.text ?? ""); const i = Math.max(0, t.toLowerCase().indexOf(lower));
      return { file_id: u.file_id, path: safeMailText(String(u.package_files?.relative_path ?? "")).text, unit: `${u.unit_kind}:${u.unit_no}`, label: u.label, source: u.source, ai_extracted: !!u.ai_extracted,
        snippet: t.slice(Math.max(0, i - 200), i + 300) };
    }),
    limitations: [`Legfeljebb ${limit} találat; csak a már feldolgozott, látható fájlok szövegében. A „nincs találat” nem bizonyítja, hogy a tervekben nem szerepel (szkennelt/rajz/CAD tartalom hiányozhat).`],
    untrusted_content: true, note: PROVENANCE_NOTE,
  };
}

export function registerPackageTools() {
  registerTool({ name: "crm_package_overview", domain: "crm.documents", allowed_agents: DOCUMENT_AGENTS, allowed_roles: DOCUMENT_ROLES,
    description: "Tervcsomagok (nagy kiviteli dokumentáció) áttekintése egy projekthez vagy ajánlathoz: feldolgozott, részben olvasható, olvashatatlan és csak tárolt fájlok okokkal. Csak olvasás.",
    parameters: { type: "object", properties: { project_id: { type: "string" }, quote_id: { type: "string" } } },
  }, async (args, ctx) => {
    try { return { ok: true, data: await packageOverview(ctx.supabaseUser as Sb, args as any) }; }
    catch { return toolError.fromException("A tervcsomagok nem olvashatók; ellenőrizd a pontos projekt- vagy ajánlatazonosítót és a jogosultságot."); }
  });
  registerTool({ name: "crm_read_package_file", domain: "crm.documents", allowed_agents: DOCUMENT_AGENTS, allowed_roles: DOCUMENT_ROLES,
    description: "Egy tervcsomag-fájl mentett feldolgozási eredménye: oldalak/munkalapok szövege (unit_from-tól legfeljebb 10), táblázatszerkezet, képletszám, problémák. file_id a crm_package_overview-ból. Csak olvasás, nem indít feldolgozást.",
    parameters: { type: "object", properties: { file_id: { type: "string" }, unit_from: { type: "integer", minimum: 1 }, max_units: { type: "integer", minimum: 1, maximum: 10 } }, required: ["file_id"] },
  }, async (args, ctx) => {
    try { return { ok: true, data: await readPackageFile(ctx.supabaseUser as Sb, args as any) }; }
    catch { return toolError.fromException("A tervcsomag-fájl nem olvasható vagy nem elérhető."); }
  });
  registerTool({ name: "crm_search_package", domain: "crm.documents", allowed_agents: DOCUMENT_AGENTS, allowed_roles: DOCUMENT_ROLES,
    description: "Szöveges keresés egy tervcsomag feldolgozott oldalaiban/munkalapjaiban (pl. tervszám, szekrényjel, anyag). Találatonként fájl, oldal és részlet. Csak olvasás.",
    parameters: { type: "object", properties: { package_id: { type: "string" }, query: { type: "string" }, limit: { type: "integer", minimum: 1, maximum: 30 } }, required: ["package_id", "query"] },
  }, async (args, ctx) => {
    try { return { ok: true, data: await searchPackage(ctx.supabaseUser as Sb, args as any) }; }
    catch { return toolError.fromException("A tervcsomagban most nem lehet keresni."); }
  });
}
