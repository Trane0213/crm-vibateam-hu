/**
 * Server-only Supabase admin client. Csak server route / server fn
 * handlerben szabad importálni. SOHA ne kerüljön kliens bundle-be.
 */
import { createClient } from "@supabase/supabase-js";
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://uepqejecsiuhodegbcff.supabase.co";

export function getAdminClient() {
  const key = process.env.GMAIL_SUPABASE_SERVICE_KEY;
  if (!key) {
    throw new Error(
      "GMAIL_SUPABASE_SERVICE_KEY nincs beállítva — szükséges a Gmail callback/sync token írásához.",
    );
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
