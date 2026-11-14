/**
 * P4 — tervoldalak betöltése egy ajánlathoz, a hívó saját (RLS) jogán.
 * (1) P2 feldolgozó mentett oldalai (package_file_units) — nagy csomagokhoz; (2) kisebb PDF-ek közvetlen
 * szövegréteg-olvasása a meglévő R2-aláíróval (≤ 20 MB/fájl, ≤ 80 oldal/fájl). Nagyobb vagy fel nem dolgozott fájl
 * „feldolgozó szükséges” állapotot kap — nem hallgatjuk el, és nem állítjuk ellenőrzöttnek.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_LIMITS } from "./plan-review-schema";
import type { PlanFile, PlanPage } from "./plan-text";

type Sb = SupabaseClient<any, any, any>;
export type Download = (key: string, limit: number) => Promise<Uint8Array>;
const PLAN_DOC_TYPES = ["technical_plan", "technical_scope", "contract_terms", "other"];
const safeKey = (k: string) => !!k && k.length <= 1024 && !k.includes("..") && !k.startsWith("/") && !k.includes("://");

export async function pdfPages(bytes: Uint8Array, fileId: string, maxPages: number): Promise<{ pages: PlanPage[]; pageCount: number }> {
  const { getDocumentProxy } = await import("unpdf");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("PDF-feldolgozás időkorlát.")), PLAN_LIMITS.pdfDeadlineMs); });
  const pdf = await Promise.race([getDocumentProxy(bytes), deadline]);
  try {
    const out: PlanPage[] = [];
    const n = Math.min(pdf.numPages, maxPages);
    for (let i = 1; i <= n; i++) {
      const page = await Promise.race([pdf.getPage(i), deadline]);
      const vp = page.getViewport({ scale: 1 });
      const tc = await Promise.race([page.getTextContent(), deadline]);
      const items = (tc.items as { str?: string; transform?: number[] }[]).filter((t) => t.str?.trim() && t.transform).slice(0, PLAN_LIMITS.itemsPerPage)
        .map((t) => ({ s: t.str!, x: Math.round(t.transform![4]!), y: Math.round(t.transform![5]!) }));
      out.push({ fileId, page: i, source: "text_layer", aiExtracted: false, width: Math.round(vp.width), height: Math.round(vp.height), items, text: "" });
    }
    return { pages: out, pageCount: pdf.numPages };
  } finally { if (timer) clearTimeout(timer); await pdf.loadingTask.destroy(); }
}

export async function loadPlanPages(sb: Sb, quoteId: string, download: Download): Promise<{ files: PlanFile[]; pages: PlanPage[] }> {
  const files: PlanFile[] = [], pages: PlanPage[] = [];
  let bytesUsed = 0;
  const budgetLeft = () => PLAN_LIMITS.pagesTotal - pages.length;
  const inline = async (f: PlanFile, key: string, size: number | null) => {
    if (files.length > PLAN_LIMITS.files) { f.status = "processor_required"; f.statusReason = `A CRM-en belüli olvasás legfeljebb ${PLAN_LIMITS.files} fájl.`; return; }
    if (!safeKey(key)) { f.status = "failed"; f.statusReason = "Érvénytelen tárolási kulcs."; return; }
    if ((size ?? 0) > PLAN_LIMITS.fileBytes || bytesUsed + (size ?? 0) > PLAN_LIMITS.totalBytes) { f.status = "processor_required"; f.statusReason = "Nagy fájl: a nagyfájlos feldolgozó (P2) szükséges, amely még nincs telepítve."; return; }
    if (budgetLeft() <= 0) { f.status = "processor_required"; f.statusReason = `Oldalkorlát (${PLAN_LIMITS.pagesTotal}) elérve; a többi fájl a nagyfájlos feldolgozóval olvasható.`; return; }
    try {
      const bytes = await download(key, PLAN_LIMITS.fileBytes); bytesUsed += bytes.length;
      if (!(bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)) { f.status = "not_pdf"; f.statusReason = "Nem PDF (rajz/CAD/kép a P2 feldolgozóval vagy OCR-rel olvasható)."; return; }
      const r = await pdfPages(bytes, f.fileId, Math.min(PLAN_LIMITS.pagesPerFile, budgetLeft()));
      f.pageCount = r.pageCount; f.status = "read"; pages.push(...r.pages);
      if (r.pageCount > r.pages.length) f.statusReason = `${r.pageCount - r.pages.length} oldal a CRM-en belüli korlát miatt nem került olvasásra.`;
    } catch (e) { f.status = "failed"; f.statusReason = e instanceof Error && /időkorlát|túl nagy/.test(e.message) ? e.message : "A PDF nem olvasható."; }
  };

  const docs = await sb.from("quote_documents").select("id,name,file_url,size_bytes,document_type,mime_type").eq("quote_id", quoteId).in("document_type", PLAN_DOC_TYPES).order("created_at", { ascending: true }).limit(60);
  if (docs.error) throw new Error("Az ajánlat dokumentumai nem olvashatók.");
  for (const d of docs.data ?? []) {
    const name = String(d.name ?? "");
    const f: PlanFile = { fileId: `qd:${d.id}`, fileName: name, path: null, origin: "quote_document", pageCount: null, status: "not_processed" };
    files.push(f);
    if (!/\.pdf$/i.test(name) && d.mime_type !== "application/pdf") { f.status = "not_pdf"; f.statusReason = "Nem PDF — jelenleg csak PDF-tervek szövegrétege olvasható a CRM-ben."; continue; }
    await inline(f, String(d.file_url ?? ""), Number(d.size_bytes ?? 0));
  }

  const pk = await sb.from("document_packages").select("id").eq("quote_id", quoteId).limit(5);
  if (!pk.error && pk.data?.length) {
    const pf = await sb.from("package_files").select("id,package_id,name,relative_path,size_bytes,sha256,r2_key,status,file_kind,mime_type").in("package_id", pk.data.map((p: { id: string }) => p.id)).eq("status", "verified").limit(500);
    for (const x of pf.data ?? []) {
      const name = String(x.name ?? ""), isPdf = /\.pdf$/i.test(name) || x.mime_type === "application/pdf";
      if (!isPdf) continue;
      const f: PlanFile = { fileId: `pf:${x.id}`, fileName: name, path: x.relative_path ?? null, origin: "package_file", sha256: x.sha256 ?? null, pageCount: null, status: "not_processed" };
      files.push(f);
      const units = await sb.from("package_file_units").select("unit_kind,unit_no,source,text,ai_extracted").eq("file_id", x.id).eq("unit_kind", "page").order("unit_no").limit(Math.max(1, Math.min(PLAN_LIMITS.pagesPerFile * 3, budgetLeft())));
      if (!units.error && units.data?.length) {
        const ex = await sb.from("package_file_extracts").select("page_count").eq("file_id", x.id).maybeSingle();
        f.status = "read"; f.pageCount = Number(ex.data?.page_count ?? units.data.length);
        for (const u of units.data) pages.push({ fileId: f.fileId, page: u.unit_no, source: u.source === "ocr" ? "ocr" : "text_layer", aiExtracted: !!u.ai_extracted, width: null, height: null, items: null, text: String(u.text ?? "") });
        continue;
      }
      await inline(f, String(x.r2_key ?? ""), Number(x.size_bytes ?? 0));
      if (f.status === "processor_required") f.statusReason = "A csomagfájl még nincs feldolgozva, és túl nagy a CRM-en belüli olvasáshoz (P2 feldolgozó szükséges).";
    }
  }
  return { files, pages };
}
