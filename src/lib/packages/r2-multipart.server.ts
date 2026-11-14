// P1 – Cloudflare R2 többrészes (multipart) feltöltés, S3-kompatibilis API, AWS SigV4.
// Csak szerveroldalon: a kliens soha nem kap általános kulcsot, csak egy adott
// darabra szóló, rövid életű aláírt URL-t.
import { createHash, createHmac } from "crypto";
import { r2Env } from "@/lib/r2.server";

const REGION = "auto";
const SERVICE = "s3";

const hmac = (key: Buffer | string, data: string) => createHmac("sha256", key).update(data).digest();
const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());

function canonicalUri(bucket: string, key: string) {
  return `/${enc(bucket)}/${key.split("/").map(enc).join("/")}`;
}
function canonicalQuery(q: Record<string, string>) {
  return Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join("&");
}
function signingKey(secret: string, date: string) {
  return hmac(hmac(hmac(hmac("AWS4" + secret, date), REGION), SERVICE), "aws4_request");
}
function stamp() {
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz, date: amz.slice(0, 8) };
}

/** Aláírt URL (query-string hitelesítés), tetszőleges további query paraméterrel. */
export function presign(method: "GET" | "PUT" | "DELETE" | "HEAD", key: string, extra: Record<string, string> = {}, expiresIn = 900): string {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = r2Env();
  const host = new URL(endpoint).host;
  const { amz, date } = stamp();
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const q: Record<string, string> = {
    ...extra,
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256", "X-Amz-Credential": `${accessKeyId}/${scope}`,
    "X-Amz-Date": amz, "X-Amz-Expires": String(expiresIn), "X-Amz-SignedHeaders": "host",
  };
  const uri = canonicalUri(bucket, key);
  const cq = canonicalQuery(q);
  const creq = [method, uri, cq, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(creq)].join("\n");
  const sig = createHmac("sha256", signingKey(secretAccessKey, date)).update(sts).digest("hex");
  return `${endpoint}${uri}?${cq}&X-Amz-Signature=${sig}`;
}

/** Fejléces hitelesítésű kérés (szerver → R2), aláírt törzzsel. */
async function call(method: string, key: string, query: Record<string, string>, body?: string, contentType?: string): Promise<Response> {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = r2Env();
  const host = new URL(endpoint).host;
  const { amz, date } = stamp();
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`;
  const payloadHash = sha256Hex(body ?? "");
  const headers: Record<string, string> = { host, "x-amz-content-sha256": payloadHash, "x-amz-date": amz };
  if (contentType) headers["content-type"] = contentType;
  const names = Object.keys(headers).sort();
  const cheaders = names.map((n) => `${n}:${headers[n].trim()}\n`).join("");
  const signed = names.join(";");
  const uri = canonicalUri(bucket, key);
  const cq = canonicalQuery(query);
  const creq = [method, uri, cq, cheaders, signed, payloadHash].join("\n");
  const sts = ["AWS4-HMAC-SHA256", amz, scope, sha256Hex(creq)].join("\n");
  const sig = createHmac("sha256", signingKey(secretAccessKey, date)).update(sts).digest("hex");
  const { host: _h, ...send } = headers;
  return fetch(`${endpoint}${uri}${cq ? `?${cq}` : ""}`, {
    method,
    headers: { ...send, authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${sig}` },
    body,
  });
}

export class R2Error extends Error { constructor(message: string, public status = 502) { super(message); } }

