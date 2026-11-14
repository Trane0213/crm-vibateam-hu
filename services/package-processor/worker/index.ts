// Cloudflare Worker + Durable Object, amely a feldolgozó tárolót indítja és életben tartja.
// A Worker csak aláírt POST /jobs kérést enged tovább; a tároló a feladat végéig fut (percenkénti
// ébresztő ellenőrzi, dolgozik-e még), utána tétlenségi idő után leáll.
import { DurableObject } from "cloudflare:workers";

interface Env {
  PROCESSOR: DurableObjectNamespace<PackageProcessor>;
  PROCESSOR_SECRET: string;
  INSTANCES?: string;
  ALLOWED_STORAGE_HOSTS?: string;
  ALLOWED_CALLBACK_ORIGINS?: string;
}

const PORT = 8080;
const IDLE_MS = 10 * 60 * 1000;
const enc = new TextEncoder();

async function verify(secret: string, body: string, header: string | null): Promise<boolean> {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=", 2)));
  const t = Number(parts.t);
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > 300 || !/^[0-9a-f]{64}$/.test(parts.v1 ?? "")) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ parts.v1.charCodeAt(i);
  return diff === 0;
}

export class PackageProcessor extends DurableObject<Env> {
  private starting: Promise<void> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const c = ctx.container;
    if (c?.running) void ctx.blockConcurrencyWhile(() => c.setInactivityTimeout(IDLE_MS));
  }

  private async ensureRunning(): Promise<void> {
    const c = this.ctx.container;
    if (!c) throw new Error("No container configured");
    if (!c.running) {
      this.starting ??= (async () => {
        c.start({
          image: c.images.base,
          instance: "standard-2",              // 1 vCPU, 6 GiB memória, 12 GB lemez – 1 GB-os fájlhoz
          enableInternet: true,                // csak aláírt R2-címek és a CRM visszajelzési címe
          env: { PROCESSOR_SECRET: this.env.PROCESSOR_SECRET, CONCURRENCY: "2", WORK_DIR: "/work", ALLOWED_STORAGE_HOSTS: this.env.ALLOWED_STORAGE_HOSTS ?? "", ALLOWED_CALLBACK_ORIGINS: this.env.ALLOWED_CALLBACK_ORIGINS ?? "" },
        });
        await c.setInactivityTimeout(IDLE_MS);
        const port = c.getTcpPort(PORT);
        for (let i = 0; i < 60; i++) {
          try { const r = await port.fetch("http://container/status"); if (r.ok) return; } catch { /* még indul */ }
          await new Promise((r) => setTimeout(r, 1000));
        }
        throw new Error("Container did not become ready");
      })().finally(() => { this.starting = null; });
    }
    if (this.starting) await this.starting;
  }

  async fetch(request: Request): Promise<Response> {
    await this.ensureRunning();
    const res = await this.ctx.container!.getTcpPort(PORT).fetch(new Request("http://container/jobs", request));
    if (res.ok) await this.ctx.storage.setAlarm(Date.now() + 60_000);
    return res;
  }

  async alarm(): Promise<void> {
    const c = this.ctx.container;
    if (!c?.running) return;
    try {
      const s = (await (await c.getTcpPort(PORT).fetch("http://container/status")).json()) as { busy: boolean };
      if (s.busy) await this.ctx.storage.setAlarm(Date.now() + 60_000);
    } catch { await this.ctx.storage.setAlarm(Date.now() + 60_000); }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/jobs") return new Response("Not found", { status: 404 });
    const body = await request.text();
    if (body.length > 64 * 1024 || !(await verify(env.PROCESSOR_SECRET, body, request.headers.get("x-viba-signature")))) return new Response("Unauthorized", { status: 401 });
    let jobId = "";
    try { jobId = String(JSON.parse(body).jobId ?? ""); } catch { return new Response("Bad request", { status: 400 }); }
    const n = Math.max(1, Math.min(20, Number(env.INSTANCES ?? 3)));
    let h = 0;
    for (const ch of jobId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const stub = env.PROCESSOR.getByName(`instance-${h % n}`);
    return stub.fetch(new Request(request.url, { method: "POST", headers: request.headers, body }));
  },
};
