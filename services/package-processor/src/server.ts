// A tárolóban futó HTTP-szolgáltatás. Csak aláírt feladatot fogad; a feldolgozás háttérben fut,
// a CRM a visszajelzésekből látja az állapotot. Port: 8080.
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { verify, SIGNATURE_HEADER } from "./hmac.ts";
import { allowFromEnv, isJob, jobAllowed, type ProcessorJob } from "./types.ts";
import { runJob } from "./job.ts";

const SECRET = process.env.PROCESSOR_SECRET ?? "";
const ALLOW = allowFromEnv(process.env);
const WORK = process.env.WORK_DIR ?? tmpdir();
const CONCURRENCY = Math.max(1, Math.min(4, Number(process.env.CONCURRENCY ?? 2)));
const queue: ProcessorJob[] = [];
const running = new Set<string>();

function pump() {
  while (running.size < CONCURRENCY && queue.length) {
    const job = queue.shift()!;
    running.add(job.jobId);
    runJob(job, { secret: SECRET, workDir: WORK, allow: ALLOW }).finally(() => { running.delete(job.jobId); pump(); });
  }
}

const server = createServer(async (req, res) => {
  const send = (status: number, obj: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  if (req.method === "GET" && req.url === "/status") return send(200, { busy: running.size + queue.length > 0, running: running.size, queued: queue.length });
  if (req.method !== "POST" || req.url !== "/jobs") return send(404, { error: "not_found" });
  const chunks: Buffer[] = [];
  let len = 0;
  for await (const c of req) { len += c.length; if (len > 64 * 1024) return send(413, { error: "too_large" }); chunks.push(c as Buffer); }
  const body = Buffer.concat(chunks).toString("utf8");
  if (!SECRET || !verify(SECRET, body, req.headers[SIGNATURE_HEADER] as string)) return send(401, { error: "bad_signature" });
  let job: unknown;
  try { job = JSON.parse(body); } catch { return send(400, { error: "bad_json" }); }
  if (!isJob(job)) return send(400, { error: "bad_job" });
  if (!jobAllowed(job, ALLOW)) return send(403, { error: "url_not_allowed" });
  if (running.has(job.jobId) || queue.some((q) => q.jobId === job.jobId)) return send(202, { accepted: true, duplicate: true });
  queue.push(job);
  pump();
  return send(202, { accepted: true });
});

server.listen(Number(process.env.PORT ?? 8080), () => console.log("package-processor listening"));
