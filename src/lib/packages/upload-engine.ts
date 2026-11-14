// P1 – böngészőoldali feltöltőmotor: ellenőrzőösszeg, darabolás, közvetlen R2-feltöltés
// tartalék szerveres továbbítással, újrapróbálás, folytatás. Az átvitel (transport)
// injektálható, így a motor tesztelhető hálózat nélkül.
import { createMD5, createSHA256 } from "hash-wasm";
import { normalizeRelativePath, partRange, type RegisterResult } from "./package-policy";

export type LocalFile = { blob: Blob; relativePath: string; lastModified: number; mime: string | null };

export class DirectBlocked extends Error { constructor() { super("direct_blocked"); this.name = "DirectBlocked"; } }
export class UploadAborted extends Error { constructor() { super("aborted"); this.name = "UploadAborted"; } }

export type Transport = {
  register(files: { relativePath: string; size: number; lastModified: number; mime: string | null; sha256: string }[]): Promise<RegisterResult[]>;
  sign(fileId: string, parts: number[]): Promise<{ partNumber: number; url: string }[]>;
  /** Közvetlen PUT az aláírt URL-re. CORS/elérési hiba esetén DirectBlocked-ot dob. */
  putDirect(url: string, body: Blob, signal?: AbortSignal): Promise<void>;
  relay(fileId: string, partNumber: number, md5: string, body: Blob, signal?: AbortSignal): Promise<void>;
  record(fileId: string, parts: { partNumber: number; size: number; md5: string }[]): Promise<void>;
  complete(fileId: string): Promise<{ ok: boolean; badParts?: number[]; failed?: boolean }>;
};

export type FileOutcome =
  | { relativePath: string; state: "verified"; fileId: string; uploadedBytes: number; resumedParts: number }
  | { relativePath: string; state: "already"; fileId: string }
  | { relativePath: string; state: "duplicate"; fileId: string; ofPath: string | null }
  | { relativePath: string; state: "rejected"; reason: string }
  | { relativePath: string; state: "failed"; reason: string; fileId?: string };

export type EngineEvent =
  | { type: "hash"; relativePath: string; done: number; total: number }
  | { type: "progress"; relativePath: string; sentBytes: number; totalBytes: number }
  | { type: "file"; outcome: FileOutcome }
  | { type: "mode"; mode: "direct" | "relay" };

const HASH_SLICE = 8 * 1024 * 1024;

export async function sha256OfBlob(blob: Blob, onProgress?: (done: number) => void, signal?: AbortSignal): Promise<string> {
  const h = await createSHA256();
  h.init();
  for (let off = 0; off < blob.size; off += HASH_SLICE) {
    if (signal?.aborted) throw new UploadAborted();
    h.update(new Uint8Array(await blob.slice(off, Math.min(blob.size, off + HASH_SLICE)).arrayBuffer()));
    onProgress?.(Math.min(blob.size, off + HASH_SLICE));
  }
  return h.digest("hex");
}

export async function md5OfBytes(bytes: Uint8Array): Promise<string> {
  const h = await createMD5();
  h.init(); h.update(bytes);
  return h.digest("hex");
}

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((res, rej) => {
  const t = setTimeout(res, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); rej(new UploadAborted()); }, { once: true });
});

export type EngineOptions = {
  transport: Transport; concurrency?: number; maxAttempts?: number; backoffMs?: number;
  onEvent?: (e: EngineEvent) => void; signal?: AbortSignal; initialMode?: "direct" | "relay";
};

