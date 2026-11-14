/**
 * Szerepkörös dokumentumelérés (8. csomag) — tiszta, tesztelhető megjelenítési modell.
 *
 * A három meglévő dokumentumforrás (project_documents, company_documents,
 * quote_documents) sorait egységes alakra hozza, deduplikál, keres/szűr,
 * forrás- és kapcsolódórekord-hivatkozást ad, és a letöltési hibákat
 * felhasználói nyelvre fordítja.
 *
 * NEM ad jogosultságot: a sorokat a hívó a saját RLS-ével olvassa, a fájlt
 * kizárólag a meglévő `r2PresignDownload` nyitja meg (szerveroldali
 * láthatósági ellenőrzéssel). A szerepkör-tükrök (`documentSourcesForRole`,
 * `canUploadDoc`, `canDeleteDoc`) csak elrejtik azt, amit az adatbázis úgyis
 * elutasítana — sosem engednek többet.
 */
import { UPLOAD_ROLES, type UploadPurpose } from "@/lib/r2-policy";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";

export type DocSource = "project_documents" | "company_documents" | "quote_documents";
export const DOC_SOURCES: DocSource[] = ["project_documents", "quote_documents", "company_documents"];

export const DOC_SOURCE_LABEL: Record<DocSource, string> = {
  project_documents: "Projekt",
  company_documents: "Ügyfél / cég",
  quote_documents: "Ajánlat",
};
export const DOC_PARENT_FIELD: Record<DocSource, "project_id" | "company_id" | "quote_id"> = {
  project_documents: "project_id",
  company_documents: "company_id",
  quote_documents: "quote_id",
};
const SOURCE_PURPOSE: Record<DocSource, UploadPurpose> = {
  project_documents: "project",
  company_documents: "company",
  quote_documents: "quote",
};

/** Egységes kategóriacímkék (projekt, cég és ajánlat kategóriák egy helyen). */
export const DOC_CATEGORY_LABEL: Record<string, string> = {
  quote: "Ajánlat",
  contract: "Szerződés",
  plan: "Tervrajz",
  technical: "Műszaki dokumentáció",
  photo: "Fénykép",
  marketing: "Marketing anyag",
  other: "Egyéb",
  unpriced_budget: "Árazatlan költségvetés (megrendelőtől)",
  priced_budget: "Árazott Excel-költségvetés",
  technical_plan: "Műszaki terv / dokumentáció",
  technical_scope: "Műszaki lehatárolás",
  contract_terms: "Szerződési / fizetési feltételek",
  sent_offer: "Kiküldött ajánlat",
};
export function docCategoryLabel(c: string | null | undefined): string {
  const k = String(c ?? "other").toLowerCase();
  return DOC_CATEGORY_LABEL[k] ?? "Egyéb";
}

export type RawDocRow = {
  id: string;
  name?: string | null;
  file_url?: string | null;
  document_type?: string | null;
  created_at?: string | null;
  uploaded_by?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
  source?: string | null;
  project_id?: string | null;
  company_id?: string | null;
  quote_id?: string | null;
};

export type UnifiedDoc = {
  /** `${source}:${id}` — stabil, forrásonként egyedi kulcs. */
  uid: string;
  source: DocSource;
  id: string;
  name: string;
  nameMissing: boolean;
  fileKey: string | null;
  category: string;
  categoryLabel: string;
  parentId: string | null;
  parentLabel: string | null;
  createdAt: string | null;
  uploadedBy: string | null;
  sizeBytes: number | null;
  /** Ugyanaz a tárolt fájl ennyi további látható rekordban is szerepel (nem összevonás, csak jelzés). */
  sameFileCount: number;
};

