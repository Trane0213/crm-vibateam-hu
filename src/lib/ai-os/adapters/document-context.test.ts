import { beforeEach, describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import * as XLSX from "xlsx";
import { DOCUMENT_LIMITS, checkedOfficeZip, extractDocument } from "./document-extract.server";
import { readDocument, registerDocumentTools } from "./document-tools.server";
import { documentToolAudit } from "../document-audit";
import { getTool, registerTool, toolsForAgent } from "../tool-registry";
import type { ToolContext } from "../types";

const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", quoteId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
type Row = Record<string, unknown>;
function fixture(tables: Record<string, Row[]>, hidden: string[] = []) {
  const calls: string[] = [];
  const client = { from(table: string) {
    calls.push(table); const filters: [string, unknown][] = []; let single = false, start = 0, end = 999;
    const q = { select() { return q; }, eq(k: string, v: unknown) { filters.push([k, v]); return q; }, maybeSingle() { single = true; return q; },
      order() { return q; }, range(a: number, b: number) { start = a; end = b; return q; }, then(resolve: (v: unknown) => unknown) {
        const rows = (tables[table] ?? []).filter((r) => !hidden.includes(String(r.id)) && filters.every(([k, v]) => r[k] === v));
        return Promise.resolve(resolve({ data: single ? rows[0] ?? null : rows.slice(start, end + 1), count: rows.length, error: null }));
      } }; return q;
  } };
  return { calls, ctx: { supabaseUser: client, supabaseAdmin: new Proxy({}, { get() { throw new Error("Admin forbidden"); } }), userId: "TESZT", agentId: "timothy", userRole: "sales" } as unknown as ToolContext };
}
function pdfFixture(text = "TESZT PDF") {
  const stream = `BT /F1 12 Tf 20 200 Td (${text}) Tj ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>", "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let out = "%PDF-1.4\n"; const offsets = [0];
  objects.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length; out += `xref\n0 6\n0000000000 65535 f \n` + offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return strToU8(out);
}
beforeEach(registerDocumentTools);
describe("Timothy P1/D bounded file extraction", () => {
  it("extracts a real PDF text layer without canvas or OCR", async () => {
    const out = await extractDocument(pdfFixture(), "TESZT.pdf"); expect(out.units[0].text).toContain("TESZT PDF"); expect(out.total_units).toBe(1); expect(out.parser).toContain("unpdf");
  });
  it("empty PDF text never claims readable scan content", async () => {
    const out = await extractDocument(pdfFixture(""), "TESZT.pdf"); expect(out.status).toBe("no_extractable_text");
  });
  it("extracts DOCX paragraphs and preserves Unicode", async () => {
    const zip = zipSync({ "word/document.xml": strToU8('<w:document xmlns:w="test"><w:body><w:p><w:r><w:t>TESZT árvíztűrő</w:t></w:r></w:p><w:p><w:r><w:t>Második</w:t></w:r></w:p></w:body></w:document>') });
    const out = await extractDocument(zip, "TESZT.docx"); expect(out.units[0].text).toBe("TESZT árvíztűrő\nMásodik");
  });
  it("extracts named XLSX sheets and saved cell values without evaluating formulas", async () => {
    const book = XLSX.utils.book_new(); const sheet = XLSX.utils.aoa_to_sheet([["TESZT tétel", 1200], ["Mennyiség", 3]]);
    sheet.C1 = { t: "n", v: 3600, f: "B1*B2" }; sheet["!ref"] = "A1:C2";
    XLSX.utils.book_append_sheet(book, sheet, "Költségvetés"); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Második"]]), "Másik");
    const bytes = new Uint8Array(XLSX.write(book, { type: "array", bookType: "xlsx" }));
    const out = await extractDocument(bytes, "TESZT.xlsx"); expect(out.units[0].text).toContain("C1=3600 [képlet mentett eredménye"); expect(out.next_unit).toBe(1);
    expect((await extractDocument(bytes, "TESZT.xlsx", 1)).units[0].label).toContain("Másik");
  });
  it("continues long UTF-8 text without skipping and retains incomplete state", async () => {
    const bytes = strToU8("x".repeat(6100) + "Vége"); const first = await extractDocument(bytes, "TESZT.txt");
    expect(first.next_text_offset).toBe(6000); const next = await extractDocument(bytes, "TESZT.txt", 0, 6000);
    expect(next.units[0].text).toBe("x".repeat(100) + "Vége"); expect(next.status).toBe("partial");
  });
  it("withholds credentials even beyond the selected text slice", async () => {
    const out = await extractDocument(strToU8("x".repeat(6100) + " password=TESZTSECRET"), "TESZT.txt");
    expect(out.status).toBe("sensitive_withheld"); expect(JSON.stringify(out)).not.toContain("TESZTSECRET");
  });
  it("rejects oversized bytes, invalid text encoding and corrupt documents", async () => {
    await expect(extractDocument(new Uint8Array(DOCUMENT_LIMITS.bytes + 1), "TESZT.txt")).rejects.toThrow();
    await expect(extractDocument(new Uint8Array([255, 254]), "TESZT.txt")).rejects.toThrow();
    await expect(extractDocument(strToU8("invalid"), "TESZT.pdf")).rejects.toThrow();
    await expect(extractDocument(strToU8("invalid"), "TESZT.docx")).rejects.toThrow();
  });
  it("rejects ZIP bombs before inflation and active/external Office parts", () => {
    const zip = zipSync({ "word/document.xml": strToU8("test") }); const view = new DataView(zip.buffer);
    for (let i = 0; i < zip.length - 46; i++) if (view.getUint32(i, true) === 0x02014b50) { view.setUint32(i + 24, DOCUMENT_LIMITS.expandedBytes + 1, true); break; }
    expect(() => checkedOfficeZip(zip)).toThrow();
    expect(() => checkedOfficeZip(zipSync({ "xl/externalLinks/externalLink1.xml": strToU8("external") }))).toThrow();
  });
  it("unsupported binary formats are explicit and not successful text extraction", async () => {
    const out = await extractDocument(new Uint8Array([0]), "TESZT.dwg"); expect(out.status).toBe("unsupported"); expect(out.units).toEqual([]);
  });
});

describe("Timothy P1/D authorized source and provenance", () => {
  const args = { source: "quote_documents", document_id: id, quote_id: quoteId };
  const row = { id, quote_id: quoteId, file_url: `quote-documents/${quoteId}/TESZT.txt`, name: "TESZT.txt", created_at: "2026-11-03T16:00:00Z" };
  it("returns content hash, source and separate quote business version, never the storage key", async () => {
    const f = fixture({ quotes: [{ id: quoteId, version: 2 }], quote_documents: [row] });
    const out = await readDocument(args, f.ctx, async () => strToU8("TESZT szöveg"));
    if (!("provenance" in out.data)) throw new Error("Expected extraction provenance");
    expect(out.data.provenance?.sha256).toHaveLength(64); expect(out.data.source).toMatchObject({ id, quote_id: quoteId });
    expect(out.data.provenance?.quote_version).toMatchObject({ version: 2 }); expect(JSON.stringify(out)).not.toContain("quote-documents/");
  });
  it("denies invisible parent before child lookup or file download", async () => {
    const f = fixture({ quotes: [{ id: quoteId }], quote_documents: [row] }, [quoteId]); let downloads = 0;
    await expect(readDocument(args, f.ctx, async () => { downloads++; return strToU8("private"); })).rejects.toThrow();
    expect(f.calls).toEqual(["quotes"]); expect(downloads).toBe(0);
  });
  it("denies foreign document scope and arbitrary external storage URLs", async () => {
    for (const changed of [{ ...row, quote_id: "foreign" }, { ...row, file_url: "https://example.com/private" }]) {
      const f = fixture({ quotes: [{ id: quoteId }], quote_documents: [changed] }); let downloads = 0;
      await expect(readDocument(args, f.ctx, async () => { downloads++; return strToU8("private"); })).rejects.toThrow(); expect(downloads).toBe(0);
    }
  });
  it("marks large files without fetching or starting a background job", async () => {
    const f = fixture({ quotes: [{ id: quoteId }], quote_documents: [{ ...row, size_bytes: DOCUMENT_LIMITS.bytes + 1 }] }); let downloads = 0;
    const out = await readDocument(args, f.ctx, async () => { downloads++; return strToU8("private"); });
    expect(out.data.status).toBe("requires_large_processing"); expect(downloads).toBe(0);
  });
  it("rejects content changes before continuing an older extraction", async () => {
    const f = fixture({ quotes: [{ id: quoteId }], quote_documents: [row] });
    await expect(readDocument({ ...args, expected_hash: "0".repeat(64) }, f.ctx, async () => strToU8("changed"))).rejects.toThrow("megváltozott");
  });
  it("requires the returned hash for every continuation", async () => {
    const f = fixture({ quotes: [{ id: quoteId }], quote_documents: [row] });
    await expect(readDocument({ ...args, text_offset: 6000 }, f.ctx, async () => strToU8("x".repeat(6100)))).rejects.toThrow("hash");
  });
  it("lists more than 30 documents in bounded pages without returning keys", async () => {
    const rows = Array.from({ length: 39 }, (_, i) => ({ ...row, id: `${id}-${i}` }));
    const f = fixture({ quotes: [{ id: quoteId }], quote_documents: rows });
    const tool = getTool("crm_list_documents"); if (!tool) throw new Error("Missing list tool");
    const first = await tool.execute({ source: "quote_documents", quote_id: quoteId, limit: 10 }, f.ctx) as any;
    expect(first.data.pagination.total_visible).toBe(39); expect(first.data.items.length).toBe(10);
    const next = await tool.execute({ source: "quote_documents", quote_id: quoteId, limit: 10, offset: first.data.pagination.next_offset }, f.ctx) as any;
    expect(next.data.items[0].id).toBe(`${id}-10`); expect(JSON.stringify(first)).not.toContain("quote-documents/");
  });
  it("reads an attachment only after its exact authorized email is confirmed", async () => {
    registerTool({ name: "crm_read_email_thread", domain: "crm.emails", description: "TESZT own-account message", parameters: {} }, async (args) => ({ ok: true, data: { items: [{ id: args.email_id }] } }));
    const f = fixture({ email_attachments: [{ id, email_id: quoteId, filename: "TESZT.txt", r2_key: "attachment/test.txt" }] });
    const out = await readDocument({ source: "email_attachments", document_id: id, email_id: quoteId, company_id: id, thread_id: id, mailbox: "teszt@example.com" }, f.ctx, async () => strToU8("TESZT melléklet"));
    expect(out.data.status).toBe("extracted"); expect(f.calls).toEqual(["email_attachments"]);
  });
  it("requires exact mailbox message access before attachment lookup", async () => {
    registerTool({ name: "crm_read_email_thread", domain: "crm.emails", description: "TESZT denied message", parameters: {} }, async () => ({ ok: true, data: { items: [] } }));
    const f = fixture({ email_attachments: [{ id, email_id: quoteId, r2_key: "private" }] });
    await expect(readDocument({ source: "email_attachments", document_id: id, email_id: quoteId, company_id: id, thread_id: id, mailbox: "teszt@example.com" }, f.ctx, async () => strToU8("private"))).rejects.toThrow();
    expect(f.calls).toEqual([]);
  });
  it("audit excludes extracted content and private names", () => {
    const audit = documentToolAudit({ ok: true, data: { source: { id }, provenance: { sha256: "hash" }, units: [{ text: "PRIVATE CONTENT" }], name: "PRIVATE NAME" } });
    expect(JSON.stringify(audit)).not.toContain("PRIVATE"); expect(audit.content_omitted).toBe(true);
  });
  it("tulajdonosi döntés 2026-11-14: minden chat-asszisztens olvas, csak CRM-szerepkörrel, Michael és szerepkör nélküli felhasználó nem", () => {
    for (const name of ["crm_list_documents", "crm_read_document"]) {
      expect(getTool(name)?.allowed_agents).toEqual(["george", "timothy", "boss", "scarlet"]);
      expect(getTool(name)?.domain).toBe("crm.documents");
      for (const [agentId, role] of [["george", "marketing"], ["boss", "pm"], ["scarlet", "marketing"], ["timothy", "sales"], ["george", "owner"]] as const)
        expect(toolsForAgent({ agentId, agentDomains: ["crm.documents"], userRole: role }).some((t) => t.name === name)).toBe(true);
      for (const role of ["user", null]) expect(toolsForAgent({ agentId: "george", agentDomains: ["crm.documents"], userRole: role }).some((t) => t.name === name)).toBe(false);
      expect(toolsForAgent({ agentId: "michael", agentDomains: ["crm.documents"], userRole: "owner" }).some((t) => t.name === name)).toBe(false);
      // a régi ajánlat-domain nem ad dokumentumolvasást (George-nál továbbra sincs crm.quotes)
      expect(toolsForAgent({ agentId: "george", agentDomains: ["crm.quotes"], userRole: "owner" }).some((t) => t.name === name)).toBe(false);
    }
  });
  it("levélmelléklet Marketing/PM szerepkörben nem olvasható, letöltés és levélolvasás nélkül", async () => {
    for (const userRole of ["marketing", "pm", "project_manager"]) {
      const f = fixture({ email_attachments: [{ id, email_id: quoteId, r2_key: "private" }] });
      let downloaded = false;
      await expect(readDocument({ source: "email_attachments", document_id: id, email_id: quoteId, company_id: id, thread_id: id, mailbox: "teszt@example.com" }, { ...f.ctx, userRole, agentId: "george" } as ToolContext, async () => { downloaded = true; return strToU8("private"); })).rejects.toThrow("szerepkörben");
      expect(downloaded).toBe(false);
    }
  });
  it("chat-feltöltés: csak a hívó által (RLS) látható sor olvasható, szülőrekord nélkül; idegen mappa → nincs letöltés", async () => {
    const visible = fixture({ ai_chat_uploads: [{ id, name: "TESZT.txt", file_url: `ai-chat-uploads/sales/u/1-TESZT.txt`, created_at: "2026-11-14T10:00:00Z" }] });
    const out = await readDocument({ source: "ai_chat_uploads", document_id: id }, visible.ctx, async () => strToU8("TESZT CHAT SZOVEG")) as any;
    expect(out.data.units[0].text).toContain("TESZT CHAT SZOVEG"); expect(out.data.source.table).toBe("ai_chat_uploads");
    const hidden = fixture({ ai_chat_uploads: [] }); let downloaded = false;
    await expect(readDocument({ source: "ai_chat_uploads", document_id: id }, hidden.ctx, async () => { downloaded = true; return strToU8("x"); })).rejects.toThrow();
    expect(downloaded).toBe(false);
  });
});