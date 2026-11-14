/**
 * Kapcsolódó dokumentumok olvasása a hívó jogosultságával (RLS) — csak SELECT.
 *
 * Egy forrás hibája nem rejti el a többit: az adott forrás állapota „error”
 * (NINCS ADAT), sosem „nincs dokumentum”. Ha a lekérés elérte a felső határt,
 * „truncated” — a felület kiírja, hogy a lista nem teljes. Nem használ admin
 * klienst, nem hív RPC-t, nem ír, nem ír alá fájlhivatkozást.
 */
import { isUuid } from "@/lib/r2-policy";
import { DOC_PARENT_FIELD, DOC_SOURCES, mergeDocs, normalizeDoc, type DocSource, type RawDocRow, type UnifiedDoc } from "./document-access";

export type ReadClient = { from: (table: string) => any };

export type RelatedDocsContext = {
  /** A lead saját (bármely verziójú) ajánlatai és a belőle lett projekt is a kontextus része. */
  leadId?: string | null;
  projectIds?: (string | null | undefined)[];
  companyIds?: (string | null | undefined)[];
  quoteIds?: (string | null | undefined)[];
  /** Dokumentumtár oldal: a látható legutóbbi rekordok forrásonként (felső határral). */
  all?: boolean;
};

/** ok = teljes; truncated = elérte a felső határt; error = NINCS ADAT; skipped = nincs kapcsolódó rekord (NINCS ÖSSZEKÖTVE); hidden = a szerepkör felületén nem jelenik meg. */
export type SourceState = "ok" | "truncated" | "error" | "skipped" | "hidden";

export type RelatedDocsResult = {
  docs: UnifiedDoc[];
  states: Record<DocSource, SourceState>;
  limit: number;
};

export const RELATED_DOC_LIMIT = 200;
export const LIBRARY_DOC_LIMIT = 500;
const DOC_COLS: Record<DocSource, string> = {
  project_documents: "id,name,file_url,document_type,created_at,uploaded_by,project_id",
  company_documents: "id,name,file_url,document_type,created_at,uploaded_by,mime_type,size_bytes,source,company_id",
  quote_documents: "id,name,file_url,document_type,created_at,uploaded_by,mime_type,size_bytes,quote_id",
};

type Res<T> = { data: T | null; error: unknown };
async function safe<T>(p: PromiseLike<Res<T>>): Promise<T | undefined> {
  try {
    const r = await p;
    return r.error ? undefined : ((r.data ?? null) as T);
  } catch {
    return undefined;
  }
}

const uniq = (xs: (string | null | undefined)[] | undefined) => [...new Set((xs ?? []).filter(isUuid))];

export function quoteLabel(q: { title?: string | null; version?: number | null; alternative_key?: string | null }): string {
  const t = q.title?.trim() || "Ajánlat";
  const v = q.version != null ? ` v${q.version}` : "";
  const a = q.alternative_key ? ` · ${q.alternative_key} alt.` : "";
  return `${t}${v}${a}`;
}

async function labels(client: ReadClient, source: DocSource, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  if (!ids.length) return m;
  const ids100 = ids.slice(0, 300);
  if (source === "project_documents") {
    const r = await safe<any[]>(client.from("projects").select("id,title").in("id", ids100));
    for (const p of r ?? []) if (p?.id) m.set(p.id, p.title?.trim() || "Projekt");
  } else if (source === "company_documents") {
    const r = await safe<any[]>(client.from("companies").select("id,name").in("id", ids100));
    for (const c of r ?? []) if (c?.id) m.set(c.id, c.name?.trim() || "Ügyfél");
  } else {
    const r = await safe<any[]>(client.from("quotes").select("id,title,version,alternative_key").in("id", ids100));
    for (const q of r ?? []) if (q?.id) m.set(q.id, quoteLabel(q));
  }
  return m;
}

export async function loadRelatedDocs(
  client: ReadClient,
  ctx: RelatedDocsContext,
  sources: DocSource[],
  opts?: { limit?: number },
): Promise<RelatedDocsResult> {
  const limit = opts?.limit ?? (ctx.all ? LIBRARY_DOC_LIMIT : RELATED_DOC_LIMIT);
  const states: Record<DocSource, SourceState> = { project_documents: "hidden", company_documents: "hidden", quote_documents: "hidden" };
  const wanted = DOC_SOURCES.filter((s) => sources.includes(s));

  const ids: Record<DocSource, string[]> = {
    project_documents: uniq(ctx.projectIds),
    company_documents: uniq(ctx.companyIds),
    quote_documents: uniq(ctx.quoteIds),
  };
  const ctxError: Partial<Record<DocSource, boolean>> = {};

  // Lead → saját ajánlatai (minden verzió) és a megnyerésből lett projekt.
  if (!ctx.all && isUuid(ctx.leadId)) {
    const [q, p] = await Promise.all([
      wanted.includes("quote_documents") ? safe<any[]>(client.from("quotes").select("id").eq("lead_id", ctx.leadId).limit(RELATED_DOC_LIMIT)) : Promise.resolve([]),
      wanted.includes("project_documents") ? safe<any[]>(client.from("projects").select("id").eq("lead_id", ctx.leadId).limit(20)) : Promise.resolve([]),
    ]);
    if (q === undefined) ctxError.quote_documents = true;
    else ids.quote_documents = uniq([...ids.quote_documents, ...q.map((r) => r?.id)]);
    if (p === undefined) ctxError.project_documents = true;
    else ids.project_documents = uniq([...ids.project_documents, ...p.map((r) => r?.id)]);
  }

  const groups = await Promise.all(wanted.map(async (source): Promise<UnifiedDoc[]> => {
    const parentIds = ids[source];
    if (!ctx.all && !parentIds.length) {
      states[source] = ctxError[source] ? "error" : "skipped";
      return [];
    }
    let q = client.from(source).select(DOC_COLS[source]);
    if (!ctx.all) q = q.in(DOC_PARENT_FIELD[source], parentIds.slice(0, 300));
    const rows = await safe<RawDocRow[]>(q.order("created_at", { ascending: false }).limit(limit));
    if (rows === undefined) { states[source] = "error"; return []; }
    const list = (rows ?? []).filter((r) => r && typeof r.id === "string");
    states[source] = ctxError[source] ? "error" : list.length >= limit ? "truncated" : "ok";
    const parentField = DOC_PARENT_FIELD[source];
    const names = await labels(client, source, uniq(list.map((r) => r[parentField] as string | null)));
    return list.map((r) => normalizeDoc(source, r, names.get(r[parentField] as string) ?? null));
  }));

  return { docs: mergeDocs(groups), states, limit };
}

/** Rövid, felhasználói nyelvű forrásállapot. */
export function sourceStateText(state: SourceState, count: number, limit: number): string {
  switch (state) {
    case "ok": return `${count} fájl`;
    case "truncated": return `legutóbbi ${limit} fájl (a lista nem teljes)`;
    case "error": return "NINCS ADAT (nem tölthető be)";
    case "skipped": return "NINCS ÖSSZEKÖTVE";
    case "hidden": return "a szerepkörödnél nem jelenik meg";
  }
}