export function normalizeDoc(source: DocSource, row: RawDocRow, parentLabel?: string | null): UnifiedDoc {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const key = typeof row.file_url === "string" && row.file_url.trim() ? row.file_url : null;
  const category = String(row.document_type ?? "other").toLowerCase() || "other";
  const parentId = (row[DOC_PARENT_FIELD[source]] as string | null | undefined) ?? null;
  return {
    uid: `${source}:${row.id}`,
    source,
    id: row.id,
    name: name || "Névtelen fájl",
    nameMissing: !name,
    fileKey: key,
    category,
    categoryLabel: docCategoryLabel(category),
    parentId,
    parentLabel: parentLabel ?? null,
    createdAt: row.created_at ?? null,
    uploadedBy: row.uploaded_by ?? null,
    sizeBytes: typeof row.size_bytes === "number" ? row.size_bytes : null,
    sameFileCount: 0,
  };
}

/**
 * Több forrás összefésülése: azonos rekord (forrás+id) csak egyszer szerepel;
 * ha ugyanaz a tárolt fájl több rekordhoz is tartozik, mind látszik, de jelölve
 * (`sameFileCount`) — nem vonunk össze és nem rejtünk el semmit. Újabb elöl.
 */
export function mergeDocs(groups: UnifiedDoc[][]): UnifiedDoc[] {
  const byUid = new Map<string, UnifiedDoc>();
  for (const g of groups) for (const d of g) if (!byUid.has(d.uid)) byUid.set(d.uid, { ...d });
  const list = [...byUid.values()];
  const perKey = new Map<string, number>();
  for (const d of list) if (d.fileKey) perKey.set(d.fileKey, (perKey.get(d.fileKey) ?? 0) + 1);
  for (const d of list) d.sameFileCount = d.fileKey ? (perKey.get(d.fileKey) ?? 1) - 1 : 0;
  return list.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || a.uid.localeCompare(b.uid));
}

