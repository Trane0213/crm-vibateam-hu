/**
 * Szerződés-előkészítés forrásainak olvasása a hívó jogosultságával (RLS).
 * Csak SELECT; egy hibás / nem látható forrás `undefined` → „NINCS ADAT”,
 * sosem „rendben”. Nem használ admin klienst, nem hív RPC-t, nem ír.
 */
import type {
  ContractCompany, ContractContact, ContractDoc, ContractLead, ContractPrepInput, ContractProject, ContractQuote,
} from "./contract-prep";

export const CONTRACT_LEAD_COLS = "id,status,company_id,contact_id,assigned_to,pipeline_entered_at";
export const CONTRACT_QUOTE_COLS = "id,title,status,sent_at,is_current,valid_until,site_address,total_amount,manual_net_amount,tax_percent,template_terms,version,alternative_key";
export const CONTRACT_PROJECT_COLS = "id,title,address,status,lead_id,company_id";

type Res<T> = { data: T | null; error: unknown };
// Szűk, csak olvasó felület — a tesztek hamis klienssel ellenőrzik.
export type ReadClient = { from: (table: string) => any };

async function safe<T>(p: PromiseLike<Res<T>>): Promise<T | undefined> {
  try {
    const r = await p;
    return r.error ? undefined : ((r.data ?? null) as T);
  } catch {
    return undefined;
  }
}

export async function loadContractPrepInput(client: ReadClient, ids: { leadId?: string | null; projectId?: string | null }): Promise<ContractPrepInput> {
  const leadId = ids.leadId ?? null;
  const lead: ContractLead | null | undefined = leadId
    ? await safe<ContractLead>(client.from("leads").select(CONTRACT_LEAD_COLS).eq("id", leadId).maybeSingle())
    : null;
  // Nem látható lead (RLS) = NINCS ADAT, nem „nincs összekötve”.
  const leadVal = leadId && lead === null ? undefined : lead;

  let project: ContractProject | null | undefined;
  if (ids.projectId) {
    project = await safe<ContractProject>(client.from("projects").select(CONTRACT_PROJECT_COLS).eq("id", ids.projectId).maybeSingle());
    if (project === null) project = undefined;
  } else if (leadId) {
    const rows = await safe<ContractProject[]>(client.from("projects").select(CONTRACT_PROJECT_COLS).eq("lead_id", leadId).order("created_at", { ascending: false }).limit(1));
    project = rows === undefined ? undefined : rows[0] ?? null;
  } else project = null;

  const quoteQ = leadId
    ? client.from("quotes").select(CONTRACT_QUOTE_COLS).eq("lead_id", leadId).eq("is_current", true).order("created_at", { ascending: false }).limit(50)
    : project?.id
      ? client.from("quotes").select(CONTRACT_QUOTE_COLS).eq("project_id", project.id).eq("is_current", true).order("created_at", { ascending: false }).limit(50)
      : null;
  const companyId = leadVal?.company_id ?? project?.company_id ?? null;
  const contactId = leadVal?.contact_id ?? null;
  const [quotes, company, contact, contractRows] = await Promise.all([
    quoteQ ? safe<ContractQuote[]>(quoteQ) : Promise.resolve(leadVal === undefined ? undefined : ([] as ContractQuote[])),
    companyId ? safe<ContractCompany>(client.from("companies").select("id,name,company_type,tax_number").eq("id", companyId).maybeSingle()) : Promise.resolve(null),
    contactId ? safe<ContractContact>(client.from("contacts").select("id,name,email,email_invalid").eq("id", contactId).maybeSingle()) : Promise.resolve(null),
    project?.id ? safe<any[]>(client.from("project_documents").select("id,name,file_url,created_at,project_id").eq("project_id", project.id).eq("document_type", "contract").order("created_at", { ascending: false }).limit(50)) : Promise.resolve(project === null ? [] : undefined),
  ]);
  const acceptedIds = (quotes ?? []).filter((q) => q.status === "accepted").map((q) => q.id);
  const termRows = acceptedIds.length
    ? await safe<any[]>(client.from("quote_documents").select("id,name,file_url,created_at,quote_id").in("quote_id", acceptedIds).eq("document_type", "contract_terms").order("created_at", { ascending: false }).limit(50))
    : quotes === undefined ? undefined : [];
  const toDoc = (table: ContractDoc["table"], parent: string) => (r: any): ContractDoc => ({ id: r.id, name: r.name ?? null, file_url: r.file_url ?? null, created_at: r.created_at ?? null, parent_id: r[parent], table });
  return {
    lead: leadVal,
    company: companyId ? (company ?? undefined) : null,
    contact: contactId ? (contact ?? undefined) : null,
    quotes,
    termsDocs: termRows === undefined ? undefined : termRows.map(toDoc("quote_documents", "quote_id")),
    project,
    contractDocs: contractRows === undefined ? undefined : (contractRows ?? []).map(toDoc("project_documents", "project_id")),
  };
}
