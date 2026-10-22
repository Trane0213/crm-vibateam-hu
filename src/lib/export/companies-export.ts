/**
 * Cégek Excel-export.
 *
 * A `companies` tábla minden mezőjét, plusz a hozzájuk tartozó kapcsolattartókat,
 * érdeklődőket, projekteket, ajánlatokat és email-szálakat egy munkafüzetbe
 * írja. A letöltés böngészőben generált blob (nincs szerver oldal), az adatokat
 * a böngésző Supabase kliense olvassa, tehát az RLS szabályok érvényesülnek:
 * mindenki csak ahhoz fér hozzá, amit a CRM-ben egyébként is lát.
 */
import { supabase } from "@/integrations/supabase/client";
import { COMPANY_TYPE_LABEL } from "@/lib/viba-constants";
import { formatHuf } from "@/lib/format";

/** Ugyanaz a „aktív lead" definíció, mint a crm-surface / ügyfél lista alapján. */
const ACTIVE_LEAD_STATUSES = new Set(["new", "contacted", "qualified"]);
const OPEN_QUOTE_STATUSES = ["draft", "sent", "negotiation"];

type Row = Record<string, any>;

export type CompaniesExportResult = {
  filename: string;
  companies: number;
  contacts: number;
  leads: number;
  projects: number;
  quotes: number;
  threads: number;
};

const dateOnly = (v: any) => (v ? String(v).slice(0, 10) : "");
const label = (v: any, map: Record<string, string>) =>
  v == null || v === "" ? "" : (map[v] ?? String(v));

