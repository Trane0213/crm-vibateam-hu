import { createHash, createHmac } from "crypto";

// Cloudflare R2 S3-kompatibilis presigned URL generálás (AWS SigV4, query-string auth).
// Csak server-only — process.env hozzáférés.

function hmac(key: Buffer | string, data: string) {
  return createHmac("sha256", key).update(data).digest();
}
function sha256Hex(data: string) {
  return createHash("sha256").update(data).digest("hex");
}

function getEnv() {
  const accountId = process.env.R2_ACCOUNT_ID!;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY!;
  const bucket = process.env.R2_BUCKET!;
  const endpointEnv = (process.env.R2_ENDPOINT ?? "").replace(/\/+$/, "");
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("R2 nincs megfelelően konfigurálva (R2_ACCOUNT_ID/ACCESS/SECRET/BUCKET)");
  }
  // Endpoint: ha a user a bucket-URL-t adta meg, vágjuk le a /bucket részt.
  let endpoint = endpointEnv || `https://${accountId}.r2.cloudflarestorage.com`;
  try {
    const u = new URL(endpoint);
    // path nélkül akarjuk
    endpoint = `${u.protocol}//${u.host}`;
  } catch {
    /* ignore */
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, endpoint };
}

export type SignOptions = {
  method: "GET" | "PUT" | "DELETE";
  key: string;          // objektum kulcs (path) bucket-en belül
  expiresIn?: number;   // másodperc
  contentType?: string; // PUT esetén opcionális
};

/** AWS SigV4 query-string aláírás. Visszaad egy aláírt URL-t. */
export function presignR2Url(opts: SignOptions): string {
  const { method, key } = opts;
  const expiresIn = opts.expiresIn ?? 900;
  const { accessKeyId, secretAccessKey, bucket, endpoint } = getEnv();
  const region = "auto";
  const service = "s3";

  const url = new URL(endpoint);
  const host = url.host;
  // path-style: /<bucket>/<key>
  const encodedKey = key
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  const canonicalUri = `/${encodeURIComponent(bucket)}/${encodedKey}`;

  const now = new Date();
  const amzDate = now
    .toISOString()
    .replace(/[:-]|\.\d{3}/g, ""); // YYYYMMDDTHHMMSSZ
  const dateStamp = amzDate.slice(0, 8);

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const signedHeaders = "host";

  const params: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKeyId}/${credentialScope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expiresIn),
    "X-Amz-SignedHeaders": signedHeaders,
  };

  const sortedKeys = Object.keys(params).sort();
  const canonicalQueryString = sortedKeys
    .map(
      (k) =>
        encodeURIComponent(k).replace(/[!'()*]/g, escape) +
        "=" +
        encodeURIComponent(params[k]).replace(/[!'()*]/g, escape),
    )
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmac("AWS4" + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning)
    .update(stringToSign)
    .digest("hex");

  return `${endpoint}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

export function r2Status() {
  try {
    const e = getEnv();
    return { ok: true, bucket: e.bucket, endpoint: e.endpoint };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}