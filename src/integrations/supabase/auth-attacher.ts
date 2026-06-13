/**
 * Kliens-oldali function middleware — minden `createServerFn` hívás elé
 * teszi a `Authorization: Bearer <token>` headert az aktuális Supabase
 * sessionből. Be kell regisztrálni a `startInstance` `functionMiddleware`
 * tömbjébe (`src/start.ts`).
 */
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "./client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next, context }) => {
    let headers: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // session nem elérhető (pl. SSR fallback) — header nélkül megyünk tovább
    }
    return next({ context, sendContext: { headers } as any, headers } as any);
  },
);