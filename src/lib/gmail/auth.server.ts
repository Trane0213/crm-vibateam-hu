/**
 * Server-side Supabase JWT verifikáció + state HMAC helper.
 * Csak server route handlerben hívható.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/integrations/supabase/client";

export async function getAuthedUserId(request: Request): Promise<string> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new Response("Unauthorized", { status: 401 });
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new Response("Unauthorized", { status: 401 });
  return data.user.id;
}

function stateSecret(): string {
  const s = process.env.GMAIL_STATE_SECRET || process.env.GMAIL_SUPABASE_SERVICE_KEY;
  if (!s) throw new Error("GMAIL_STATE_SECRET vagy GMAIL_SUPABASE_SERVICE_KEY szukseges.");
  return s;
}

function b64u(b: Buffer | string): string {
  const buf = typeof b === "string" ? Buffer.from(b, "utf8") : b;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function ub64u(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const mac = createHmac("sha256", stateSecret()).update(payload).digest();
  return `${b64u(payload)}.${b64u(mac)}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60 * 1000): string {
  const [p, m] = state.split(".");
  if (!p || !m) throw new Error("Hibas state");
  const payload = ub64u(p).toString("utf8");
  const mac = ub64u(m);
  const expected = createHmac("sha256", stateSecret()).update(payload).digest();
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) {
    throw new Error("Ervenytelen state alairas");
  }
  const [userId, tsStr] = payload.split(".");
  if (!userId || !tsStr) throw new Error("Hibas state payload");
  if (Date.now() - Number(tsStr) > maxAgeMs) throw new Error("Lejart state");
  return userId;
}
