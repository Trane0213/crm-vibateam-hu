/**
 * Server-only Supabase kliens factory-k.
 * SOHA ne importáld kliens bundle-be — csak `createServerFn` `.handler()`
 * body-ban vagy `*.server.ts` modulokban.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./client";

function requireServiceKey(): string {
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.GMAIL_SUPABASE_SERVICE_KEY;
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY (vagy GMAIL_SUPABASE_SERVICE_KEY) nincs beállítva.",
    );
  }
  return key;
}

/** Service role — bypassolja az RLS-t. Csak megbízható szerver kontextusban. */
export function getAdminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, requireServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Felhasználói JWT-vel hitelesített kliens — RLS a hívó user nevében fut.
 * A bearer token a request `Authorization` headeréből jön.
 */
export function getUserClient(accessToken: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

/** Bearer token feldolgozása + user lekérése — 401 dob, ha nincs vagy érvénytelen. */
export async function authenticateRequest(
  request: Request,
): Promise<{ userId: string; accessToken: string; supabase: SupabaseClient }> {
  const auth = request.headers.get("authorization") ?? "";
  const accessToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!accessToken) {
    throw new Response("Unauthorized: missing bearer token", { status: 401 });
  }
  const supabase = getUserClient(accessToken);
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data.user) {
    throw new Response("Unauthorized: invalid token", { status: 401 });
  }
  return { userId: data.user.id, accessToken, supabase };
}