const tag = (xml: string, name: string) => { const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`)); return m ? m[1] : null; };

export function parseUploadId(xml: string): string {
  const id = tag(xml, "UploadId");
  if (!id) throw new R2Error("A tárhely nem adott feltöltési azonosítót");
  return id;
}

export type R2Part = { partNumber: number; etag: string; size: number };
/** ListParts XML → darabok. Az ETag idézőjelek nélkül, kisbetűvel (egyrészes darabnál = a darab MD5-je). */
export function parseListParts(xml: string): { parts: R2Part[]; truncated: boolean; next: number | null } {
  const parts: R2Part[] = [];
  for (const m of xml.matchAll(/<Part>([\s\S]*?)<\/Part>/g)) {
    const p = m[1];
    parts.push({ partNumber: Number(tag(p, "PartNumber")), etag: normEtag(tag(p, "ETag") ?? ""), size: Number(tag(p, "Size")) });
  }
  const next = tag(xml, "NextPartNumberMarker");
  return { parts, truncated: tag(xml, "IsTruncated") === "true", next: next ? Number(next) : null };
}
export function normEtag(e: string): string {
  return e.replace(/&quot;/g, "").replace(/"/g, "").trim().toLowerCase();
}

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const res = await call("POST", key, { uploads: "" }, "", undefined);
  // A Content-Type a lezáráskor nem módosítható; a böngészőben a letöltési link a fájlnévből dolgozik.
  void contentType;
  if (!res.ok) throw new R2Error(`Tárhely: többrészes feltöltés nem indítható (${res.status})`);
  return parseUploadId(await res.text());
}

export function presignPart(key: string, uploadId: string, partNumber: number, expiresIn = 3600): string {
  return presign("PUT", key, { partNumber: String(partNumber), uploadId }, expiresIn);
}

export async function listParts(key: string, uploadId: string): Promise<R2Part[]> {
  const all: R2Part[] = [];
  let marker: number | null = null;
  for (let guard = 0; guard < 20; guard++) {
    const q: Record<string, string> = { uploadId, "max-parts": "1000" };
    if (marker) q["part-number-marker"] = String(marker);
    const res = await call("GET", key, q);
    if (res.status === 404) throw new R2Error("A félbehagyott feltöltés lejárt a tárhelyen", 410);
    if (!res.ok) throw new R2Error(`Tárhely: darablista nem olvasható (${res.status})`);
    const page = parseListParts(await res.text());
    all.push(...page.parts);
    if (!page.truncated || !page.next) break;
    marker = page.next;
  }
  return all.sort((a, b) => a.partNumber - b.partNumber);
}

export function completeXml(parts: readonly { partNumber: number; etag: string }[]): string {
  return `<CompleteMultipartUpload>${parts.map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>"${p.etag}"</ETag></Part>`).join("")}</CompleteMultipartUpload>`;
}

export async function completeMultipart(key: string, uploadId: string, parts: readonly { partNumber: number; etag: string }[]): Promise<void> {
  const res = await call("POST", key, { uploadId }, completeXml(parts), "application/xml");
  const text = await res.text();
  // Az S3 200-as válaszban is küldhet <Error>-t.
  if (!res.ok || /<Error>/.test(text)) throw new R2Error(`Tárhely: a feltöltés nem zárható le (${res.status})`);
}

export async function abortMultipart(key: string, uploadId: string): Promise<void> {
  const res = await call("DELETE", key, { uploadId });
  if (!res.ok && res.status !== 404) throw new R2Error(`Tárhely: a félbehagyott feltöltés nem törölhető (${res.status})`);
}

export async function headObject(key: string): Promise<{ size: number } | null> {
  const res = await fetch(presign("HEAD", key, {}, 60), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new R2Error(`Tárhely: a fájl nem ellenőrizhető (${res.status})`);
  return { size: Number(res.headers.get("content-length") ?? "-1") };
}

/** Tartalék út: a szerver továbbít egy darabot (korlátozott méret), és visszaadja az ETag-et. */
export async function putPartRelay(key: string, uploadId: string, partNumber: number, body: ArrayBuffer): Promise<string> {
  const res = await fetch(presignPart(key, uploadId, partNumber, 300), { method: "PUT", body });
  if (!res.ok) throw new R2Error(`Tárhely: a darab nem tölthető fel (${res.status})`);
  return normEtag(res.headers.get("etag") ?? "");
}
