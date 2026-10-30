// R2 dokumentumvédelem (1/C) — tiszta, tesztelhető szabályok. Szerver- és kliensbiztos.
// A szerepkörök az 1/B adatbázis-szabályokkal egyeznek.

export type UploadPurpose = "project" | "company" | "outbound";

export const PROJECT_DOC_CATEGORIES = ["quote", "contract", "plan", "technical", "photo", "other"] as const;
export const COMPANY_DOC_CATEGORIES = [...PROJECT_DOC_CATEGORIES, "marketing"] as const;

/** Szerepkörök, amelyek az adott célra feltölthetnek (crm_role_of értékek; tulajdonost külön ellenőrizzük). */
export const UPLOAD_ROLES: Record<UploadPurpose, readonly string[]> = {
  project: ["project_manager", "pm", "sales"],
  company: ["project_manager", "pm", "sales", "marketing"],
  outbound: ["project_manager", "pm", "sales", "marketing"],
};

export const MAX_BYTES: Record<UploadPurpose, number> = {
  project: 50 * 1024 * 1024,
  company: 50 * 1024 * 1024,
  outbound: 20 * 1024 * 1024,
};

/** Engedélyezett kiterjesztések → elfogadott MIME-típusok (üres MIME is elfogadott, ha a kiterjesztés rendben van). */
const ALLOWED: Record<string, string[]> = {
  pdf: ["application/pdf"],
  png: ["image/png"], jpg: ["image/jpeg"], jpeg: ["image/jpeg"], gif: ["image/gif"], webp: ["image/webp"],
  heic: ["image/heic", "image/heif"], heif: ["image/heic", "image/heif"],
  doc: ["application/msword"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  xls: ["application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ppt: ["application/vnd.ms-powerpoint"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  odt: ["application/vnd.oasis.opendocument.text"], ods: ["application/vnd.oasis.opendocument.spreadsheet"],
  txt: ["text/plain"], csv: ["text/csv", "application/vnd.ms-excel", "text/plain"],
  zip: ["application/zip", "application/x-zip-compressed"],
  dwg: ["image/vnd.dwg", "application/acad", "application/x-dwg"], dxf: ["image/vnd.dxf", "application/dxf"],
  ics: ["text/calendar"], eml: ["message/rfc822"],
};
const GENERIC_MIME = ["", "application/octet-stream"];

export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(-150);
  return cleaned || "file";
}

export function checkFile(purpose: UploadPurpose, name: string, mime: string, size: number): string | null {
  if (!Number.isFinite(size) || size <= 0) return "Üres fájl nem tölthető fel.";
  if (size > MAX_BYTES[purpose]) return `A fájl túl nagy (max ${MAX_BYTES[purpose] / 1024 / 1024} MB).`;
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  const allowed = ALLOWED[ext];
  if (!allowed || !name.includes(".")) return "Nem engedélyezett fájltípus.";
  const m = (mime ?? "").toLowerCase().split(";")[0].trim();
  if (!GENERIC_MIME.includes(m) && !allowed.includes(m)) return "A fájl típusa nem egyezik a kiterjesztéssel.";
  return null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** A tárolási útvonalat mindig a szerver állítja elő — a kliens nem adhat meg kulcsot. */
export function buildKey(args: {
  purpose: UploadPurpose; targetId: string | null; category: string; userId: string; fileName: string; unique: string;
}): string {
  const safe = safeFileName(args.fileName);
  const stamp = `${Date.now()}-${args.unique}`;
  if (args.purpose === "project") return `${args.targetId ?? "global"}/${args.category}/${stamp}-${safe}`;
  if (args.purpose === "company") return `company-documents/${args.targetId}/${args.category}/${stamp}-${safe}`;
  return `outbound-attachments/${args.userId}/${stamp}-${safe}`;
}

/** Kimenő levélmelléklet csak a küldő saját feltöltése lehet. */
export function isOwnOutboundKey(key: string, userId: string): boolean {
  return typeof key === "string" && key.startsWith(`outbound-attachments/${userId}/`) && !key.includes("..");
}
