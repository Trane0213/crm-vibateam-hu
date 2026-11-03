import { registerTool } from "../tool-registry";
import { toolError } from "../tool-errors";
import { OWNER_ROLES } from "../roles";
import type { ToolContext } from "../types";
import { CRM_PAGE_PROPERTIES, crmReadPage, readWindow } from "./crm-read-page";
import { QUOTE_SELECT, quoteContext, quoteFieldChanges, quoteSendEvidence, sameQuoteScope } from "./quote-context";
import { readQuoteList } from "./quote-read.server";
import { safeMailText } from "./gmail-context";
import { registerSalesIntelligenceTools } from './sales-intelligence.server';

async function visibleQuote(id: string, ctx: ToolContext) {
  const result = await ctx.supabaseUser.from("quotes").select(QUOTE_SELECT).eq("id", id).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new Error("Nem található hozzáférhető ajánlat.");
  return result.data as Record<string, unknown>;
}
function safeRow(row: Record<string, unknown>) {
  const statuses: Record<string, unknown> = {};
  const safe = Object.fromEntries(Object.entries(row).map(([k, v]) => {
    if (typeof v !== "string") return [k, v];
    const text = safeMailText(v, 0, 1500);
    if (text.status !== "cached") statuses[k] = { status: text.status, next_offset: text.next_offset };
    return [k, text.text];
  }));
  return { ...safe, content_status: statuses };
}
async function items(id: string, args: Record<string, unknown>, ctx: ToolContext) {
  const window = readWindow(args, 10);
  const result = await ctx.supabaseUser.from("quote_items").select("id,quote_id,name,section,quantity,unit,unit_price,total_price,created_at", { count: "exact" })
    .eq("quote_id", id).order("created_at").order("id").range(window.offset, window.offset + window.limit - 1);
  if (result.error) throw result.error;
  return crmReadPage((result.data ?? []).map(safeRow), result.count, window, "quote_items", 4500);
}

