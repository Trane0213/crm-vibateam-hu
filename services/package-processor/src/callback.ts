// Visszajelzés a CRM-nek (aláírva). Hálózati hibánál újrapróbál; 4xx-nél nem.
import { sign, SIGNATURE_HEADER } from "./hmac.ts";
import type { ProcessorJob } from "./types.ts";

export class CallbackError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export type Callback = (action: string, payload?: Record<string, unknown>) => Promise<any>;

export function makeCallback(job: ProcessorJob, secret: string, fetchImpl: typeof fetch = fetch): Callback {
  return async (action, payload = {}) => {
    const body = JSON.stringify({ jobId: job.jobId, token: job.token, action, ...payload });
    let last: unknown;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const res = await fetchImpl(job.callbackUrl, {
          method: "POST",
          headers: { "content-type": "application/json", [SIGNATURE_HEADER]: sign(secret, body) },
          body,
        });
        const text = await res.text();
        if (res.ok) return text ? JSON.parse(text) : {};
        if (res.status >= 400 && res.status < 500) throw new CallbackError(`CRM elutasította (${action}): ${res.status} ${text.slice(0, 300)}`, res.status);
        last = new CallbackError(`CRM hiba (${action}): ${res.status}`, res.status);
      } catch (e) {
        if (e instanceof CallbackError && e.status < 500) throw e;
        last = e;
      }
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
    throw last instanceof Error ? last : new Error(String(last));
  };
}
