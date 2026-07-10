import { createFileRoute } from "@tanstack/react-router";
import { authenticateRequest } from "@/integrations/supabase/server";
import { signState } from "@/lib/google-ads/auth.server";
import { buildAuthorizationUrl, buildRedirectUri } from "@/lib/google-ads/oauth.server";

export const Route = createFileRoute("/api/google-ads/oauth/start")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { userId } = await authenticateRequest(request);
          let loginHint: string | undefined;
          try { loginHint = ((await request.json()) as any)?.loginHint; } catch { /* empty body */ }
          const url = buildAuthorizationUrl({
            state: signState(userId),
            redirectUri: buildRedirectUri(request),
            loginHint,
          });
          return Response.json({ authorizationUrl: url });
        } catch (e: any) {
          if (e instanceof Response) return e;
          return Response.json({ error: e?.message ?? String(e) }, { status: 500 });
        }
      },
    },
  },
});