export function registerQuoteTools() {
  registerSalesIntelligenceTools();
  registerTool({ name: "crm_list_quotes", domain: "crm.quotes",
    description: "Ajánlatok, lead- és projekt-only cégkapcsolattal, nettóval és aktuális/verzió/alternatíva jelöléssel. Saját Sales-ajánlatokhoz szűrő nélkül hívd: RLS védi. lead_id/company_id/project_id konkrét rekord UUID, soha nem me. Lapozott összesítés csak teljes oldalnál teljes kiválasztás, nem összeadott alternatívák.",
    parameters: { type: "object", properties: { company_id: { type: "string", format: "uuid" }, lead_id: { type: "string", format: "uuid" }, project_id: { type: "string", format: "uuid" }, ...CRM_PAGE_PROPERTIES } },
  }, async (args, ctx) => {
    try { return { ok: true, data: await readQuoteList(args, ctx) }; } catch (e) { return toolError.fromException(e); }
  });

  registerTool({ name: "crm_quote_context", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: [...OWNER_ROLES, "sales"],
    description: "Pontos RLS-látható ajánlat értelmezése: summary, items, versions, sends, followups vagy content szekció. content field+text_offset hosszú ajánlatszöveg folytatása. Küldési napló nem ügyfélválasz, fájltartalmat nem olvas.",
    parameters: { type: "object", properties: { quote_id: { type: "string" }, section: { type: "string", enum: ["summary", "items", "versions", "sends", "followups", "content"] }, field: { type: "string", enum: ["scope_note", "technical_scope", "exclusions", "notes", "template_terms"] }, text_offset: { type: "integer", minimum: 0 }, ...CRM_PAGE_PROPERTIES }, required: ["quote_id"] },
  }, async (args, ctx) => {
    try {
      const raw = await visibleQuote(String(args.quote_id), ctx);
      const quote = quoteContext(raw);
      const section = String(args.section ?? "summary");
      let page;
      if (section === "content") {
        const field = String(args.field ?? "technical_scope");
        if (!["scope_note", "technical_scope", "exclusions", "notes", "template_terms"].includes(field)) throw new Error("Nem olvasható szövegmező.");
        const offset = Number(args.text_offset ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error("Érvénytelen szöveglapozás.");
        const value = raw[field];
        const content = safeMailText(value == null ? null : typeof value === "string" ? value : JSON.stringify(value), offset, 6000);
        return { ok: true, data: { quote_id: raw.id, field, content, source: { table: "quotes", id: raw.id }, untrusted_source_content: true, full_document_review: false } };
      }
      if (section === "summary") page = crmReadPage([quote], 1, { limit: 1, offset: 0 }, "quotes", 8000);
      else if (section === "items") page = await items(String(raw.id), args, ctx);
      else if (section === "versions") {
        const data = await readQuoteList({ ...args, group_id: raw.group_id }, ctx);
        return { ok: true, data: { quote, section, ...data } };
      } else {
        const window = readWindow(args, 10);
        const table = section === "sends" ? "quote_sends" : section === "followups" ? "followups" : null;
        if (!table) throw new Error("Ismeretlen ajánlati szekció.");
        const query = table === "quote_sends"
          ? ctx.supabaseUser.from("quote_sends").select("id,quote_id,mode,status,sent_at,created_at,gmail_message_id,email_id,thread_id", { count: "exact" })
          : ctx.supabaseUser.from("followups").select("id,quote_id,lead_id,project_id,company_id,followup_type,completed,result,due_date,assigned_to,created_at", { count: "exact" });
        const result = await query.eq("quote_id", String(raw.id)).order("created_at", { ascending: false }).order("id").range(window.offset, window.offset + window.limit - 1);
        if (result.error) throw result.error;
        const rows = (result.data ?? []).map(safeRow);
        page = crmReadPage(table === "quote_sends" ? rows.map(quoteSendEvidence) : rows, result.count, window, table, 6500);
      }
      return { ok: true, data: { quote, section, ...page,
        limitations: ["A küldési állapot vagy határidő nem bizonyít ügyfélválaszt. Levélhez pontos ügy/fiók szükséges a P1/B eszközzel.", "Hiányzó/szűrt/csonkolt tartalom nem teljes műszaki vizsgálat. Dokumentumolvasás P1/D-ben."] } };
    } catch (e) { return toolError.fromException(e); }
  });

  registerTool({ name: "crm_compare_quotes", domain: "crm.quotes", allowed_agents: ["timothy"], allowed_roles: [...OWNER_ROLES, "sales"],
    description: "Két explicit ajánlatverzió/alternatíva összehasonlítása azonos csoportban és azonos mentett lead/projekt kapcsolatban. Alapadat-változások és külön lapozott tételoldalak; részleges tételoldal nem teljes változáslista.",
    parameters: { type: "object", properties: { from_quote_id: { type: "string" }, to_quote_id: { type: "string" }, ...CRM_PAGE_PROPERTIES }, required: ["from_quote_id", "to_quote_id"] },
  }, async (args, ctx) => {
    try {
      const [a, b] = await Promise.all([visibleQuote(String(args.from_quote_id), ctx), visibleQuote(String(args.to_quote_id), ctx)]);
      if (!sameQuoteScope(a, b)) throw new Error("Eltérő ügy/csoport ajánlatai nem hasonlíthatók össze.");
      const from = quoteContext(a), to = quoteContext(b);
      const [fromItems, toItems] = await Promise.all([items(String(a.id), args, ctx), items(String(b.id), args, ctx)]);
      return { ok: true, data: { from, to, field_changes: quoteFieldChanges(from, to), from_items: fromItems, to_items: toItems,
        complete_item_comparison: fromItems.completeness.page_complete && toItems.completeness.page_complete && [...fromItems.items, ...toItems.items].every((r) => Object.keys(r.content_status as Record<string, unknown>).length === 0),
        limitations: ["Tételazonosító verzióváltáskor változhat; név/munkarész/egység alapján összevetés csak javaslat, duplikált nevű sor nem biztos egyezés.", "Külön tételoldalak next_offset-tal folytathatók. Ár/mennyiség/feltétel nem módosul."] } };
    } catch (e) { return toolError.fromException(e); }
  });
}