/** Egy csomag fájljainak feltöltése (vagy folytatása). A szerver dönt a duplikációról és a folytatható darabokról. */
export async function uploadFiles(files: LocalFile[], opts: EngineOptions): Promise<FileOutcome[]> {
  const { transport, signal } = opts;
  const emit = opts.onEvent ?? (() => {});
  const concurrency = Math.max(1, Math.min(6, opts.concurrency ?? 3));
  const maxAttempts = opts.maxAttempts ?? 5;
  const backoff = opts.backoffMs ?? 1000;
  let mode: "direct" | "relay" = opts.initialMode ?? "direct";
  const switchToRelay = () => { if (mode === "relay") return; mode = "relay"; emit({ type: "mode", mode: "relay" }); };

  // 1) Ellenőrzőösszegek (SHA-256) a teljes fájlokra.
  const prepared: { local: LocalFile; path: string; sha256: string }[] = [];
  const outcomes: FileOutcome[] = [];
  for (const local of files) {
    let path: string;
    try { path = normalizeRelativePath(local.relativePath); } catch { const o: FileOutcome = { relativePath: local.relativePath, state: "rejected", reason: "bad_path" }; outcomes.push(o); emit({ type: "file", outcome: o }); continue; }
    const sha256 = await sha256OfBlob(local.blob, (done) => emit({ type: "hash", relativePath: path, done, total: local.blob.size }), signal);
    prepared.push({ local, path, sha256 });
  }

  // 2) Regisztráció 100-as kötegekben.
  const plans = new Map<string, RegisterResult>();
  for (let i = 0; i < prepared.length; i += 100) {
    if (signal?.aborted) throw new UploadAborted();
    const batch = prepared.slice(i, i + 100);
    const res = await transport.register(batch.map((p) => ({ relativePath: p.path, size: p.local.blob.size, lastModified: p.local.lastModified, mime: p.local.mime, sha256: p.sha256 })));
    for (const r of res) plans.set(r.relativePath, r);
  }

  // 3) Feltöltés fájlonként, a darabok párhuzamosan.
  for (const p of prepared) {
    if (signal?.aborted) throw new UploadAborted();
    const plan = plans.get(p.path);
    let outcome: FileOutcome;
    if (!plan) outcome = { relativePath: p.path, state: "failed", reason: "not_registered" };
    else if (plan.action === "reject") outcome = { relativePath: p.path, state: "rejected", reason: plan.reason };
    else if (plan.action === "duplicate") outcome = { relativePath: p.path, state: "duplicate", fileId: plan.fileId, ofPath: plan.ofPath };
    else if (plan.action === "verified") outcome = { relativePath: p.path, state: "already", fileId: plan.fileId };
    else {
      try { outcome = await uploadOne(p, plan); }
      catch (e) {
        if (e instanceof UploadAborted) throw e;
        outcome = { relativePath: p.path, state: "failed", fileId: plan.fileId, reason: (e as Error)?.message?.includes("integrity") ? "integrity" : "network" };
      }
    }
    outcomes.push(outcome);
    emit({ type: "file", outcome });
  }
  return outcomes;

  async function uploadOne(p: { local: LocalFile; path: string }, plan: Extract<RegisterResult, { action: "upload" | "resume" }>): Promise<FileOutcome> {
    const size = p.local.blob.size;
    const done = new Set(plan.doneParts);
    let sent = [...done].reduce((s, n) => { const r = partRange(size, plan.partSize, n); return s + (r.end - r.start); }, 0);
    emit({ type: "progress", relativePath: p.path, sentBytes: sent, totalBytes: size });

    const sendParts = async (numbers: number[]) => {
      const queue = [...numbers];
      const urls = new Map<number, string>();
      const worker = async () => {
        while (queue.length) {
          if (signal?.aborted) throw new UploadAborted();
          const n = queue.shift()!;
          const { start, end } = partRange(size, plan.partSize, n);
          const slice = p.local.blob.slice(start, end);
          const md5 = await md5OfBytes(new Uint8Array(await slice.arrayBuffer()));
          for (let attempt = 1; ; attempt++) {
            try {
              if (mode === "direct") {
                if (!urls.has(n)) {
                  const want = [n, ...queue.slice(0, 19)].filter((x) => !urls.has(x));
                  for (const s of await transport.sign(plan.fileId, want)) urls.set(s.partNumber, s.url);
                }
                try { await transport.putDirect(urls.get(n)!, slice, signal); }
                catch (e) {
                  if (!(e instanceof DirectBlocked)) throw e;
                  // A tárhely ezt a címet nem engedi közvetlenül: tartalék út a szerveren át.
                  await transport.relay(plan.fileId, n, md5, slice, signal);
                  switchToRelay();
                }
              } else {
                await transport.relay(plan.fileId, n, md5, slice, signal);
              }
              await transport.record(plan.fileId, [{ partNumber: n, size: end - start, md5 }]);
              break;
            } catch (e) {
              if (e instanceof UploadAborted || signal?.aborted) throw new UploadAborted();
              if (attempt >= maxAttempts) throw e;
              urls.delete(n);
              await sleep(backoff * 2 ** (attempt - 1), signal);
            }
          }
          sent += end - start;
          emit({ type: "progress", relativePath: p.path, sentBytes: sent, totalBytes: size });
        }
      };
      await Promise.all(Array.from({ length: Math.min(concurrency, numbers.length) }, worker));
    };

    const todo = Array.from({ length: plan.partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
    await sendParts(todo);
    for (let round = 0; round < 2; round++) {
      const r = await transport.complete(plan.fileId);
      if (r.ok) return { relativePath: p.path, state: "verified", fileId: plan.fileId, uploadedBytes: todo.length ? sent : 0, resumedParts: done.size };
      if (r.failed || !r.badParts?.length) break;
      // A szerver eltérést talált: csak az érintett darabok újra.
      for (const n of r.badParts) { const rr = partRange(size, plan.partSize, n); sent -= rr.end - rr.start; }
      await sendParts(r.badParts);
    }
    return { relativePath: p.path, state: "failed", fileId: plan.fileId, reason: "integrity" };
  }
}