/** Ékezet- és kisbetű-független keresőalak. */
export function searchKey(s: string | null | undefined): string {
  return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

export type DocFilter = { query?: string; category?: string | "all"; source?: DocSource | "all" };

export function filterDocs(docs: UnifiedDoc[], f: DocFilter): UnifiedDoc[] {
  const terms = searchKey(f.query).split(" ").filter(Boolean);
  return docs.filter((d) => {
    if (f.category && f.category !== "all" && d.category !== f.category) return false;
    if (f.source && f.source !== "all" && d.source !== f.source) return false;
    if (!terms.length) return true;
    const hay = searchKey(`${d.name} ${d.categoryLabel} ${d.parentLabel ?? ""} ${DOC_SOURCE_LABEL[d.source]}`);
    return terms.every((t) => hay.includes(t));
  });
}

export function categoryCounts(docs: UnifiedDoc[]): { category: string; label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const d of docs) m.set(d.category, (m.get(d.category) ?? 0) + 1);
  return [...m.entries()]
    .map(([category, count]) => ({ category, label: docCategoryLabel(category), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "hu"));
}

export function sourceCounts(docs: UnifiedDoc[]): Record<DocSource, number> {
  const r: Record<DocSource, number> = { project_documents: 0, company_documents: 0, quote_documents: 0 };
  for (const d of docs) r[d.source]++;
  return r;
}

export function formatBytes(n: number | null | undefined): string | null {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

// ---------------------------------------------------------------------------
// Kapcsolódó rekord
// ---------------------------------------------------------------------------

export type DocParentLink = { to: string; params: Record<string, string>; search?: Record<string, string>; label: string };

const PARENT_ROUTE: Record<DocSource, string> = {
  project_documents: "/projects",
  company_documents: "/customers",
  quote_documents: "/quotes",
};
const PARENT_KIND: Record<DocSource, string> = {
  project_documents: "Projekt",
  company_documents: "Ügyfél",
  quote_documents: "Ajánlat",
};

/** „NINCS ÖSSZEKÖTVE”, ha a rekord nem tartozik projekthez/céghez/ajánlathoz. */
export function docParentState(d: Pick<UnifiedDoc, "parentId">): "linked" | "not_linked" {
  return d.parentId ? "linked" : "not_linked";
}

/**
 * Hivatkozás a kapcsolódó rekordra — csak ha a néző szerepköre az útvonalat
 * megnyithatja (`canAccess` = meglévő `canAccessRoute`). Az adatot az RLS szűri.
 */
export function docParentLink(d: Pick<UnifiedDoc, "source" | "parentId" | "parentLabel">, canAccess: (path: string) => boolean): DocParentLink | null {
  if (!d.parentId || !canAccess(PARENT_ROUTE[d.source])) return null;
  const label = d.parentLabel?.trim() ? d.parentLabel : PARENT_KIND[d.source];
  switch (d.source) {
    case "project_documents": return { to: "/projects/$id", params: { id: d.parentId }, search: { tab: "docs" }, label };
    case "company_documents": return { to: "/customers/$id", params: { id: d.parentId }, label };
    case "quote_documents": return { to: "/quotes/$id", params: { id: d.parentId }, label };
  }
}

export function docParentKind(source: DocSource): string {
  return PARENT_KIND[source];
}

// ---------------------------------------------------------------------------
// Szerepkör-tükrök (a meglévő RLS és útvonal-szabályok; nem bővítenek)
// ---------------------------------------------------------------------------

/**
 * Mely forrásokat mutatja a felület az adott szerepkörnek a kapcsolódó-dokumentum
 * paneleken. Owner/PM/Sales: mind a három (az RLS tovább szűr: ajánlatnál
 * `can_access_quote`). Marketing: csak ügyfél/cég dokumentum — a meglévő
 * marketing-scope szerint (ügyfél adatlapon a projektdokumentumok eddig is rejtve).
 */
export function documentSourcesForRole(role: RoleSlug | null | undefined): DocSource[] {
  if (!role) return [];
  if (role === "owner" || role === "project_manager" || role === "sales") return [...DOC_SOURCES];
  return ["company_documents"];
}

const CRM_ROLE: Record<RoleSlug, string> = { owner: "owner", project_manager: "project_manager", sales: "sales", marketing: "marketing" };

/** Feltöltés gomb csak annak, akinek a meglévő `/api/r2-upload` és INSERT RLS megengedi. */
export function canUploadDoc(role: RoleSlug | null | undefined, source: DocSource): boolean {
  if (!role) return false;
  if (role === "owner") return true;
  return UPLOAD_ROLES[SOURCE_PURPOSE[source]].includes(CRM_ROLE[role]);
}

/**
 * Törlés gomb: tulajdonos vagy a feltöltő (a DELETE RLS tükre). Ajánlatnál a
 * zárolt „Kiküldött ajánlat” fájlt az adatbázis tulajdonosnak sem engedi —
 * ezt itt is elrejtjük, ha a zárolás ismert.
 */
export function canDeleteDoc(
  role: RoleSlug | null | undefined,
  profileId: string | null | undefined,
  d: Pick<UnifiedDoc, "source" | "uploadedBy" | "category">,
  opts?: { quoteLocked?: boolean },
): boolean {
  if (!role) return false;
  if (d.source === "quote_documents" && opts?.quoteLocked && d.category === "sent_offer") return false;
  if (role === "owner") return true;
  if (!profileId || d.uploadedBy !== profileId) return false;
  if (d.source === "quote_documents") return true;
  return canUploadDoc(role, d.source);
}

// ---------------------------------------------------------------------------
// Megnyitás / letöltés hibái
// ---------------------------------------------------------------------------

export type OpenFailureKind = "missing_file" | "no_access" | "invalid_key" | "storage" | "session" | "network" | "popup" | "unknown";
export type OpenFailure = { kind: OpenFailureKind; title: string; detail: string };

const FAILURE: Record<OpenFailureKind, Omit<OpenFailure, "kind">> = {
  missing_file: { title: "Nincs tárolt fájl", detail: "A dokumentumrekordhoz nem tartozik fájl (NINCS ADAT). Kérd meg a feltöltőt, hogy töltse fel újra." },
  no_access: { title: "Nincs hozzáférésed", detail: "A szerver nem engedi megnyitni ezt a fájlt a szerepköröddel. Ha szükséged van rá, kérd a tulajdonost." },
  invalid_key: { title: "Hibás fájlhivatkozás", detail: "A rekord fájlhivatkozása érvénytelen, a fájl nem nyitható meg. Jelezd a hibát a Segítség oldalon." },
  storage: { title: "A fájltár nem elérhető", detail: "A fájltároló most nem válaszol vagy nincs beállítva. Próbáld újra később." },
  session: { title: "Lejárt bejelentkezés", detail: "Jelentkezz be újra, majd nyisd meg ismét a fájlt." },
  network: { title: "Hálózati hiba", detail: "Nem sikerült elérni a szervert. Ellenőrizd a kapcsolatot, és próbáld újra." },
  popup: { title: "A böngésző letiltotta az új lapot", detail: "Engedélyezd a felugró ablakokat ennél az oldalnál, vagy használd a „Megnyitás most” gombot." },
  unknown: { title: "A fájl nem nyitható meg", detail: "Ismeretlen hiba történt. Próbáld újra; ha ismétlődik, jelezd a Segítség oldalon." },
};

export function openFailure(kind: OpenFailureKind): OpenFailure {
  return { kind, ...FAILURE[kind] };
}

/** A meglévő `r2PresignDownload` / hálózati hibák besorolása. */
export function classifyOpenError(e: unknown): OpenFailure {
  const msg = String((e as any)?.message ?? (e as any)?.error ?? e ?? "").toLowerCase();
  if (/nincs jogosultságod|permission denied|not authorized|forbidden|\b403\b/.test(msg)) return openFailure("no_access");
  if (/érvénytelen fájlkulcs|invalid key/.test(msg)) return openFailure("invalid_key");
  if (/hiányzó fájl|nem tartozik fájl|missing file/.test(msg)) return openFailure("missing_file");
  if (/r2|nincs megfelelően konfigurálva|storage|bucket/.test(msg)) return openFailure("storage");
  if (/jwt|unauthorized|\b401\b|not authenticated|auth session|munkamenet/.test(msg)) return openFailure("session");
  if (/failed to fetch|network|fetch failed|hálózati/.test(msg)) return openFailure("network");
  return openFailure("unknown");
}

// ---------------------------------------------------------------------------
// Dokumentumtár oldal (/documents) — útvonal-hozzáférés változatlan
// ---------------------------------------------------------------------------

export type DocHint = { label: string; to: string };

/**
 * Ha a Dokumentumtár oldal a szerepkörnek nem érhető el (a meglévő ROUTE_ACCESS
 * szerint jelenleg Sales és Marketing), hol éri el mégis a neki engedélyezett
 * dokumentumokat. Csak navigációs segítség; jogosultságot nem ad.
 */
export function documentLibraryHints(role: RoleSlug | null | undefined): DocHint[] {
  if (!role) return [];
  return rawHints(role).filter((h) => canAccessRoute(role, h.to));
}
function rawHints(role: RoleSlug): DocHint[] {
  if (role === "sales") return [
    { label: "Pipeline ügy → Ügy dokumentumai", to: "/sales/leads" },
    { label: "Ajánlat adatlap → Dokumentumok", to: "/quotes" },
    { label: "Ügyfél adatlap → Dokumentumok", to: "/customers" },
    { label: "Projekt adatlap → Dokumentumok fül", to: "/projects" },
  ];
  if (role === "marketing") return [
    { label: "Ügyfél / cég adatlap → Dokumentumok (marketing anyag, céges fájlok)", to: "/customers" },
    { label: "Érdeklődők feldolgozása → Dokumentumok fül", to: "/leads" },
  ];
  return [];
}

/** Kapcsolódó rekord nélküli dokumentum felirata. */
export const DOC_NOT_LINKED_TEXT: Record<DocSource, string> = {
  project_documents: "NINCS ÖSSZEKÖTVE – nincs projekthez kötve",
  company_documents: "NINCS ÖSSZEKÖTVE – nincs ügyfélhez kötve",
  quote_documents: "NINCS ÖSSZEKÖTVE – nincs ajánlathoz kötve",
};
