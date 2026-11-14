// Letöltés lemezre (SHA-256 közben), feltöltés aláírt PUT címre. A teljes fájl soha nincs egyben a memóriában.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function downloadTo(url: string, path: string, fetchImpl: typeof fetch = fetch): Promise<{ size: number; sha256: string }> {
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) throw new Error(`download_failed:${res.status}`);
  const h = createHash("sha256");
  let size = 0;
  const tap = new Transform({ transform(chunk, _e, cb) { h.update(chunk); size += chunk.length; cb(null, chunk); } });
  await pipeline(Readable.fromWeb(res.body as any), tap, createWriteStream(path));
  return { size, sha256: h.digest("hex") };
}

export async function sha256File(path: string): Promise<string> {
  const h = createHash("sha256");
  await pipeline(createReadStream(path), new Transform({ transform(c, _e, cb) { h.update(c); cb(); } }));
  return h.digest("hex");
}

export async function putFile(url: string, path: string, contentType: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const { size } = await stat(path);
  const res = await fetchImpl(url, {
    method: "PUT",
    headers: { "content-length": String(size), "content-type": contentType },
    body: Readable.toWeb(createReadStream(path)) as any,
    // @ts-ignore – Node fetch streamelt törzshöz
    duplex: "half",
  });
  if (!res.ok) throw new Error(`upload_failed:${res.status}`);
}

export async function putBytes(url: string, bytes: Uint8Array, contentType: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(url, { method: "PUT", headers: { "content-type": contentType }, body: bytes });
  if (!res.ok) throw new Error(`upload_failed:${res.status}`);
}