async function deliverFile(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = matchMedia("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as DOMException).name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function exportCompaniesToExcel(rows: Row[]): Promise<CompaniesExportResult> {
  const ids = new Set(rows.map((r) => r.id as string));
  const inIds = (col: string) => supabase.from(col).select();

  const [companiesRes, contactsRes, leadsRes, projectsRes, quotesRes, threadsRes, kpiRes] =
    await Promise.allSettled([
      supabase.from("companies").select("*").in("id", [...ids]),
      supabase.from("contacts").select("id,company_id,name,email,phone,created_at"),
      supabase.from("leads").select("id,company_id,contact_id,status,source,project_type,summary,created_at"),
      supabase.from("projects").select("id,company_id,title,status,created_at"),
      supabase
        .from("quotes")
        .select("id,project_id,status,total_amount,version,created_at")
        .in("status", OPEN_QUOTE_STATUSES),
      supabase.from("email_threads").select("id,company_id,subject,last_message_at"),
      supabase
        .from("customer_kpi_v")
        .select("customer_id,active_projects,total_projects,open_quotes,overdue_followups,last_activity_at"),
    ]);

  const val = <T,>(r: PromiseSettledResult<any>, fallback: T[]): T[] =>
    r.status === "fulfilled" ? (r.value.data ?? fallback) : fallback;

  const companies: Row[] = val(companiesRes, rows);
  const contacts: Row[] = val(contactsRes, []);
  const leads: Row[] = val(leadsRes, []);
  const projects: Row[] = val(projectsRes, []);
  const quotes: Row[] = val(quotesRes, []);
  const threads: Row[] = val(threadsRes, []);
  const kpis: Row[] = val(kpiRes, []);

  if (companiesRes.status === "rejected") throw new Error("Nem sikerült beolvasni a cégeket.");

  const nameOf = new Map(companies.map((c) => [c.id as string, String(c.name ?? "")]));
  const projectTitle = new Map(projects.map((p) => [p.id as string, String(p.title ?? "")]));
  const kpiOf = new Map(kpis.map((k) => [k.customer_id as string, k]));

  const countBy = (list: Row[], extra?: (r: Row) => boolean) => {
    const m = new Map<string, number>();
    for (const r of list) {
      if (!r.company_id || !ids.has(r.company_id)) continue;
      if (extra && !extra(r)) continue;
      m.set(r.company_id, (m.get(r.company_id) ?? 0) + 1);
    }
    return m;
  };

  const contactCount = countBy(contacts);
  const leadCount = countBy(leads, (r) => ACTIVE_LEAD_STATUSES.has(String(r.status)));
  const projectCount = countBy(projects);
  const threadCount = countBy(threads);
  const allLeadCount = countBy(leads);

  const pipeline = new Map<string, number>();
  const openQuotes = countBy(quotes);
  for (const q of quotes) {
    const cid = projects.find((p) => p.id === q.project_id)?.company_id;
    if (!cid || !ids.has(cid)) continue;
    pipeline.set(cid, (pipeline.get(cid) ?? 0) + Number(q.total_amount ?? 0));
  }

  const companySheet = companies.map((c) => {
    const k = kpiOf.get(c.id);
    return {
      "Cégnév": c.name ?? "",
      "Kategória": label(c.company_type, COMPANY_TYPE_LABEL),
      "Adószám": c.tax_number ?? "",
      "Weboldal": c.website ?? "",
      "Megjegyzés": c.notes ?? "",
      "Létrehozva": dateOnly(c.created_at),
      "Kapcsolattartók": contactCount.get(c.id) ?? 0,
      "Aktív lead": leadCount.get(c.id) ?? 0,
      "Összes lead": allLeadCount.get(c.id) ?? 0,
      "Projektek": projectCount.get(c.id) ?? 0,
      "Aktív projektek": k?.active_projects ?? 0,
      "Nyitott ajánlatok": openQuotes.get(c.id) ?? k?.open_quotes ?? 0,
      "Késésben lévő utánkövetések": k?.overdue_followups ?? 0,
      "Pipeline érték (HUF)": pipeline.get(c.id) ?? 0,
      "Email szálak": threadCount.get(c.id) ?? 0,
      "Utolsó aktivitás": dateOnly(k?.last_activity_at),
    };
  });

  const withCompany = (list: Row[]): Row[] =>
    list
      .filter((r) => r.company_id && ids.has(r.company_id))
      .map((r) => ({ "Cég": nameOf.get(r.company_id) ?? "", ...r }));

  const contactSheet = withCompany(contacts).map((r) => ({
    "Cég": r["Cég"],
    "Név": r.name ?? "",
    "Email": r.email ?? "",
    "Telefon": r.phone ?? "",
    "Létrehozva": dateOnly(r.created_at),
  }));

  const leadSheet = withCompany(leads).map((r) => ({
    "Cég": r["Cég"],
    "Státusz": r.status ?? "",
    "Forrás": r.source ?? "",
    "Projekt típus": r.project_type ?? "",
    "Összefoglaló": r.summary ?? "",
    "Létrehozva": dateOnly(r.created_at),
  }));

  const projectSheet = withCompany(projects).map((r) => ({
    "Cég": r["Cég"],
    "Projekt": r.title ?? "",
    "Státusz": r.status ?? "",
    "Létrehozva": dateOnly(r.created_at),
  }));

  const quoteSheet = quotes
    .filter((q) => {
      const cid = projects.find((p) => p.id === q.project_id)?.company_id;
      return cid && ids.has(cid);
    })
    .map((q) => {
      const cid = projects.find((p) => p.id === q.project_id)?.company_id;
      return {
        "Cég": nameOf.get(cid!) ?? "",
        "Projekt": projectTitle.get(q.project_id) ?? "",
        "Státusz": q.status ?? "",
        "Verzió": q.version ?? "",
        "Összeg (HUF)": Number(q.total_amount ?? 0),
        "Létrehozva": dateOnly(q.created_at),
      };
    });

  const threadSheet = withCompany(threads).map((r) => ({
    "Cég": r["Cég"],
    "Tárgy": r.subject ?? "",
    "Utolsó üzenet": dateOnly(r.last_message_at),
  }));

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const add = (sheet: Row[], name: string) => {
    const ws = XLSX.utils.json_to_sheet(sheet.length ? sheet : [{ "Nincs adat": "" }]);
    const cols = Object.keys(sheet[0] ?? { "Nincs adat": "" });
    ws["!cols"] = cols.map((c) => ({
      wch: Math.min(
        50,
        Math.max(
          c.length + 2,
          ...sheet.map((r) => String(r[c] ?? "").length + 2),
        ),
      ),
    }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add(companySheet, "Cégek");
  add(contactSheet, "Kapcsolattartók");
  add(leadSheet, "Leadok");
  add(projectSheet, "Projektek");
  add(quoteSheet, "Ajánlatok");
  add(threadSheet, "Email szálak");

  const buf: ArrayBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `viba-cegek-${stamp}.xlsx`;
  await deliverFile(
    new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );

  return {
    filename,
    companies: companySheet.length,
    contacts: contactSheet.length,
    leads: leadSheet.length,
    projects: projectSheet.length,
    quotes: quoteSheet.length,
    threads: threadSheet.length,
  };
}

/** Oszlopérték szöveges formázása (a céges lista oszlopaihoz). */
export const formatPipelineValue = (n: number) => (n > 0 ? formatHuf(n) : "0");
