/**
 * `createServerFn().middleware([requireSupabaseAuth])` — a handler context-jébe
 * teszi az authentikált `supabase` klienst, `userId`-t és az access tokent.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { authenticateRequest } from "./server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const request = getRequest();
    const { userId, accessToken, supabase } = await authenticateRequest(request).catch((error: unknown) => {
      // Raw HTTP Responses are for API routes, not serializable RPC results.
      if (error instanceof Response) {
        throw new Error(error.status === 401
          ? "A munkamenet ellenőrzése nem sikerült. Jelentkezz be újra."
          : "A szerveroldali hitelesítés nem sikerült.");
      }
      throw error;
    });
    return next({ context: { userId, accessToken, supabase } });
  },
);